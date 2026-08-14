import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StoriesModule } from '../stories/stories.module';
import { CommentsController } from './comments.controller';
import { CommentEventsService } from './comments.events';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';

@Module({
  imports: [DatabaseModule, StoriesModule],
  controllers: [CommentsController],
  providers: [CommentsRepository, CommentEventsService, CommentsService],
})
export class CommentsModule {}
