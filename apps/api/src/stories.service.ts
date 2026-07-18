import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  createDemoStory,
  deleteInteractionFromStory,
  deleteTriggerInStory,
  ensureStoryInteractionPositions,
  normalizeTriggerInputIds,
  updateTriggerInStory,
  type Story,
} from '@paralleax/shared';
import {
  CreateInteractionDto,
  CreateStoryDto,
  UpdateInteractionDto,
  UpdateTriggerDto,
} from './dto';
import { StoriesRepository } from './stories.repository';

@Injectable()
export class StoriesService implements OnModuleInit {
  constructor(private readonly repository: StoriesRepository) {}

  async onModuleInit() {
    await this.seed();
  }

  async list(userId = 'migration-user'): Promise<Story[]> {
    return this.repository.list(userId);
  }
  async get(id: string, userId = 'migration-user'): Promise<Story> {
    const story = await this.repository.find(id, userId);
    if (!story) throw new NotFoundException('Story not found');
    return structuredClone(ensureStoryInteractionPositions(story));
  }
  async create(input: CreateStoryDto, userId = 'migration-user'): Promise<Story> {
    const now = new Date().toISOString();
    const story: Story = {
      id: randomUUID(),
      title: input.title.trim() || 'Untitled',
      interactions: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.save(story, userId);
    return structuredClone(story);
  }
  async createDemo(userId = 'migration-user'): Promise<Story> {
    const now = new Date().toISOString();
    const story = createDemoStory(randomUUID(), now);
    await this.repository.save(story, userId);
    return structuredClone(story);
  }
  async rename(id: string, title: string, userId = 'migration-user'): Promise<Story> {
    return this.update(
      id,
      (story) => {
        story.title = title.trim() || 'Untitled';
        return story;
      },
      userId,
    );
  }
  async delete(id: string, userId = 'migration-user'): Promise<void> {
    if (!(await this.repository.delete(id, userId))) throw new NotFoundException('Story not found');
  }
  async createInteraction(
    storyId: string,
    input: CreateInteractionDto,
    userId = 'migration-user',
  ): Promise<Story> {
    return this.update(
      storyId,
      (story) => {
        if (input.parentId && !story.interactions.some((item) => item.id === input.parentId))
          throw new NotFoundException('Parent interaction not found');
        story.interactions.push({
          id: randomUUID(),
          title: 'New interaction',
          body: 'Describe what happens here.',
          position: input.position ?? {
            x: 80 + story.interactions.length * 40,
            y: 100 + story.interactions.length * 30,
          },
          triggers: [
            {
              id: randomUUID(),
              inputInteractionIds: input.parentId ? [input.parentId] : [],
              conditions: [],
            },
          ],
        });
        return story;
      },
      userId,
    );
  }
  async updateInteraction(
    storyId: string,
    interactionId: string,
    input: UpdateInteractionDto,
    userId = 'migration-user',
  ): Promise<Story> {
    return this.update(
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
  }
  async deleteInteraction(
    storyId: string,
    interactionId: string,
    userId = 'migration-user',
  ): Promise<Story> {
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
    userId = 'migration-user',
  ): Promise<Story> {
    return this.update(
      storyId,
      (story) => {
        const interaction = this.interaction(story, interactionId);
        const trigger = interaction.triggers.find((item) => item.id === triggerId);
        if (!trigger) throw new NotFoundException('Trigger not found');
        return updateTriggerInStory(story, interactionId, triggerId, {
          inputInteractionIds: normalizeTriggerInputIds(input.inputInteractionIds),
          conditions: input.conditions,
        });
      },
      userId,
    );
  }
  async addTrigger(
    storyId: string,
    interactionId: string,
    userId = 'migration-user',
  ): Promise<Story> {
    return this.update(
      storyId,
      (story) => {
        this.interaction(story, interactionId).triggers.push({
          id: randomUUID(),
          inputInteractionIds: [],
          conditions: [],
        });
        return story;
      },
      userId,
    );
  }
  async deleteTrigger(
    storyId: string,
    interactionId: string,
    triggerId: string,
    userId = 'migration-user',
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
        return next;
      },
      userId,
    );
    if (!updated) throw new NotFoundException('Story not found');
    return updated;
  }
  private async seed() {
    if ((await this.repository.list()).length > 0) return;

    const story = await this.create({ title: 'The forest path' });
    await this.createInteraction(story.id, { position: { x: 80, y: 180 } });
    const current = await this.update(
      story.id,
      (item) => {
        item.interactions[0].title = 'At the edge of the forest';
        item.interactions[0].body = 'Two paths open before you.';
        return item;
      },
      'migration-user',
    );
    const start = current.interactions[0];
    await this.createInteraction(story.id, { parentId: start.id, position: { x: 430, y: 80 } });
    await this.createInteraction(story.id, { parentId: start.id, position: { x: 430, y: 300 } });
    await this.update(
      story.id,
      (final) => {
        final.interactions[1].title = 'The bright trail';
        final.interactions[1].body = 'You move toward a peaceful clearing.';
        final.interactions[2].title = 'The dark trail';
        final.interactions[2].body = 'The trees close in around you.';
        return final;
      },
      'migration-user',
    );
  }
}
