import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { DatabaseConnection } from './database.connection';
import { DatabaseMigrator } from './database.migrator';

@Module({
  imports: [ConfigModule],
  providers: [DatabaseConnection, DatabaseMigrator],
  exports: [DatabaseConnection, DatabaseMigrator],
})
export class DatabaseModule {}
