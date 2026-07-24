import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  createDemoStory,
  deleteInteractionFromStory,
  deleteTriggerInStory,
  ensureStoryInteractionPositions,
  normalizeTriggerInputIds,
  updateTriggerInStory,
  type InteractionMutationResult,
  type LocationMutationResult,
  type Story,
  type TriggerCondition,
  type TriggerMutationResult,
} from '@paralleax/shared';
import {
  CreateInteractionDto,
  CreateLocationDto,
  CreateStoryDto,
  CreateTriggerDto,
  UpdateInteractionDto,
  UpdateLocationDto,
  UpdateTriggerDto,
  TriggerConditionDto,
} from './dto/stories.dto';
import { StoriesRepository } from './stories.repository';

@Injectable()
export class StoriesService {
  constructor(private readonly repository: StoriesRepository) {}

  async list(userId: string): Promise<Story[]> {
    return this.repository.list(userId);
  }
  async get(id: string, userId: string): Promise<Story> {
    const story = await this.repository.find(id, userId);
    if (!story) throw new NotFoundException('Story not found');
    return structuredClone(ensureStoryInteractionPositions(story));
  }
  async create(input: CreateStoryDto, userId: string): Promise<Story> {
    const now = new Date().toISOString();
    const story: Story = {
      id: randomUUID(),
      revision: 1,
      title: input.title.trim() || 'Untitled',
      locations: [],
      interactions: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.save(story, userId);
    return structuredClone(story);
  }
  async createDemo(userId: string): Promise<Story> {
    const now = new Date().toISOString();
    const story = createDemoStory(randomUUID(), now);
    await this.repository.save(story, userId);
    return structuredClone(story);
  }
  async rename(id: string, title: string, userId: string): Promise<Story> {
    return this.update(
      id,
      (story) => {
        story.title = title.trim() || 'Untitled';
        return story;
      },
      userId,
    );
  }
  async delete(id: string, userId: string): Promise<void> {
    if (!(await this.repository.delete(id, userId))) throw new NotFoundException('Story not found');
  }
  async createInteraction(
    storyId: string,
    input: CreateInteractionDto,
    userId: string,
  ): Promise<InteractionMutationResult> {
    const interactionId = randomUUID();
    const triggerId = randomUUID();
    const story = await this.update(
      storyId,
      (story) => {
        if (input.parentId && !story.interactions.some((item) => item.id === input.parentId))
          throw new NotFoundException('Parent interaction not found');
        story.interactions.push({
          id: interactionId,
          title: 'New interaction',
          body: 'Describe what happens here.',
          position: input.position ?? {
            x: 80 + story.interactions.length * 40,
            y: 100 + story.interactions.length * 30,
          },
          triggers: [
            {
              id: triggerId,
              inputInteractionIds: input.parentId ? [input.parentId] : [],
              conditions: [],
            },
          ],
        });
        return story;
      },
      userId,
    );
    return this.interactionResult(story, interactionId);
  }
  async updateInteraction(
    storyId: string,
    interactionId: string,
    input: UpdateInteractionDto,
    userId: string,
  ): Promise<InteractionMutationResult> {
    const story = await this.update(
      storyId,
      (story) => {
        const interaction = this.interaction(story, interactionId);
        if (input.title !== undefined) interaction.title = input.title;
        if (input.body !== undefined) interaction.body = input.body ?? '';
        if (input.position !== undefined) interaction.position = input.position;
        if (input.locationId !== undefined) {
          if (
            input.locationId !== null &&
            !(story.locations ?? []).some(({ id }) => id === input.locationId)
          ) {
            throw new BadRequestException('Interaction location must belong to the same story');
          }
          interaction.locationId = input.locationId;
        }
        return story;
      },
      userId,
    );
    return this.interactionResult(story, interactionId);
  }
  async deleteInteraction(storyId: string, interactionId: string, userId: string): Promise<Story> {
    return this.update(
      storyId,
      (story) => {
        this.interaction(story, interactionId);
        return deleteInteractionFromStory(story, interactionId);
      },
      userId,
    );
  }
  async updateTrigger(
    storyId: string,
    interactionId: string,
    triggerId: string,
    input: UpdateTriggerDto,
    userId: string,
  ): Promise<TriggerMutationResult> {
    const story = await this.update(
      storyId,
      (story) => {
        const interaction = this.interaction(story, interactionId);
        const trigger = interaction.triggers.find((item) => item.id === triggerId);
        if (!trigger) throw new NotFoundException('Trigger not found');
        const conditions = this.triggerConditions(story, input.conditions);
        this.assertInteractionReferences(story, input.inputInteractionIds);
        return updateTriggerInStory(story, interactionId, triggerId, {
          inputInteractionIds: normalizeTriggerInputIds(input.inputInteractionIds),
          conditions,
        });
      },
      userId,
    );
    return this.triggerResult(story, interactionId, triggerId);
  }
  async addTrigger(
    storyId: string,
    interactionId: string,
    input: CreateTriggerDto,
    userId: string,
  ): Promise<TriggerMutationResult> {
    const triggerId = randomUUID();
    const story = await this.update(
      storyId,
      (story) => {
        const conditions = this.triggerConditions(story, input.conditions ?? []);
        this.assertInteractionReferences(story, input.inputInteractionIds ?? []);
        this.interaction(story, interactionId).triggers.push({
          id: triggerId,
          inputInteractionIds: normalizeTriggerInputIds(input.inputInteractionIds ?? []),
          conditions,
        });
        return story;
      },
      userId,
    );
    return this.triggerResult(story, interactionId, triggerId);
  }
  async deleteTrigger(
    storyId: string,
    interactionId: string,
    triggerId: string,
    userId: string,
  ): Promise<Story> {
    return this.update(
      storyId,
      (story) => {
        const interaction = this.interaction(story, interactionId);
        if (!interaction.triggers.some((item) => item.id === triggerId))
          throw new NotFoundException('Trigger not found');
        return deleteTriggerInStory(story, interactionId, triggerId);
      },
      userId,
    );
  }
  async createLocation(
    storyId: string,
    input: CreateLocationDto,
    userId: string,
  ): Promise<LocationMutationResult> {
    const locationId = randomUUID();
    const story = await this.update(
      storyId,
      (story) => {
        (story.locations ??= []).push({
          id: locationId,
          name: input.name.trim(),
          description: input.description ?? '',
        });
        return story;
      },
      userId,
    );
    return this.locationResult(story, locationId);
  }
  async updateLocation(
    storyId: string,
    locationId: string,
    input: UpdateLocationDto,
    userId: string,
  ): Promise<LocationMutationResult> {
    const story = await this.update(
      storyId,
      (story) => {
        const location = this.location(story, locationId);
        if (input.name !== undefined) location.name = input.name.trim();
        if (input.description !== undefined) location.description = input.description;
        return story;
      },
      userId,
    );
    return this.locationResult(story, locationId);
  }
  private interaction(story: Story, id: string) {
    const item = story.interactions.find((interaction) => interaction.id === id);
    if (!item) throw new NotFoundException('Interaction not found');
    return item;
  }
  private location(story: Story, id: string) {
    const location = (story.locations ?? []).find((item) => item.id === id);
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }
  private assertInteractionReferences(story: Story, inputInteractionIds: string[]) {
    const interactionIds = new Set(story.interactions.map(({ id }) => id));
    if (inputInteractionIds.some((id) => !interactionIds.has(id))) {
      throw new BadRequestException('Trigger references must belong to the same story');
    }
  }
  private triggerConditions(story: Story, conditions: TriggerConditionDto[]): TriggerCondition[] {
    const interactionIds = new Set(story.interactions.map(({ id }) => id));
    const locationIds = new Set((story.locations ?? []).map(({ id }) => id));
    return conditions.map((condition) => {
      const isInteractionCondition =
        condition.interactionId !== undefined && condition.hasBeenVisited !== undefined;
      const isLocationCondition =
        condition.locationId !== undefined && condition.isCurrentLocation !== undefined;
      if (isInteractionCondition === isLocationCondition) {
        throw new BadRequestException(
          'A trigger condition must reference exactly one interaction or location',
        );
      }
      if (isInteractionCondition) {
        if (!interactionIds.has(condition.interactionId!)) {
          throw new BadRequestException('Trigger references must belong to the same story');
        }
        return {
          interactionId: condition.interactionId!,
          hasBeenVisited: condition.hasBeenVisited!,
        };
      }
      if (!locationIds.has(condition.locationId!)) {
        throw new BadRequestException('Trigger references must belong to the same story');
      }
      return {
        locationId: condition.locationId!,
        isCurrentLocation: condition.isCurrentLocation!,
      };
    });
  }
  private interactionResult(story: Story, interactionId: string): InteractionMutationResult {
    return {
      interaction: structuredClone(this.interaction(story, interactionId)),
      revision: story.revision ?? 1,
      updatedAt: story.updatedAt,
    };
  }
  private triggerResult(
    story: Story,
    interactionId: string,
    triggerId: string,
  ): TriggerMutationResult {
    const trigger = this.interaction(story, interactionId).triggers.find(
      ({ id }) => id === triggerId,
    );
    if (!trigger) throw new NotFoundException('Trigger not found');
    return {
      interactionId,
      trigger: structuredClone(trigger),
      revision: story.revision ?? 1,
      updatedAt: story.updatedAt,
    };
  }
  private locationResult(story: Story, locationId: string): LocationMutationResult {
    return {
      location: structuredClone(this.location(story, locationId)),
      revision: story.revision ?? 1,
      updatedAt: story.updatedAt,
    };
  }
  private async update(
    id: string,
    mutation: (story: Story) => Story,
    userId: string,
  ): Promise<Story> {
    const updated = await this.repository.mutate(
      id,
      (story) => {
        const next = mutation(story);
        next.id = id;
        next.interactions = ensureStoryInteractionPositions(next).interactions;
        next.updatedAt = new Date().toISOString();
        next.revision = (story.revision ?? 1) + 1;
        return next;
      },
      userId,
    );
    if (!updated) throw new NotFoundException('Story not found');
    return updated;
  }
}
