import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StoriesController } from './stories.controller';
import { StoriesRepository } from './stories.repository';
import { StoriesService } from './stories.service';
import { StoryEventsService } from './story.events';
import { ChoiceScriptImportService } from './application/choicescript-import';

@Module({
  imports: [DatabaseModule],
  controllers: [StoriesController],
  providers: [StoriesRepository, StoriesService, StoryEventsService, ChoiceScriptImportService],
  exports: [StoriesRepository],
})
export class StoriesModule {}
