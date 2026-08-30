import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StoriesController } from './stories.controller';
import { StoriesRepository } from './stories.repository';
import { StoriesService } from './stories.service';
import { StoryEventsService } from './story.events';
import { ChoiceScriptImportService } from './application/choicescript-import';
import { StoryAccessService } from './application/story-access';
import { StoryContextService } from './application/story-context';
import { StoryGraphService } from './application/story-graph';
import { StoryHistoryService } from './application/story-history';
import { StoryMetadataService } from './application/story-metadata';
import { StoryMutationService } from './application/story-mutations';
import { StoryReaderProgressService } from './application/story-reader-progress';

@Module({
  imports: [DatabaseModule],
  controllers: [StoriesController],
  providers: [
    StoriesRepository,
    StoriesService,
    StoryEventsService,
    ChoiceScriptImportService,
    StoryAccessService,
    StoryContextService,
    StoryGraphService,
    StoryHistoryService,
    StoryMetadataService,
    StoryMutationService,
    StoryReaderProgressService,
  ],
  exports: [StoriesRepository],
})
export class StoriesModule {}
