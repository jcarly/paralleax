import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  createDemoStory,
  deleteInteractionFromStory,
  deleteTriggerInStory,
  ensureStoryInteractionPositions,
  normalizeTriggerInputIds,
  updateTriggerInStory,
  type CharacterMutationResult,
  type CharacterStatMutationResult,
  type InteractionMutationResult,
  type LocationMutationResult,
  type Story,
  type TriggerCondition,
  type TriggerMutationResult,
} from '@paralleax/shared';
import {
  CreateInteractionDto,
  CreateCharacterDto,
  CreateCharacterStatDto,
  CreateLocationDto,
  CreateStoryDto,
  CreateTriggerDto,
  UpdateInteractionDto,
  UpdateCharacterDto,
  UpdateCharacterStatDto,
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
      characters: [],
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
        if (input.characterIds !== undefined) {
          const characterIds = new Set((story.characters ?? []).map(({ id }) => id));
          if (input.characterIds.some((id) => !characterIds.has(id))) {
            throw new BadRequestException('Interaction characters must belong to the same story');
          }
          interaction.characterIds = [...new Set(input.characterIds)];
        }
        if (input.statEffects !== undefined) {
          const statIds = this.statIds(story);
          if (input.statEffects.some(({ statId }) => !statIds.has(statId))) {
            throw new BadRequestException('Stat effects must belong to the same story');
          }
          if (
            new Set(input.statEffects.map(({ statId }) => statId)).size !== input.statEffects.length
          ) {
            throw new BadRequestException('An interaction can only affect a stat once');
          }
          interaction.statEffects = input.statEffects;
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
  async createCharacter(
    storyId: string,
    input: CreateCharacterDto,
    userId: string,
  ): Promise<CharacterMutationResult> {
    const characterId = randomUUID();
    const story = await this.update(
      storyId,
      (story) => {
        (story.characters ??= []).push({
          id: characterId,
          name: input.name.trim(),
          description: input.description ?? '',
          stats: [],
        });
        return story;
      },
      userId,
    );
    return this.characterResult(story, characterId);
  }
  async updateCharacter(
    storyId: string,
    characterId: string,
    input: UpdateCharacterDto,
    userId: string,
  ): Promise<CharacterMutationResult> {
    const story = await this.update(
      storyId,
      (story) => {
        const character = this.character(story, characterId);
        if (input.name !== undefined) character.name = input.name.trim();
        if (input.description !== undefined) character.description = input.description;
        return story;
      },
      userId,
    );
    return this.characterResult(story, characterId);
  }
  async createCharacterStat(
    storyId: string,
    characterId: string,
    input: CreateCharacterStatDto,
    userId: string,
  ): Promise<CharacterStatMutationResult> {
    const statId = randomUUID();
    const story = await this.update(
      storyId,
      (story) => {
        const character = this.character(story, characterId);
        (character.stats ??= []).push({
          id: statId,
          name: input.name.trim(),
          initialValue: input.initialValue,
        });
        return story;
      },
      userId,
    );
    return this.statResult(story, characterId, statId);
  }
  async updateCharacterStat(
    storyId: string,
    characterId: string,
    statId: string,
    input: UpdateCharacterStatDto,
    userId: string,
  ): Promise<CharacterStatMutationResult> {
    const story = await this.update(
      storyId,
      (story) => {
        const stat = this.stat(story, characterId, statId);
        if (input.name !== undefined) stat.name = input.name.trim();
        if (input.initialValue !== undefined) stat.initialValue = input.initialValue;
        return story;
      },
      userId,
    );
    return this.statResult(story, characterId, statId);
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
  private character(story: Story, id: string) {
    const character = (story.characters ?? []).find((item) => item.id === id);
    if (!character) throw new NotFoundException('Character not found');
    return character;
  }
  private stat(story: Story, characterId: string, statId: string) {
    const stat = this.character(story, characterId).stats?.find(({ id }) => id === statId);
    if (!stat) throw new NotFoundException('Character stat not found');
    return stat;
  }
  private statIds(story: Story) {
    return new Set(
      (story.characters ?? []).flatMap((character) => (character.stats ?? []).map(({ id }) => id)),
    );
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
    const characterIds = new Set((story.characters ?? []).map(({ id }) => id));
    const statIds = this.statIds(story);
    return conditions.map((condition) => {
      const isInteractionCondition =
        condition.interactionId !== undefined && condition.hasBeenVisited !== undefined;
      const isLocationCondition =
        condition.locationId !== undefined && condition.isCurrentLocation !== undefined;
      const isCharacterCondition =
        condition.characterId !== undefined && condition.isPresent !== undefined;
      const isStatCondition =
        condition.statId !== undefined &&
        condition.operator !== undefined &&
        condition.value !== undefined;
      if (
        Number(isInteractionCondition) +
          Number(isLocationCondition) +
          Number(isCharacterCondition) +
          Number(isStatCondition) !==
        1
      ) {
        throw new BadRequestException(
          'A trigger condition must reference exactly one interaction, location, character, or stat',
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
      if (isLocationCondition) {
        if (!locationIds.has(condition.locationId!)) {
          throw new BadRequestException('Trigger references must belong to the same story');
        }
        return {
          locationId: condition.locationId!,
          isCurrentLocation: condition.isCurrentLocation!,
        };
      }
      if (isCharacterCondition) {
        if (!characterIds.has(condition.characterId!)) {
          throw new BadRequestException('Trigger references must belong to the same story');
        }
        return {
          characterId: condition.characterId!,
          isPresent: condition.isPresent!,
        };
      }
      if (!statIds.has(condition.statId!)) {
        throw new BadRequestException('Trigger references must belong to the same story');
      }
      return {
        statId: condition.statId!,
        operator: condition.operator!,
        value: condition.value!,
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
  private characterResult(story: Story, characterId: string): CharacterMutationResult {
    return {
      character: structuredClone(this.character(story, characterId)),
      revision: story.revision ?? 1,
      updatedAt: story.updatedAt,
    };
  }
  private statResult(
    story: Story,
    characterId: string,
    statId: string,
  ): CharacterStatMutationResult {
    return {
      characterId,
      stat: structuredClone(this.stat(story, characterId, statId)),
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
