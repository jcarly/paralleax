import { Module } from '@nestjs/common';
import { DatabaseConnection } from './database.connection';
import { DatabaseMigrator } from './database.migrator';
import { StoriesController } from './stories.controller';
import { StoriesRepository } from './stories.repository';
import { StoriesService } from './stories.service';

@Module({
  controllers: [StoriesController],
  providers: [DatabaseConnection, DatabaseMigrator, StoriesRepository, StoriesService],
})
export class AppModule {}
