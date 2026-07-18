import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseConnection implements OnModuleDestroy {
  readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://paralleax:paralleax@localhost:5432/paralleax',
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  async onModuleDestroy() {
    await this.pool.end();
  }
}
