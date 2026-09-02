import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MAX_MANUAL_READER_SAVES,
  MAX_READER_SAVE_NAME_LENGTH,
  autosaveId,
  buildReaderProgressState,
  getStoryItemEntries,
  readerSaveKind,
  type ReaderAutosaveMode,
  type ReaderProgress,
  type ReaderSave,
  type ReaderSaveSummary,
  type Story,
} from '@paralleax/shared';
import type {
  CreateReaderSaveDto,
  SaveReaderProgressDto,
  UpdateReaderSaveDto,
} from '../dto/stories.dto';
import { StoriesRepository } from '../stories.repository';

@Injectable()
export class StoryReaderProgressService {
  constructor(private readonly repository: StoriesRepository) {}

  async get(
    storyId: string,
    userId: string,
    mode: ReaderAutosaveMode = 'reader',
  ): Promise<ReaderProgress | null> {
    const story = await this.story(storyId, userId);
    this.assertModeAccess(story, mode);
    const progress = await this.repository.findProgress(storyId, userId, autosaveId(mode));
    return progress ? { state: progress.state, updatedAt: progress.updatedAt } : null;
  }

  async save(
    storyId: string,
    input: SaveReaderProgressDto,
    userId: string,
    mode: ReaderAutosaveMode = 'reader',
  ): Promise<ReaderProgress> {
    const story = await this.story(storyId, userId);
    this.assertModeAccess(story, mode);
    return this.persist(story, input, userId, autosaveId(mode));
  }

  async delete(
    storyId: string,
    userId: string,
    mode: ReaderAutosaveMode = 'reader',
  ): Promise<void> {
    const story = await this.story(storyId, userId);
    this.assertModeAccess(story, mode);
    await this.repository.deleteProgress(storyId, userId, autosaveId(mode));
  }

  async listSaves(storyId: string, userId: string): Promise<ReaderSaveSummary[]> {
    await this.story(storyId, userId);
    const saves = await this.repository.findProgressSaves(storyId, userId);
    return saves.map(({ id, kind, name, state, createdAt, updatedAt }) => ({
      id,
      kind,
      ...(name ? { name } : {}),
      currentInteractionId: state.currentInteractionId,
      journeyLength: state.journeyInteractionIds.length,
      createdAt,
      updatedAt,
    }));
  }

  async getSave(storyId: string, saveId: string, userId: string): Promise<ReaderSave> {
    await this.story(storyId, userId);
    const save = await this.repository.findProgress(storyId, userId, saveId);
    if (!save) throw new NotFoundException('Reader save not found');
    return save;
  }

  async createSave(
    storyId: string,
    input: CreateReaderSaveDto,
    userId: string,
  ): Promise<ReaderSave> {
    const story = await this.story(storyId, userId);
    const saves = await this.repository.findProgressSaves(storyId, userId);
    if (saves.filter(({ kind }) => kind === 'manual').length >= MAX_MANUAL_READER_SAVES) {
      throw new ConflictException(
        `A story can have at most ${MAX_MANUAL_READER_SAVES} manual saves per user`,
      );
    }
    const saveId = randomUUID();
    return this.persist(story, input, userId, saveId, this.name(input.name));
  }

  async updateSave(
    storyId: string,
    saveId: string,
    input: UpdateReaderSaveDto,
    userId: string,
  ): Promise<ReaderSave> {
    const story = await this.story(storyId, userId);
    if (readerSaveKind(saveId) !== 'manual') {
      throw new BadRequestException('Autosaves are updated by their reader mode');
    }
    const existing = await this.repository.findProgress(storyId, userId, saveId);
    if (!existing) throw new NotFoundException('Reader save not found');
    return this.persist(story, input, userId, saveId, this.name(input.name), existing.createdAt);
  }

  async deleteSave(storyId: string, saveId: string, userId: string): Promise<void> {
    await this.story(storyId, userId);
    if (readerSaveKind(saveId) !== 'manual') {
      throw new BadRequestException('Autosaves are reset by their reader mode');
    }
    const existing = await this.repository.findProgress(storyId, userId, saveId);
    if (!existing) throw new NotFoundException('Reader save not found');
    await this.repository.deleteProgress(storyId, userId, saveId);
  }

  private persist(
    story: Story,
    input: SaveReaderProgressDto,
    userId: string,
    slotId: string,
    name: string,
    createdAt?: string,
  ): Promise<ReaderSave>;
  private persist(
    story: Story,
    input: SaveReaderProgressDto,
    userId: string,
    slotId: string,
    name?: undefined,
    createdAt?: string,
  ): Promise<ReaderProgress>;
  private async persist(
    story: Story,
    input: SaveReaderProgressDto,
    userId: string,
    slotId: string,
    name?: string,
    createdAt?: string,
  ): Promise<ReaderProgress | ReaderSave> {
    const updatedAt = new Date().toISOString();
    const existing =
      input.randomSeed && input.stepStartedAt
        ? undefined
        : await this.repository.findProgress(story.id, userId, slotId);
    const sameJourney =
      JSON.stringify(existing?.state.journeyInteractionIds) ===
      JSON.stringify(input.journeyInteractionIds);
    const stepStartedAt =
      input.stepStartedAt ??
      (sameJourney ? existing?.state.stepStartedAt : undefined) ??
      Array.from({ length: input.journeyInteractionIds.length + 1 }, () => updatedAt);
    const state = this.buildState(
      story,
      input,
      input.randomSeed ?? existing?.state.randomSeed ?? randomUUID(),
      stepStartedAt,
    );
    if (
      !(await this.repository.saveProgress(
        story.id,
        userId,
        state,
        updatedAt,
        slotId,
        name,
        createdAt ?? updatedAt,
      ))
    ) {
      throw new NotFoundException('Story not found');
    }
    return readerSaveKind(slotId) === 'manual'
      ? {
          id: slotId,
          kind: 'manual',
          name,
          state,
          createdAt: createdAt ?? updatedAt,
          updatedAt,
        }
      : { state, updatedAt };
  }

  private buildState(
    story: Story,
    input: SaveReaderProgressDto,
    randomSeed: string,
    stepStartedAt: string[],
  ) {
    const interactionIds = new Set(story.interactions.map(({ id }) => id));
    if (input.journeyInteractionIds.some((id) => !interactionIds.has(id))) {
      throw new BadRequestException('Reader journey interactions must belong to the same story');
    }
    const itemIds = new Set(getStoryItemEntries(story).map(({ item }) => item.id));
    if ((input.ownedItemIds ?? []).some((id) => !itemIds.has(id))) {
      throw new BadRequestException('Reader items must belong to the same story');
    }
    if (stepStartedAt.length !== input.journeyInteractionIds.length + 1) {
      throw new BadRequestException(
        'Reader timer steps must contain one timestamp before the journey and one per interaction',
      );
    }
    return buildReaderProgressState(
      story,
      input.journeyInteractionIds,
      input.ownedItemIds,
      randomSeed,
      stepStartedAt,
    );
  }

  private name(value: string): string {
    const name = value.trim();
    if (!name) throw new BadRequestException('Reader save name cannot be blank');
    if (name.length > MAX_READER_SAVE_NAME_LENGTH) {
      throw new BadRequestException(
        `Reader save name cannot exceed ${MAX_READER_SAVE_NAME_LENGTH} characters`,
      );
    }
    return name;
  }

  private assertModeAccess(story: Story, mode: ReaderAutosaveMode): void {
    if (mode === 'simulation' && story.capabilities?.canEdit !== true) {
      throw new NotFoundException('Story not found');
    }
  }

  private async story(storyId: string, userId: string): Promise<Story> {
    const story = await this.repository.find(storyId, userId);
    if (!story) throw new NotFoundException('Story not found');
    return story;
  }
}
