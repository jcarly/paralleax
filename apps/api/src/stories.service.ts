import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  createDemoStory,
  deleteInteractionFromStory,
  deleteTriggerInStory,
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
export class StoriesService {
  constructor(private readonly repository: StoriesRepository) {
    this.seed();
  }

  list(): Story[] {
    return this.repository.list();
  }
  get(id: string): Story {
    const story = this.repository.find(id);
    if (!story) throw new NotFoundException('Story not found');
    return structuredClone(story);
  }
  create(input: CreateStoryDto): Story {
    const now = new Date().toISOString();
    const story: Story = {
      id: randomUUID(),
      title: input.title?.trim() || 'New story',
      interactions: [],
      createdAt: now,
      updatedAt: now,
    };
    this.repository.save(story);
    return structuredClone(story);
  }
  createDemo(): Story {
    const now = new Date().toISOString();
    const story = createDemoStory(randomUUID(), now);
    this.repository.save(story);
    return structuredClone(story);
  }
  rename(id: string, title: string): Story {
    const story = this.mutate(id);
    story.title = title.trim() || 'Untitled';
    return this.touch(story);
  }
  delete(id: string): void {
    if (!this.repository.delete(id)) throw new NotFoundException('Story not found');
  }
  createInteraction(storyId: string, input: CreateInteractionDto): Story {
    const story = this.mutate(storyId);
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
  updateInteraction(storyId: string, interactionId: string, input: UpdateInteractionDto): Story {
    const story = this.mutate(storyId);
    const interaction = this.interaction(story, interactionId);
    Object.assign(interaction, input);
    return this.touch(story);
  }
  deleteInteraction(storyId: string, interactionId: string): Story {
    const story = this.mutate(storyId);
    this.interaction(story, interactionId);
    return this.replace(storyId, deleteInteractionFromStory(story, interactionId));
  }
  updateTrigger(
    storyId: string,
    interactionId: string,
    triggerId: string,
    input: UpdateTriggerDto,
  ): Story {
    const story = this.mutate(storyId);
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
  addTrigger(storyId: string, interactionId: string): Story {
    const story = this.mutate(storyId);
    this.interaction(story, interactionId).triggers.push({
      id: randomUUID(),
      inputInteractionIds: [],
      conditions: [],
    });
    return this.touch(story);
  }
  deleteTrigger(storyId: string, interactionId: string, triggerId: string): Story {
    const story = this.mutate(storyId);
    const interaction = this.interaction(story, interactionId);
    if (!interaction.triggers.some((item) => item.id === triggerId))
      throw new NotFoundException('Trigger not found');
    if (interaction.triggers.length <= 1)
      throw new BadRequestException('An interaction must keep at least one trigger');
    return this.replace(storyId, deleteTriggerInStory(story, interactionId, triggerId));
  }
  private mutate(id: string): Story {
    const story = this.repository.find(id);
    if (!story) throw new NotFoundException('Story not found');
    return story;
  }
  private interaction(story: Story, id: string) {
    const item = story.interactions.find((interaction) => interaction.id === id);
    if (!item) throw new NotFoundException('Interaction not found');
    return item;
  }
  private replace(id: string, story: Story): Story {
    story.id = id;
    this.repository.save(story);
    return this.touch(story);
  }
  private touch(story: Story): Story {
    story.updatedAt = new Date().toISOString();
    return structuredClone(story);
  }
  private seed() {
    const story = this.create({ title: 'The forest path' });
    this.createInteraction(story.id, { position: { x: 80, y: 180 } });
    const current = this.mutate(story.id);
    const start = current.interactions[0];
    start.title = 'At the edge of the forest';
    start.body = 'Two paths open before you.';
    this.createInteraction(story.id, { parentId: start.id, position: { x: 430, y: 80 } });
    this.createInteraction(story.id, { parentId: start.id, position: { x: 430, y: 300 } });
    const final = this.mutate(story.id);
    final.interactions[1].title = 'The bright trail';
    final.interactions[1].body = 'You move toward a peaceful clearing.';
    final.interactions[2].title = 'The dark trail';
    final.interactions[2].body = 'The trees close in around you.';
  }
}
