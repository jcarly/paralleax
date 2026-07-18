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

  async list(): Promise<Story[]> {
    return this.repository.list();
  }
  async get(id: string): Promise<Story> {
    const story = await this.repository.find(id);
    if (!story) throw new NotFoundException('Story not found');
    return structuredClone(ensureStoryInteractionPositions(story));
  }
  async create(input: CreateStoryDto): Promise<Story> {
    const now = new Date().toISOString();
    const story: Story = {
      id: randomUUID(),
      title: input.title?.trim() || 'New story',
      interactions: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.save(story);
    return structuredClone(story);
  }
  async createDemo(): Promise<Story> {
    const now = new Date().toISOString();
    const story = createDemoStory(randomUUID(), now);
    await this.repository.save(story);
    return structuredClone(story);
  }
  async rename(id: string, title: string): Promise<Story> {
    const story = await this.mutate(id);
    story.title = title.trim() || 'Untitled';
    return this.touch(story);
  }
  async delete(id: string): Promise<void> {
    if (!(await this.repository.delete(id))) throw new NotFoundException('Story not found');
  }
  async createInteraction(storyId: string, input: CreateInteractionDto): Promise<Story> {
    const story = await this.mutate(storyId);
    if (input.parentId && !story.interactions.some((item) => item.id === input.parentId))
      throw new NotFoundException('Parent interaction not found');
    const interactionId = randomUUID();
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
          id: randomUUID(),
          inputInteractionIds: input.parentId ? [input.parentId] : [],
          conditions: [],
        },
      ],
    });
    return this.touch(story);
  }
  async updateInteraction(
    storyId: string,
    interactionId: string,
    input: UpdateInteractionDto,
  ): Promise<Story> {
    const story = await this.mutate(storyId);
    const interaction = this.interaction(story, interactionId);
    Object.assign(interaction, input);
    return this.touch(story);
  }
  async deleteInteraction(storyId: string, interactionId: string): Promise<Story> {
    const story = await this.mutate(storyId);
    this.interaction(story, interactionId);
    return this.replace(storyId, deleteInteractionFromStory(story, interactionId));
  }
  async updateTrigger(
    storyId: string,
    interactionId: string,
    triggerId: string,
    input: UpdateTriggerDto,
  ): Promise<Story> {
    const story = await this.mutate(storyId);
    const interaction = this.interaction(story, interactionId);
    const trigger = interaction.triggers.find((item) => item.id === triggerId);
    if (!trigger) throw new NotFoundException('Trigger not found');
    return this.replace(
      storyId,
      updateTriggerInStory(story, interactionId, triggerId, {
        inputInteractionIds: normalizeTriggerInputIds(input.inputInteractionIds),
        conditions: input.conditions,
      }),
    );
  }
  async addTrigger(storyId: string, interactionId: string): Promise<Story> {
    const story = await this.mutate(storyId);
    this.interaction(story, interactionId).triggers.push({
      id: randomUUID(),
      inputInteractionIds: [],
      conditions: [],
    });
    return this.touch(story);
  }
  async deleteTrigger(storyId: string, interactionId: string, triggerId: string): Promise<Story> {
    const story = await this.mutate(storyId);
    const interaction = this.interaction(story, interactionId);
    if (!interaction.triggers.some((item) => item.id === triggerId))
      throw new NotFoundException('Trigger not found');
    return this.replace(storyId, deleteTriggerInStory(story, interactionId, triggerId));
  }
  private async mutate(id: string): Promise<Story> {
    const story = await this.repository.find(id);
    if (!story) throw new NotFoundException('Story not found');
    return story;
  }
  private interaction(story: Story, id: string) {
    const item = story.interactions.find((interaction) => interaction.id === id);
    if (!item) throw new NotFoundException('Interaction not found');
    return item;
  }
  private async replace(id: string, story: Story): Promise<Story> {
    story.id = id;
    return this.touch(story);
  }
  private async touch(story: Story): Promise<Story> {
    story.interactions = ensureStoryInteractionPositions(story).interactions;
    story.updatedAt = new Date().toISOString();
    await this.repository.save(story);
    return structuredClone(story);
  }
  private async seed() {
    if ((await this.repository.list()).length > 0) return;

    const story = await this.create({ title: 'The forest path' });
    await this.createInteraction(story.id, { position: { x: 80, y: 180 } });
    const current = await this.mutate(story.id);
    const start = current.interactions[0];
    start.title = 'At the edge of the forest';
    start.body = 'Two paths open before you.';
    await this.touch(current);
    await this.createInteraction(story.id, { parentId: start.id, position: { x: 430, y: 80 } });
    await this.createInteraction(story.id, { parentId: start.id, position: { x: 430, y: 300 } });
    const final = await this.mutate(story.id);
    final.interactions[1].title = 'The bright trail';
    final.interactions[1].body = 'You move toward a peaceful clearing.';
    final.interactions[2].title = 'The dark trail';
    final.interactions[2].body = 'The trees close in around you.';
    await this.touch(final);
  }
}
