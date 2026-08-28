import {
  READER_AUTOSAVE_ID,
  defaultStoryAccess,
  readerSaveKind,
  resolveStoryAccess,
  type ReaderProgressState,
  type ReaderSave,
  type Story,
  type StoryAccessConfiguration,
  type StoryAccessSettings,
  type StoryCollaboratorRole,
  type StorySummary,
} from '@paralleax/shared';

export class InMemoryStoriesRepository {
  private readonly stories = new Map<string, Story>();
  private readonly owners = new Map<string, string>();
  private readonly mutationQueues = new Map<string, Promise<void>>();
  private readonly progress = new Map<string, ReaderSave>();
  private readonly permissions = new Map<string, Map<string, StoryCollaboratorRole>>();

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
    const previous = this.mutationQueues.get(id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const current = previous.then(() => gate);
    this.mutationQueues.set(id, current);
    await previous;

    try {
      const candidate = this.stories.get(id);
      const story = candidate && this.can(candidate, id, ownerId).canEdit ? candidate : undefined;
      if (!story) return undefined;
      const updated = await mutation(structuredClone(story));
      this.stories.set(id, structuredClone(updated));
      return structuredClone(updated);
    } finally {
      release();
      if (this.mutationQueues.get(id) === current) this.mutationQueues.delete(id);
    }
  }

  async delete(id: string, ownerId: string): Promise<boolean> {
    const story = this.stories.get(id);
    if (!story || !this.can(story, id, ownerId).canManage) return false;
    this.owners.delete(id);
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
