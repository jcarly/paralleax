import { Injectable } from '@nestjs/common';
import { DatabaseConnection } from './database.connection';
import { DatabaseMigrator } from './database.migrator';

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

@Injectable()
export class AuthRepository {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly migrator: DatabaseMigrator,
  ) {}

  async findUserByEmail(email: string): Promise<AuthUser | undefined> {
    await this.migrator.run();
    const result = await this.database.pool.query<{
      id: string;
      email: string;
      password_hash: string;
      created_at: Date;
    }>('SELECT id, email, password_hash, created_at FROM users WHERE email = $1', [email]);
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          email: row.email,
          passwordHash: row.password_hash,
          createdAt: row.created_at.toISOString(),
        }
      : undefined;
  }

  async createUser(user: AuthUser): Promise<boolean> {
    await this.migrator.run();
    const result = await this.database.pool.query(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [user.id, user.email, user.passwordHash, user.createdAt],
    );
    return result.rowCount === 1;
  }

  async createSession(session: {
    id: string;
    userId: string;
    tokenHash: string;
    createdAt: string;
    expiresAt: string;
  }): Promise<void> {
    await this.migrator.run();
    await this.database.pool.query(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.id, session.userId, session.tokenHash, session.createdAt, session.expiresAt],
    );
  }

  async findUserBySessionHash(tokenHash: string): Promise<AuthUser | undefined> {
    await this.migrator.run();
    const result = await this.database.pool.query<{
      id: string;
      email: string;
      password_hash: string;
      created_at: Date;
    }>(
      `SELECT users.id, users.email, users.password_hash, users.created_at
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
          createdAt: row.created_at.toISOString(),
        }
      : undefined;
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.migrator.run();
    await this.database.pool.query('DELETE FROM sessions WHERE expires_at <= now()');
  }

  async claimMigratedStories(userId: string): Promise<number> {
    await this.migrator.run();
    const result = await this.database.pool.query(
      `UPDATE stories
       SET creator_user_id = $1
       WHERE creator_user_id = 'migration-user'`,
      [userId],
    );
    return result.rowCount ?? 0;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.migrator.run();
    await this.database.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }
}
