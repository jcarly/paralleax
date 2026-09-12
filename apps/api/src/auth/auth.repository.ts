import { Injectable } from '@nestjs/common';
import type { UserRole } from '@paralleax/shared';
import { DatabaseConnection } from '../database/database.connection';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

export type ManagedUser = Omit<AuthUser, 'passwordHash'>;

interface AuthUserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
}

interface ManagedUserRow {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  created_at: Date;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseConnection) {}

  async findUserByEmail(email: string): Promise<AuthUser | undefined> {
    const result = await this.database.pool.query<AuthUserRow>(
      'SELECT id, email, display_name, password_hash, role, created_at FROM users WHERE email = $1',
      [email],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async createUser(user: Omit<AuthUser, 'role'>): Promise<AuthUser | undefined> {
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
         RETURNING id, email, display_name, password_hash, role, created_at`,
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
      'SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at, email',
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
         RETURNING id, email, display_name, role, created_at`,
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
       RETURNING id, email, display_name, role, created_at`,
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
              users.role, users.created_at
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
}

function mapUser(row: AuthUserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}

function mapManagedUser(row: ManagedUserRow): ManagedUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}
