import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StoriesController } from './stories.controller';
import { StoriesRepository } from './stories.repository';
import { StoriesService } from './stories.service';
import { StoryEventsService } from './story.events';

@Module({
  imports: [DatabaseModule],
  controllers: [StoriesController],
  providers: [StoriesRepository, StoriesService, StoryEventsService],
  exports: [StoriesRepository],
})
export class StoriesModule {}
