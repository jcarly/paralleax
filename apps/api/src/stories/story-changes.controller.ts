import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type RequestUser } from '../auth/auth.decorators';
import { StoryChangesService } from './application/story-changes';
import { CommitStoryChangesDto, PreviewStoryChangesDto } from './dto/story-changes.dto';
import { STORY_MUTATION_RATE_LIMIT } from './stories.controller';

/** Editorial change batches: preview without writing, then commit (ADR-050). */
@Throttle({ default: { limit: STORY_MUTATION_RATE_LIMIT, ttl: 60_000 } })
@Controller('stories/:storyId/changes')
export class StoryChangesController {
  constructor(private readonly changes: StoryChangesService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @Param('storyId') storyId: string,
    @Body() input: PreviewStoryChangesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.changes.preview(storyId, input, user.id);
  }

  @Post('commit')
  @HttpCode(HttpStatus.OK)
  commit(
    @Param('storyId') storyId: string,
    @Body() input: CommitStoryChangesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.changes.commit(storyId, input, user.id);
  }
}
