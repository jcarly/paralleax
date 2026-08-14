import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  commentAnchorBelongsToStory,
  commentAnchorLabel,
  isCommentAnchor,
  isCommentAnchorDetached,
  MAX_COMMENT_BODY_LENGTH,
  type CommentAnchor,
  type Story,
} from '@paralleax/shared';
import { randomUUID } from 'crypto';
import type { RequestUser } from '../auth/auth.decorators';
import { StoriesRepository } from '../stories/stories.repository';
import { CommentsRepository } from './comments.repository';
import { CommentEventsService, type CommentChangeType } from './comments.events';

@Injectable()
export class CommentsService {
  constructor(
    private readonly comments: CommentsRepository,
    private readonly stories: StoriesRepository,
    private readonly events: CommentEventsService,
  ) {}

  async list(storyId: string, actor: RequestUser) {
    const story = await this.storyFor(storyId, actor);
    this.assertCanView(story);
    return (await this.comments.list(storyId)).map((thread) => ({
      ...thread,
      detached: isCommentAnchorDetached(story, thread.anchor),
    }));
  }

  async stream(storyId: string, actor: RequestUser) {
    const story = await this.storyFor(storyId, actor);
    this.assertCanView(story);
    return this.events.stream(storyId);
  }

  async create(storyId: string, anchor: CommentAnchor, body: string, actor: RequestUser) {
    const story = await this.storyFor(storyId, actor);
    this.assertCanComment(story);
    this.assertAnchor(story, anchor);
    const timestamp = new Date().toISOString();
    const thread = await this.comments.create({
      id: randomUUID(),
      storyId,
      anchor,
      anchorLabel: commentAnchorLabel(story, anchor),
      authorId: actor.id,
      messageId: randomUUID(),
      body: cleanBody(body),
      timestamp,
    });
    return this.changed(storyId, thread, 'thread-created');
  }

  async addMessage(storyId: string, threadId: string, body: string, actor: RequestUser) {
    const story = await this.storyFor(storyId, actor);
    this.assertCanComment(story);
    await this.threadFor(storyId, threadId);
    const thread = await this.comments.addMessage({
      id: randomUUID(),
      storyId,
      threadId,
      authorId: actor.id,
      body: cleanBody(body),
      timestamp: new Date().toISOString(),
    });
    return this.changed(storyId, thread, 'message-added');
  }

  async updateStatus(
    storyId: string,
    threadId: string,
    status: 'open' | 'resolved',
    actor: RequestUser,
  ) {
    const story = await this.storyFor(storyId, actor);
    const thread = await this.threadFor(storyId, threadId);
    if (
      !story.capabilities?.canManage &&
      !story.capabilities?.canEdit &&
      thread.createdBy.id !== actor.id
    ) {
      throw new ForbiddenException('Resolving this comment is not permitted');
    }
    const updated = await this.comments.updateStatus(
      storyId,
      threadId,
      status,
      actor.id,
      new Date().toISOString(),
    );
    return this.changed(storyId, updated, 'status-changed');
  }

  async updateAnchor(storyId: string, threadId: string, anchor: CommentAnchor, actor: RequestUser) {
    const story = await this.storyFor(storyId, actor);
    const thread = await this.threadFor(storyId, threadId);
    if (
      !story.capabilities?.canManage &&
      !story.capabilities?.canEdit &&
      thread.createdBy.id !== actor.id
    ) {
      throw new ForbiddenException('Moving this comment is not permitted');
    }
    this.assertAnchor(story, anchor);
    const updated = await this.comments.updateAnchor(
      storyId,
      threadId,
      anchor,
      commentAnchorLabel(story, anchor),
      new Date().toISOString(),
    );
    return this.changed(storyId, updated, 'anchor-changed');
  }

  private changed<T extends { id: string } | undefined>(
    storyId: string,
    thread: T,
    change: CommentChangeType,
  ): T {
    if (thread) {
      this.events.publish({
        storyId,
        threadId: thread.id,
        change,
        occurredAt: new Date().toISOString(),
      });
    }
    return thread;
  }

  private async storyFor(storyId: string, actor: RequestUser) {
    const story = await this.stories.find(storyId, actor.id);
    if (!story) throw new NotFoundException('Story not found');
    return story;
  }

  private async threadFor(storyId: string, threadId: string) {
    const thread = await this.comments.find(storyId, threadId);
    if (!thread) throw new NotFoundException('Comment thread not found');
    return thread;
  }

  private assertCanView(story: Story) {
    if (
      !story.capabilities?.canManage &&
      !story.capabilities?.canEdit &&
      !story.capabilities?.canComment
    ) {
      throw new ForbiddenException('Viewing comments is not permitted');
    }
  }

  private assertCanComment(story: Story) {
    if (!story.capabilities?.canComment) {
      throw new ForbiddenException('Commenting is not permitted');
    }
  }

  private assertAnchor(story: Story, anchor: CommentAnchor) {
    if (!isCommentAnchor(anchor) || !commentAnchorBelongsToStory(story, anchor)) {
      throw new NotFoundException('Comment target not found in this story');
    }
    if (anchor.kind === 'text' && isCommentAnchorDetached(story, anchor)) {
      throw new BadRequestException('Selected comment text was not found');
    }
  }
}

function cleanBody(body: string) {
  const cleaned = body.trim();
  if (!cleaned || cleaned.length > MAX_COMMENT_BODY_LENGTH) {
    throw new BadRequestException('Comment body is invalid');
  }
  return cleaned;
}
