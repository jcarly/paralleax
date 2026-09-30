import { Injectable } from '@nestjs/common';
import type { UserRole } from '@paralleax/shared';
import type { PoolClient } from 'pg';
import { DatabaseConnection } from '../database/database.connection';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  emailVerifiedAt?: string;
}

export type ManagedUser = Omit<AuthUser, 'passwordHash'>;
export type AccountActionTokenKind = 'verify_email' | 'reset_password';

interface AuthUserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  email_verified_at: Date | null;
}

interface ManagedUserRow {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  created_at: Date;
  email_verified_at: Date | null;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseConnection) {}

  async findUserByEmail(email: string): Promise<AuthUser | undefined> {
    const result = await this.database.pool.query<AuthUserRow>(
      `SELECT id, email, display_name, password_hash, role, created_at, email_verified_at
       FROM users WHERE email = $1`,
      [email],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async findUserById(id: string): Promise<AuthUser | undefined> {
    const result = await this.database.pool.query<AuthUserRow>(
      `SELECT id, email, display_name, password_hash, role, created_at, email_verified_at
       FROM users WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async createUser(
    user: Omit<AuthUser, 'role' | 'emailVerifiedAt'>,
  ): Promise<AuthUser | undefined> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('paralleax-admin-roles'))");
      const result = await client.query<AuthUserRow>(
        `INSERT INTO users (id, email, display_name, password_hash, role, created_at)
         VALUES (
           $1, $2, $3, $4,
           CASE WHEN EXISTS (SELECT 1 FROM users WHERE role = 'admin')
             THEN 'user' ELSE 'admin' END,
           $5
         )
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, display_name, password_hash, role, created_at, email_verified_at`,
        [user.id, user.email, user.displayName, user.passwordHash, user.createdAt],
      );
      await client.query('COMMIT');
      return result.rows[0] ? mapUser(result.rows[0]) : undefined;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listUsers(): Promise<ManagedUser[]> {
    const result = await this.database.pool.query<ManagedUserRow>(
      `SELECT id, email, display_name, role, created_at, email_verified_at
       FROM users ORDER BY created_at, email`,
    );
    return result.rows.map(mapManagedUser);
  }

  async updateUserRole(id: string, role: UserRole): Promise<ManagedUser | undefined> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('paralleax-admin-roles'))");
      const result = await client.query<ManagedUserRow>(
        `UPDATE users AS target
         SET role = $2
         WHERE target.id = $1
           AND (
             $2 = 'admin'
             OR target.role <> 'admin'
             OR EXISTS (
               SELECT 1 FROM users AS another_admin
               WHERE another_admin.role = 'admin' AND another_admin.id <> target.id
             )
           )
         RETURNING id, email, display_name, role, created_at, email_verified_at`,
        [id, role],
      );
      await client.query('COMMIT');
      return result.rows[0] ? mapManagedUser(result.rows[0]) : undefined;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateDisplayName(id: string, displayName: string): Promise<ManagedUser | undefined> {
    const result = await this.database.pool.query<ManagedUserRow>(
      `UPDATE users
       SET display_name = $2
       WHERE id = $1
       RETURNING id, email, display_name, role, created_at, email_verified_at`,
      [id, displayName],
    );
    return result.rows[0] ? mapManagedUser(result.rows[0]) : undefined;
  }

  async createSession(session: {
    id: string;
    userId: string;
    tokenHash: string;
    createdAt: string;
    expiresAt: string;
  }): Promise<void> {
    await this.database.pool.query(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.id, session.userId, session.tokenHash, session.createdAt, session.expiresAt],
    );
  }

  async findUserBySessionHash(tokenHash: string): Promise<AuthUser | undefined> {
    const result = await this.database.pool.query<AuthUserRow>(
      `SELECT users.id, users.email, users.display_name, users.password_hash,
              users.role, users.created_at, users.email_verified_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
      [tokenHash],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.database.pool.query('DELETE FROM sessions WHERE expires_at <= now()');
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.database.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  async deleteOtherSessions(userId: string, currentTokenHash: string): Promise<void> {
    await this.database.pool.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [
      userId,
      currentTokenHash,
    ]);
  }

  async deleteExpiredAccountActionTokens(): Promise<void> {
    await this.database.pool.query('DELETE FROM account_action_tokens WHERE expires_at <= now()');
  }

  async createOrReplaceAccountActionToken(token: {
    id: string;
    userId: string;
    kind: AccountActionTokenKind;
    tokenHash: string;
    createdAt: string;
    expiresAt: string;
  }): Promise<void> {
    await this.database.pool.query(
      `INSERT INTO account_action_tokens
         (id, user_id, kind, token_hash, created_at, expires_at, consumed_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL)
       ON CONFLICT (user_id, kind) DO UPDATE
       SET id = EXCLUDED.id,
           token_hash = EXCLUDED.token_hash,
           created_at = EXCLUDED.created_at,
           expires_at = EXCLUDED.expires_at,
           consumed_at = NULL`,
      [token.id, token.userId, token.kind, token.tokenHash, token.createdAt, token.expiresAt],
    );
  }

  async verifyEmailWithActionToken(tokenHash: string, now: string): Promise<AuthUser | undefined> {
    return this.consumeAccountActionToken(tokenHash, 'verify_email', now, (client, userId) =>
      client.query<AuthUserRow>(
        `UPDATE users
         SET email_verified_at = COALESCE(email_verified_at, $2)
         WHERE id = $1
         RETURNING id, email, display_name, password_hash, role, created_at, email_verified_at`,
        [userId, now],
      ),
    );
  }

  async resetPasswordWithActionToken(
    tokenHash: string,
    passwordHash: string,
    now: string,
  ): Promise<AuthUser | undefined> {
    return this.consumeAccountActionToken(
      tokenHash,
      'reset_password',
      now,
      async (client, userId) => {
        const result = await client.query<AuthUserRow>(
          `UPDATE users
         SET password_hash = $2
         WHERE id = $1
         RETURNING id, email, display_name, password_hash, role, created_at, email_verified_at`,
          [userId, passwordHash],
        );
        if (result.rows[0]) {
          await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
        }
        return result;
      },
    );
  }

  async updatePasswordAndRevokeSessions(userId: string, passwordHash: string): Promise<void> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
        userId,
        passwordHash,
      ]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async consumeAccountActionToken(
    tokenHash: string,
    kind: AccountActionTokenKind,
    now: string,
    apply: (client: PoolClient, userId: string) => Promise<{ rows: AuthUserRow[] }>,
  ): Promise<AuthUser | undefined> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const token = await client.query<{ user_id: string }>(
        `UPDATE account_action_tokens
         SET consumed_at = $3
         WHERE token_hash = $1 AND kind = $2 AND consumed_at IS NULL AND expires_at > $3
         RETURNING user_id`,
        [tokenHash, kind, now],
      );
      if (!token.rows[0]) {
        await client.query('COMMIT');
        return undefined;
      }
      const result = await apply(client, token.rows[0].user_id);
      await client.query('COMMIT');
      return result.rows[0] ? mapUser(result.rows[0]) : undefined;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

function mapUser(row: AuthUserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at.toISOString(),
    ...(row.email_verified_at ? { emailVerifiedAt: row.email_verified_at.toISOString() } : {}),
  };
}

function mapManagedUser(row: ManagedUserRow): ManagedUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at.toISOString(),
    ...(row.email_verified_at ? { emailVerifiedAt: row.email_verified_at.toISOString() } : {}),
  };
}
