import {
  applyStoryChangeDelta,
  createStoryChangeDelta,
  createStoryHistoryMutationResult,
  READER_AUTOSAVE_ID,
  STORY_LIST_PAGE_SIZE,
  defaultStoryAccess,
  invertStoryChangeDelta,
  readerSaveKind,
  resolveStoryAccess,
  storyHistoryOperations,
  doesTriggerInputMatch,
  getTriggerConditions,
  type ReaderProgressState,
  type ReaderSave,
  type Story,
  type StoryChangeDelta,
  type StoryAccessConfiguration,
  type StoryAccessSettings,
  type StoryCollaboratorRole,
  type StorySummary,
  type PaginatedResult,
  type StoryEditorBootstrap,
  type StoryEditorContextPage,
  type StoryEditorInteractionContentPage,
  type StoryEditorInteractionPage,
  type StoryEditorItemInstance,
  type StoryEditorStatAssignment,
  type StoryEditorTriggerContentPage,
  type StoryEditorTriggerPage,
  type StoryListOptions,
  type StoryRuntimeBootstrap,
  type StoryRuntimeContextPage,
  type StoryRuntimeSlice,
  type StoryRuntimeSliceRequest,
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

  async list(
    ownerId: string,
    options: StoryListOptions = { page: 1, pageSize: STORY_LIST_PAGE_SIZE },
  ): Promise<PaginatedResult<StorySummary>> {
    const summaries = [...this.stories.entries()]
      .filter(([id, story]) => this.can(story, id, ownerId).canRead)
      .map(([id, story]) => ({
        id: story.id,
        revision: story.revision,
        title: story.title,
        interactionCount: story.interactions.length,
        startDateTime: story.startDateTime,
        access: story.access ?? defaultStoryAccess,
        capabilities: this.can(story, id, ownerId),
        owner: { id: this.owners.get(id)!, displayName: displayNameForUser(this.owners.get(id)!) },
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
      }))
      .filter((story) => matchesStoryList(story, ownerId, options))
      .sort(storyListComparator(options.sort));
    return paginate(summaries, options.page, options.pageSize);
  }

  async listPublic(
    options: StoryListOptions = { page: 1, pageSize: STORY_LIST_PAGE_SIZE },
  ): Promise<PaginatedResult<StorySummary>> {
    const summaries = [...this.stories.entries()]
      .filter(([, story]) => (story.access ?? defaultStoryAccess).visibility === 'public')
      .map(([id, story]) => ({
        id: story.id,
        revision: story.revision,
        title: story.title,
        interactionCount: story.interactions.length,
        startDateTime: story.startDateTime,
        access: story.access ?? defaultStoryAccess,
        capabilities: resolveStoryAccess(story.access ?? defaultStoryAccess, {
          authenticated: false,
        }),
        owner: { id: this.owners.get(id)!, displayName: displayNameForUser(this.owners.get(id)!) },
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
      }))
      .filter((story) => matchesStoryList(story, undefined, options))
      .sort(storyListComparator(options.sort));
    return paginate(summaries, options.page, options.pageSize);
  }

  async findEditorBootstrap(
    id: string,
    ownerId: string,
  ): Promise<StoryEditorBootstrap | undefined> {
    const story = await this.find(id, ownerId);
    return story ? editorBootstrap(story) : undefined;
  }

  async findEditorContextPage(
    id: string,
    ownerId: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<StoryEditorContextPage | undefined> {
    const story = await this.find(id, ownerId);
    if (!story) return undefined;
    const statAssignments: StoryEditorStatAssignment[] = [
      ...(story.stats ?? []).map((stat) => ({ ...stat, ownerType: 'story' as const })),
      ...(story.characters ?? []).flatMap((character) =>
        (character.stats ?? []).map((stat) => ({
          ...stat,
          ownerType: 'character' as const,
          ownerId: character.id,
        })),
      ),
      ...(story.locations ?? []).flatMap((location) =>
        (location.stats ?? []).map((stat) => ({
          ...stat,
          ownerType: 'location' as const,
          ownerId: location.id,
        })),
      ),
      ...(story.itemDefinitions ?? []).flatMap((definition) =>
        (definition.stats ?? []).map((stat) => ({
          ...stat,
          ownerType: 'itemDefinition' as const,
          ownerId: definition.id,
        })),
      ),
    ];
    const itemInstances: StoryEditorItemInstance[] = [
      ...(story.characters ?? []).flatMap((character) =>
        (character.items ?? []).map((item) => ({
          ...item,
          ...(!item.parentItemId ? { ownerType: 'character' as const, ownerId: character.id } : {}),
        })),
      ),
      ...(story.locations ?? []).flatMap((location) =>
        (location.items ?? []).map((item) => ({
          ...item,
          ...(!item.parentItemId ? { ownerType: 'location' as const, ownerId: location.id } : {}),
        })),
      ),
    ];
    const bootstrap = editorBootstrap(story);
    return {
      revision: story.revision ?? 1,
      page,
      pageSize,
      hasMore: Object.values(bootstrap.contextCounts).some((count) => count > page * pageSize),
      locations: pageItems(story.locations ?? [], page, pageSize).map((location) => ({
        ...location,
        stats: undefined,
        items: undefined,
      })),
      characters: pageItems(story.characters ?? [], page, pageSize).map((character) => ({
        ...character,
        stats: undefined,
        items: undefined,
      })),
      statDefinitions: pageItems(story.statDefinitions ?? [], page, pageSize),
      statAssignments: pageItems(statAssignments, page, pageSize),
      itemDefinitions: pageItems(story.itemDefinitions ?? [], page, pageSize).map((definition) => ({
        ...definition,
        stats: undefined,
      })),
      itemInstances: pageItems(itemInstances, page, pageSize),
      graphDecorations: pageItems(story.graphDecorations ?? [], page, pageSize),
    };
  }

  async findEditorInteractionPage(
    id: string,
    ownerId: string,
    page: number,
    pageSize: number,
  ): Promise<StoryEditorInteractionPage | undefined> {
    const story = await this.find(id, ownerId);
    if (!story) return undefined;
    return {
      revision: story.revision ?? 1,
      page,
      pageSize,
      hasMore: story.interactions.length > page * pageSize,
      interactions: pageItems(story.interactions, page, pageSize).map((interaction) => ({
        id: interaction.id,
        title: interaction.title,
        position: interaction.position,
        locationId: interaction.locationId,
      })),
    };
  }

  async findEditorTriggerPage(
    id: string,
    ownerId: string,
    page: number,
    pageSize: number,
  ): Promise<StoryEditorTriggerPage | undefined> {
    const story = await this.find(id, ownerId);
    if (!story) return undefined;
    const triggers = story.interactions.flatMap((interaction) =>
      interaction.triggers.map((trigger) => ({
        id: trigger.id,
        outputInteractionId: interaction.id,
        inputInteractionIds: trigger.inputInteractionIds,
        ...(trigger.position ? { position: trigger.position } : {}),
      })),
    );
    return {
      revision: story.revision ?? 1,
      page,
      pageSize,
      hasMore: triggers.length > page * pageSize,
      triggers: pageItems(triggers, page, pageSize),
    };
  }

  async findEditorInteractionContentPage(
    id: string,
    ownerId: string,
    page: number,
    pageSize: number,
  ): Promise<StoryEditorInteractionContentPage | undefined> {
    const story = await this.find(id, ownerId);
    if (!story) return undefined;
    return {
      revision: story.revision ?? 1,
      page,
      pageSize,
      hasMore: story.interactions.length > page * pageSize,
      interactions: pageItems(story.interactions, page, pageSize).map((interaction) => ({
        interactionId: interaction.id,
        body: interaction.body,
        durationMinutes: interaction.durationMinutes,
        characterIds: interaction.characterIds,
        statEffects: interaction.statEffects,
        itemEffects: interaction.itemEffects,
        conditionalTextBlocks: interaction.conditionalTextBlocks,
      })),
    };
  }

  async findEditorTriggerContentPage(
    id: string,
    ownerId: string,
    page: number,
    pageSize: number,
  ): Promise<StoryEditorTriggerContentPage | undefined> {
    const story = await this.find(id, ownerId);
    if (!story) return undefined;
    const triggers = story.interactions.flatMap((interaction) => interaction.triggers);
    return {
      revision: story.revision ?? 1,
      page,
      pageSize,
      hasMore: triggers.length > page * pageSize,
      triggers: pageItems(triggers, page, pageSize).map((trigger) => ({
        triggerId: trigger.id,
        conditionGroups: trigger.conditionGroups,
        appearanceProbability: trigger.appearanceProbability,
        timerSeconds: trigger.timerSeconds,
      })),
    };
  }

  async findRuntimeBootstrap(
    id: string,
    ownerId?: string,
  ): Promise<StoryRuntimeBootstrap | undefined> {
    const story = await this.find(id, ownerId);
    return story ? editorBootstrap(story) : undefined;
  }

  async findRuntimeAccess(
    id: string,
    ownerId?: string,
  ): Promise<Pick<Story, 'id' | 'revision' | 'capabilities'> | undefined> {
    const story = await this.find(id, ownerId);
    return story
      ? { id: story.id, revision: story.revision, capabilities: story.capabilities }
      : undefined;
  }

  async findRuntimeContextPage(
    id: string,
    ownerId: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<StoryRuntimeContextPage | undefined> {
    const result = await this.findEditorContextPage(id, ownerId, page, pageSize);
    return result ? { ...result, graphDecorations: [] } : undefined;
  }

  async findRuntimeSlice(
    id: string,
    ownerId: string | undefined,
    request: StoryRuntimeSliceRequest,
  ): Promise<StoryRuntimeSlice | undefined> {
    const story = await this.find(id, ownerId);
    if (!story) return undefined;
    const candidates =
      request.includeOptions === false
        ? []
        : story.interactions.filter((interaction) =>
            interaction.triggers.some((trigger) =>
              doesTriggerInputMatch(trigger, request.currentInteractionId ?? null),
            ),
          );
    const start = (request.page - 1) * request.pageSize;
    const optionPage = candidates.slice(start, start + request.pageSize);
    const optionIds = new Set(optionPage.map(({ id: interactionId }) => interactionId));
    const requestedIds = new Set(request.interactionIds ?? []);
    const referencedIds = new Set(
      optionPage.flatMap((interaction) =>
        interaction.triggers.flatMap((trigger) =>
          getTriggerConditions(trigger).flatMap((condition) =>
            'interactionId' in condition ? [condition.interactionId] : [],
          ),
        ),
      ),
    );
    return {
      revision: story.revision ?? 1,
      page: request.page,
      pageSize: request.pageSize,
      totalOptionCount: candidates.length,
      hasMore: start + request.pageSize < candidates.length,
      optionInteractionIds: [...optionIds],
      interactionReferences: story.interactions
        .filter(({ id: interactionId }) => referencedIds.has(interactionId))
        .map(({ id: interactionId, title }) => ({ id: interactionId, title })),
      interactions: story.interactions
        .filter(
          ({ id: interactionId }) =>
            optionIds.has(interactionId) || requestedIds.has(interactionId),
        )
        .map((interaction) => ({
          ...structuredClone(interaction),
          triggers: optionIds.has(interaction.id)
            ? interaction.triggers.filter((trigger) =>
                doesTriggerInputMatch(trigger, request.currentInteractionId ?? null),
              )
            : [],
        })),
    };
  }

  async find(id: string, ownerId?: string): Promise<Story | undefined> {
    const story = this.stories.get(id);
    if (!story || !this.can(story, id, ownerId).canRead) return undefined;
    return structuredClone({
      ...story,
      access: story.access ?? defaultStoryAccess,
      capabilities: this.can(story, id, ownerId),
      owner: { id: this.owners.get(id)!, displayName: displayNameForUser(this.owners.get(id)!) },
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
    operation: string = storyHistoryOperations.storyUpdated,
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
          operation,
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

  async findProgressSaves(
    storyId: string,
    userId: string,
  ): Promise<Array<ReaderSave & { currentInteractionTitle?: string }>> {
    const story = this.stories.get(storyId);
    if (!story || !this.can(story, storyId, userId).canRead) return [];
    const prefix = `${userId}:${storyId}:`;
    return [...this.progress.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, save]) => save)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((save) => {
        const currentInteractionTitle = story.interactions.find(
          ({ id }) => id === save.state.currentInteractionId,
        )?.title;
        return {
          ...structuredClone(save),
          ...(currentInteractionTitle ? { currentInteractionTitle } : {}),
        };
      });
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
      owner: {
        id: this.owners.get(id)!,
        email: emailForUser(this.owners.get(id)!),
        displayName: displayNameForUser(this.owners.get(id)!),
      },
      collaborators: [...(this.permissions.get(id) ?? new Map()).entries()].map(
        ([collaboratorId, role]) => ({
          userId: collaboratorId,
          email: emailForUser(collaboratorId),
          displayName: displayNameForUser(collaboratorId),
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
          actor: { id: event.actorUserId, displayName: displayNameForUser(event.actorUserId) },
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

function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  return {
    items: pageItems(items, page, pageSize),
    page,
    pageSize,
    totalCount: items.length,
    hasMore: page * pageSize < items.length,
  };
}

function pageItems<T>(items: T[], page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  return items.slice(offset, offset + pageSize);
}

function matchesStoryList(
  story: StorySummary,
  ownerId: string | undefined,
  options: StoryListOptions,
) {
  if (
    options.query &&
    !story.title.toLocaleLowerCase().includes(options.query.trim().toLocaleLowerCase())
  ) {
    return false;
  }
  if (options.filter === 'editable' && !story.capabilities?.canEdit) return false;
  if (options.filter === 'commentable' && !story.capabilities?.canComment) return false;
  if (options.filter === 'owned' && story.owner?.id !== ownerId) return false;
  return true;
}

function storyListComparator(sort: StoryListOptions['sort']) {
  return (left: StorySummary, right: StorySummary) =>
    sort === 'title'
      ? left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
      : Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.id.localeCompare(right.id);
}

function editorBootstrap(story: Story): StoryEditorBootstrap {
  const statAssignmentCount =
    (story.stats?.length ?? 0) +
    (story.characters ?? []).reduce(
      (total, character) => total + (character.stats?.length ?? 0),
      0,
    ) +
    (story.locations ?? []).reduce((total, location) => total + (location.stats?.length ?? 0), 0) +
    (story.itemDefinitions ?? []).reduce(
      (total, definition) => total + (definition.stats?.length ?? 0),
      0,
    );
  const itemInstanceCount = [...(story.characters ?? []), ...(story.locations ?? [])].reduce(
    (total, owner) => total + (owner.items?.length ?? 0),
    0,
  );
  return {
    id: story.id,
    revision: story.revision,
    title: story.title,
    startDateTime: story.startDateTime,
    access: story.access,
    capabilities: story.capabilities,
    owner: story.owner,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    contextCounts: {
      locations: story.locations?.length ?? 0,
      characters: story.characters?.length ?? 0,
      statDefinitions: story.statDefinitions?.length ?? 0,
      statAssignments: statAssignmentCount,
      itemDefinitions: story.itemDefinitions?.length ?? 0,
      itemInstances: itemInstanceCount,
      graphDecorations: story.graphDecorations?.length ?? 0,
    },
    interactionCount: story.interactions.length,
    triggerCount: story.interactions.reduce(
      (total, interaction) => total + interaction.triggers.length,
      0,
    ),
  };
}

function progressKey(userId: string, storyId: string, slotId: string): string {
  return `${userId}:${storyId}:${slotId}`;
}

function emailForUser(userId: string) {
  if (userId === 'user-1') return 'user-one@paralleax.invalid';
  if (userId === 'user-2') return 'user-two@paralleax.invalid';
  return `${userId}@paralleax.invalid`;
}

function displayNameForUser(userId: string) {
  if (userId === 'user-1') return 'User One';
  if (userId === 'user-2') return 'User Two';
  return `User ${userId.slice(0, 8)}`;
}

function userForEmail(email: string) {
  if (email === 'user-one@paralleax.invalid') return 'user-1';
  if (email === 'user-two@paralleax.invalid') return 'user-2';
  return email.endsWith('@paralleax.invalid') ? email.slice(0, -'@paralleax.invalid'.length) : '';
}
