import {
  applyStoryChangeDelta,
  createStoryChangeDelta,
  createStoryHistoryMutationResult,
  READER_AUTOSAVE_ID,
  defaultStoryAccess,
  invertStoryChangeDelta,
  readerSaveKind,
  resolveStoryAccess,
  type ReaderProgressState,
  type ReaderSave,
  type Story,
  type StoryChangeDelta,
  type StoryAccessConfiguration,
  type StoryAccessSettings,
  type StoryCollaboratorRole,
  type StorySummary,
  type StoryHistory,
  type StoryHistoryEventKind,
  type StoryHistoryMutationResult,
} from '@paralleax/shared';

interface MemoryStoryHistoryEvent {
  id: string;
  revision: number;
  kind: StoryHistoryEventKind;
  operation: string;
  changes: StoryChangeDelta;
  actorUserId: string;
  createdAt: string;
  revertsEventId?: string;
}

export class InMemoryStoriesRepository {
  private readonly stories = new Map<string, Story>();
  private readonly owners = new Map<string, string>();
  private readonly mutationQueues = new Map<string, Promise<void>>();
  private readonly progress = new Map<string, ReaderSave>();
  private readonly permissions = new Map<string, Map<string, StoryCollaboratorRole>>();
  private readonly history = new Map<string, MemoryStoryHistoryEvent[]>();
  private nextHistoryId = 1;

  async list(ownerId: string): Promise<StorySummary[]> {
    return [...this.stories.entries()]
      .filter(([id, story]) => this.can(story, id, ownerId).canRead)
      .map(([id, story]) => ({
        id: story.id,
        revision: story.revision,
        title: story.title,
        interactionCount: story.interactions.length,
        startDateTime: story.startDateTime,
        access: story.access ?? defaultStoryAccess,
        capabilities: this.can(story, id, ownerId),
        owner: { id: this.owners.get(id)!, email: emailForUser(this.owners.get(id)!) },
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
      }));
  }

  async listPublic(): Promise<StorySummary[]> {
    return [...this.stories.entries()]
      .filter(([, story]) => (story.access ?? defaultStoryAccess).visibility === 'public')
      .map(([, story]) => ({
        id: story.id,
        revision: story.revision,
        title: story.title,
        interactionCount: story.interactions.length,
        startDateTime: story.startDateTime,
        access: story.access ?? defaultStoryAccess,
        capabilities: resolveStoryAccess(story.access ?? defaultStoryAccess, {
          authenticated: false,
        }),
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
      }));
  }

  async find(id: string, ownerId?: string): Promise<Story | undefined> {
    const story = this.stories.get(id);
    if (!story || !this.can(story, id, ownerId).canRead) return undefined;
    return structuredClone({
      ...story,
      access: story.access ?? defaultStoryAccess,
      capabilities: this.can(story, id, ownerId),
      owner: { id: this.owners.get(id)!, email: emailForUser(this.owners.get(id)!) },
    });
  }

  async save(story: Story, ownerId: string): Promise<void> {
    this.stories.set(story.id, structuredClone(story));
    this.owners.set(story.id, ownerId);
  }

  async saveMany(stories: readonly Story[], ownerId: string): Promise<void> {
    for (const story of stories) await this.save(story, ownerId);
  }

  async mutate(
    id: string,
    mutation: (story: Story) => Story | Promise<Story>,
    ownerId: string,
  ): Promise<Story | undefined> {
    return this.serializeMutation(id, async () => {
      const candidate = this.stories.get(id);
      const story = candidate && this.can(candidate, id, ownerId).canEdit ? candidate : undefined;
      if (!story) return undefined;
      const updated = await mutation(structuredClone(story));
      const changes = createStoryChangeDelta(story, updated);
      this.stories.set(id, structuredClone(updated));
      if (changes && updated.revision !== story.revision && updated.revision !== undefined) {
        this.appendHistory(id, {
          actorUserId: ownerId,
          revision: updated.revision,
          kind: 'change',
          operation: 'story.updated',
          changes,
          createdAt: updated.updatedAt,
        });
      }
      return structuredClone(updated);
    });
  }

  async getHistory(id: string, userId: string, limit = 50): Promise<StoryHistory | undefined> {
    const story = this.stories.get(id);
    if (!story || !this.can(story, id, userId).canEdit) return undefined;
    return this.historyFor(id, userId, limit);
  }

  async revertHistory(
    id: string,
    userId: string,
    action: 'undo' | 'redo',
  ): Promise<
    | { kind: 'applied'; result: StoryHistoryMutationResult }
    | { kind: 'unavailable' }
    | { kind: 'conflict'; paths: string[] }
    | undefined
  > {
    return this.serializeMutation(id, async () => {
      const current = this.stories.get(id);
      if (!current || !this.can(current, id, userId).canEdit) return undefined;
      const events = this.history.get(id) ?? [];
      const reversedEventIds = new Set(
        events.flatMap(({ revertsEventId }) => (revertsEventId ? [revertsEventId] : [])),
      );
      const candidate = [...events]
        .reverse()
        .find(
          (event) =>
            event.actorUserId === userId &&
            !reversedEventIds.has(event.id) &&
            (action === 'undo' ? event.kind !== 'undo' : event.kind === 'undo'),
        );
      if (!candidate) return { kind: 'unavailable' as const };
      const reverted = applyStoryChangeDelta(current, candidate.changes, 'backward');
      if (!reverted.applied) {
        return {
          kind: 'conflict' as const,
          paths: reverted.conflicts.map(({ path }) => path),
        };
      }
      const updated = reverted.story;
      updated.updatedAt = new Date().toISOString();
      updated.revision = (current.revision ?? 1) + 1;
      const changes = invertStoryChangeDelta(candidate.changes);
      this.stories.set(id, structuredClone(updated));
      this.appendHistory(id, {
        actorUserId: userId,
        revision: updated.revision,
        kind: action,
        operation: candidate.operation,
        changes,
        createdAt: updated.updatedAt,
        revertsEventId: candidate.id,
      });
      const story = await this.find(id, userId);
      if (!story) return undefined;
      return {
        kind: 'applied' as const,
        result: createStoryHistoryMutationResult(
          current,
          story,
          changes,
          this.historyFor(id, userId),
        ),
      };
    });
  }

  async delete(id: string, ownerId: string): Promise<boolean> {
    const story = this.stories.get(id);
    if (!story || !this.can(story, id, ownerId).canManage) return false;
    this.owners.delete(id);
    this.history.delete(id);
    for (const key of this.progress.keys()) {
      if (key.includes(`:${id}:`)) this.progress.delete(key);
    }
    return this.stories.delete(id);
  }

  async findProgress(
    storyId: string,
    userId: string,
    slotId = READER_AUTOSAVE_ID,
  ): Promise<ReaderSave | undefined> {
    const story = this.stories.get(storyId);
    if (!story || !this.can(story, storyId, userId).canRead) return undefined;
    const progress = this.progress.get(progressKey(userId, storyId, slotId));
    return progress ? structuredClone(progress) : undefined;
  }

  async findProgressSaves(storyId: string, userId: string): Promise<ReaderSave[]> {
    const story = this.stories.get(storyId);
    if (!story || !this.can(story, storyId, userId).canRead) return [];
    const prefix = `${userId}:${storyId}:`;
    return [...this.progress.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, save]) => save)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((save) => structuredClone(save));
  }

  async saveProgress(
    storyId: string,
    userId: string,
    state: ReaderProgressState,
    updatedAt: string,
    slotId = READER_AUTOSAVE_ID,
    name?: string,
    createdAt = updatedAt,
  ): Promise<boolean> {
    const story = this.stories.get(storyId);
    if (!story || !this.can(story, storyId, userId).canRead) return false;
    const key = progressKey(userId, storyId, slotId);
    this.progress.set(key, {
      id: slotId,
      kind: readerSaveKind(slotId),
      ...(name ? { name } : {}),
      state: structuredClone(state),
      createdAt: this.progress.get(key)?.createdAt ?? createdAt,
      updatedAt,
    });
    return true;
  }

  async deleteProgress(
    storyId: string,
    userId: string,
    slotId = READER_AUTOSAVE_ID,
  ): Promise<void> {
    this.progress.delete(progressKey(userId, storyId, slotId));
  }

  async getAccess(id: string, userId: string): Promise<StoryAccessConfiguration | undefined> {
    const story = this.stories.get(id);
    if (!story || !this.can(story, id, userId).canManage) return undefined;
    return {
      ...(story.access ?? defaultStoryAccess),
      owner: { id: this.owners.get(id)!, email: emailForUser(this.owners.get(id)!) },
      collaborators: [...(this.permissions.get(id) ?? new Map()).entries()].map(
        ([collaboratorId, role]) => ({
          userId: collaboratorId,
          email: emailForUser(collaboratorId),
          role,
        }),
      ),
    };
  }

  async updateAccess(id: string, userId: string, settings: StoryAccessSettings) {
    const story = this.stories.get(id);
    if (!story || !this.can(story, id, userId).canManage) return false;
    story.access = structuredClone(settings);
    return true;
  }

  async setCollaborator(id: string, userId: string, email: string, role: StoryCollaboratorRole) {
    const story = this.stories.get(id);
    if (!story || !this.can(story, id, userId).canManage) return false;
    const collaboratorId = userForEmail(email);
    if (!collaboratorId || collaboratorId === this.owners.get(id)) return false;
    const permissions = this.permissions.get(id) ?? new Map<string, StoryCollaboratorRole>();
    permissions.set(collaboratorId, role);
    this.permissions.set(id, permissions);
    return true;
  }

  async removeCollaborator(id: string, userId: string, collaboratorId: string) {
    const story = this.stories.get(id);
    if (!story || !this.can(story, id, userId).canManage) return false;
    return this.permissions.get(id)?.delete(collaboratorId) ?? false;
  }

  private can(story: Story, id: string, userId?: string) {
    return resolveStoryAccess(story.access ?? defaultStoryAccess, {
      authenticated: userId !== undefined,
      role: 'user',
      isOwner: this.owners.get(id) === userId,
      collaboratorRole: userId ? this.permissions.get(id)?.get(userId) : undefined,
    });
  }

  private appendHistory(
    storyId: string,
    event: Omit<MemoryStoryHistoryEvent, 'id'>,
  ): MemoryStoryHistoryEvent {
    const stored = { ...event, id: String(this.nextHistoryId++) };
    const events = this.history.get(storyId) ?? [];
    events.push(stored);
    this.history.set(storyId, events);
    return stored;
  }

  private historyFor(storyId: string, userId: string, limit = 50): StoryHistory {
    const events = this.history.get(storyId) ?? [];
    const reversedEventIds = new Set(
      events.flatMap(({ revertsEventId }) => (revertsEventId ? [revertsEventId] : [])),
    );
    const activeForActor = events.filter(
      ({ id, actorUserId }) => actorUserId === userId && !reversedEventIds.has(id),
    );
    return {
      entries: [...events]
        .reverse()
        .slice(0, limit)
        .map((event) => ({
          id: event.id,
          revision: event.revision,
          kind: event.kind,
          operation: event.operation,
          actor: { id: event.actorUserId, email: emailForUser(event.actorUserId) },
          createdAt: event.createdAt,
          reverted: reversedEventIds.has(event.id),
        })),
      canUndo: activeForActor.some(({ kind }) => kind !== 'undo'),
      canRedo: activeForActor.some(({ kind }) => kind === 'undo'),
    };
  }

  private async serializeMutation<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueues.get(id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const current = previous.then(() => gate);
    this.mutationQueues.set(id, current);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.mutationQueues.get(id) === current) this.mutationQueues.delete(id);
    }
  }
}

function progressKey(userId: string, storyId: string, slotId: string): string {
  return `${userId}:${storyId}:${slotId}`;
}

function emailForUser(userId: string) {
  if (userId === 'user-1') return 'user-one@paralleax.invalid';
  if (userId === 'user-2') return 'user-two@paralleax.invalid';
  return `${userId}@paralleax.invalid`;
}

function userForEmail(email: string) {
  if (email === 'user-one@paralleax.invalid') return 'user-1';
  if (email === 'user-two@paralleax.invalid') return 'user-2';
  return email.endsWith('@paralleax.invalid') ? email.slice(0, -'@paralleax.invalid'.length) : '';
}
