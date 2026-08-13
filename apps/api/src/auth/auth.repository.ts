import { Injectable } from '@nestjs/common';
import type { UserRole } from '@paralleax/shared';
import { DatabaseConnection } from '../database/database.connection';

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

export type ManagedUser = Omit<AuthUser, 'passwordHash'>;

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseConnection) {}

  async findUserByEmail(email: string): Promise<AuthUser | undefined> {
    const result = await this.database.pool.query<{
      id: string;
      email: string;
      password_hash: string;
      role: UserRole;
      created_at: Date;
    }>('SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1', [email]);
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          email: row.email,
          passwordHash: row.password_hash,
          role: row.role,
          createdAt: row.created_at.toISOString(),
        }
      : undefined;
  }

  async createUser(user: Omit<AuthUser, 'role'>): Promise<AuthUser | undefined> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('paralleax-admin-roles'))");
      const result = await client.query<{
        id: string;
        email: string;
        password_hash: string;
        role: UserRole;
        created_at: Date;
      }>(
        `INSERT INTO users (id, email, password_hash, role, created_at)
         VALUES (
           $1, $2, $3,
           CASE WHEN EXISTS (SELECT 1 FROM users WHERE role = 'admin')
             THEN 'user' ELSE 'admin' END,
           $4
         )
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, password_hash, role, created_at`,
        [user.id, user.email, user.passwordHash, user.createdAt],
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
    const result = await this.database.pool.query<{
      id: string;
      email: string;
      role: UserRole;
      created_at: Date;
    }>('SELECT id, email, role, created_at FROM users ORDER BY created_at, email');
    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async updateUserRole(id: string, role: UserRole): Promise<ManagedUser | undefined> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('paralleax-admin-roles'))");
      const result = await client.query<{
        id: string;
        email: string;
        role: UserRole;
        created_at: Date;
      }>(
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
         RETURNING id, email, role, created_at`,
        [id, role],
      );
      await client.query('COMMIT');
      const row = result.rows[0];
      return row
        ? { id: row.id, email: row.email, role: row.role, createdAt: row.created_at.toISOString() }
        : undefined;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
    const result = await this.database.pool.query<{
      id: string;
      email: string;
      password_hash: string;
      role: UserRole;
      created_at: Date;
    }>(
      `SELECT users.id, users.email, users.password_hash, users.role, users.created_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
      [tokenHash],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          email: row.email,
          passwordHash: row.password_hash,
          role: row.role,
          createdAt: row.created_at.toISOString(),
        }
      : undefined;
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.database.pool.query('DELETE FROM sessions WHERE expires_at <= now()');
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.database.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }
}

function mapUser(row: {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
}): AuthUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}
