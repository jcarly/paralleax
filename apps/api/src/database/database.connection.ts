import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class DatabaseConnection implements OnModuleDestroy {
  readonly pool: Pool;

  constructor(config: AppConfigService) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.postgresSsl
        ? {
            rejectUnauthorized: true,
            ...(config.postgresSslCa ? { ca: config.postgresSslCa } : {}),
          }
        : undefined,
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
