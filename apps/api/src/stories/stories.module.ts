import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StoriesController } from './stories.controller';
import { StoriesRepository } from './stories.repository';
import { StoriesService } from './stories.service';

@Module({
  imports: [DatabaseModule],
  controllers: [StoriesController],
  providers: [StoriesRepository, StoriesService],
})
export class StoriesModule {}
