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
  type Story,
  type TriggerMutationResult,
} from '@paralleax/shared';
import {
  CreateInteractionDto,
  CreateStoryDto,
  CreateTriggerDto,
  UpdateInteractionDto,
  UpdateTriggerDto,
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
        this.assertTriggerReferences(story, input.inputInteractionIds, input.conditions);
        return updateTriggerInStory(story, interactionId, triggerId, {
          inputInteractionIds: normalizeTriggerInputIds(input.inputInteractionIds),
          conditions: input.conditions,
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
        this.assertTriggerReferences(
          story,
          input.inputInteractionIds ?? [],
          input.conditions ?? [],
        );
        this.interaction(story, interactionId).triggers.push({
          id: triggerId,
          inputInteractionIds: normalizeTriggerInputIds(input.inputInteractionIds ?? []),
          conditions: input.conditions ?? [],
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
  private interaction(story: Story, id: string) {
    const item = story.interactions.find((interaction) => interaction.id === id);
    if (!item) throw new NotFoundException('Interaction not found');
    return item;
  }
  private assertTriggerReferences(
    story: Story,
    inputInteractionIds: string[],
    conditions: { interactionId: string }[],
  ) {
    const interactionIds = new Set(story.interactions.map(({ id }) => id));
    const referencedIds = [
      ...inputInteractionIds,
      ...conditions.map(({ interactionId }) => interactionId),
    ];
    if (referencedIds.some((id) => !interactionIds.has(id))) {
      throw new BadRequestException('Trigger references must belong to the same story');
    }
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
