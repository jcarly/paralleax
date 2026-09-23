import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../auth/auth.decorators';
import { CommentsService } from './comments.service';
import {
  AddCommentMessageDto,
  CreateCommentThreadDto,
  UpdateCommentThreadAnchorDto,
  UpdateCommentThreadStatusDto,
} from './dto/comments.dto';

@Controller('stories/:storyId/comment-threads')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  list(
    @Param('storyId') storyId: string,
    @Query('includeDeleted') includeDeleted: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.comments.list(storyId, actor, includeDeleted === 'true');
  }

  @Sse('events')
  @Header('X-Accel-Buffering', 'no')
  stream(@Param('storyId') storyId: string, @CurrentUser() actor: RequestUser) {
    return this.comments.stream(storyId, actor);
  }

  @Post()
  create(
    @Param('storyId') storyId: string,
    @Body() input: CreateCommentThreadDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.comments.create(storyId, input.anchor, input.body, actor);
  }

  @Post(':threadId/messages')
  addMessage(
    @Param('storyId') storyId: string,
    @Param('threadId') threadId: string,
    @Body() input: AddCommentMessageDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.comments.addMessage(storyId, threadId, input.body, actor);
  }

  @Patch(':threadId/status')
  updateStatus(
    @Param('storyId') storyId: string,
    @Param('threadId') threadId: string,
    @Body() input: UpdateCommentThreadStatusDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.comments.updateStatus(storyId, threadId, input.status, actor);
  }

  @Patch(':threadId/anchor')
  updateAnchor(
    @Param('storyId') storyId: string,
    @Param('threadId') threadId: string,
    @Body() input: UpdateCommentThreadAnchorDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.comments.updateAnchor(storyId, threadId, input.anchor, actor);
  }

  @Delete(':threadId')
  delete(
    @Param('storyId') storyId: string,
    @Param('threadId') threadId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.comments.delete(storyId, threadId, actor);
  }

  @Patch(':threadId/restore')
  restore(
    @Param('storyId') storyId: string,
    @Param('threadId') threadId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.comments.restore(storyId, threadId, actor);
  }
}
