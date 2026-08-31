import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  getItemDescendantIds,
  getStatValueType,
  getStoryItemEntries,
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  isStatValueOfType,
  storyHistoryOperations,
  type CharacterItemMutationResult,
  type CharacterMutationResult,
  type CharacterStatMutationResult,
  type ItemDefinitionMutationResult,
  type LocationMutationResult,
  type StatDefinitionMutationResult,
  type Story,
} from '@paralleax/shared';
import type {
  CreateCharacterDto,
  CreateCharacterItemDto,
  CreateCharacterStatDto,
  CreateItemDefinitionDto,
  CreateLocationDto,
  CreateStatAssignmentDto,
  CreateStatDefinitionDto,
  MoveItemInstanceDto,
  UpdateCharacterDto,
  UpdateCharacterStatDto,
  UpdateItemDefinitionDto,
  UpdateLocationDto,
  UpdateStatAssignmentDto,
  UpdateStatDefinitionDto,
} from '../dto/stories.dto';
import { moveStoryItemInstance } from './story-items';
import { storyMutationMetadata } from './story-mutation-results';
import { StoryMutationService } from './story-mutations';
import {
  createStatAssignment,
  createStatDefinition,
  deleteStatAssignment,
  deleteStatDefinition,
  updateStatAssignment,
  updateStatDefinition,
} from './story-stats';

@Injectable()
export class StoryContextService {
  constructor(private readonly mutations: StoryMutationService) {}

  async createLocation(
    storyId: string,
    input: CreateLocationDto,
    userId: string,
  ): Promise<LocationMutationResult> {
    const locationId = randomUUID();
    const story = await this.mutations.update(
      storyId,
      (story) => {
        (story.locations ??= []).push({
          id: locationId,
          name: input.name.trim(),
          description: input.description ?? '',
          ...(input.category?.trim() ? { category: input.category.trim() } : {}),
          imageUrl: input.imageUrl?.trim() ?? '',
        });
        return story;
      },
      userId,
      storyHistoryOperations.locationCreated,
    );
    return this.locationResult(story, locationId);
  }

  async updateLocation(
    storyId: string,
    locationId: string,
    input: UpdateLocationDto,
    userId: string,
  ): Promise<LocationMutationResult> {
    const story = await this.mutations.update(
      storyId,
      (story) => {
        const location = this.location(story, locationId);
        if (input.name !== undefined) location.name = input.name.trim();
        if (input.description !== undefined) location.description = input.description;
        if (input.category !== undefined) {
          const category = input.category.trim();
          if (category) location.category = category;
          else delete location.category;
        }
        if (input.imageUrl !== undefined) location.imageUrl = input.imageUrl.trim();
        return story;
      },
      userId,
      storyHistoryOperations.locationUpdated,
    );
    return this.locationResult(story, locationId);
  }

  async createCharacter(
    storyId: string,
    input: CreateCharacterDto,
    userId: string,
  ): Promise<CharacterMutationResult> {
    const characterId = randomUUID();
    const story = await this.mutations.update(
      storyId,
      (story) => {
        if (input.isPlayable) {
          for (const character of story.characters ?? []) character.isPlayable = false;
        }
        (story.characters ??= []).push({
          id: characterId,
          name: input.name.trim(),
          description: input.description ?? '',
          ...(input.category?.trim() ? { category: input.category.trim() } : {}),
          imageUrl: input.imageUrl?.trim() ?? '',
          isPlayable: input.isPlayable ?? false,
          stats: [],
        });
        return story;
      },
      userId,
      storyHistoryOperations.characterCreated,
    );
    return this.characterResult(story, characterId);
  }

  async updateCharacter(
    storyId: string,
    characterId: string,
    input: UpdateCharacterDto,
    userId: string,
  ): Promise<CharacterMutationResult> {
    const story = await this.mutations.update(
      storyId,
      (story) => {
        const character = this.character(story, characterId);
        if (input.name !== undefined) character.name = input.name.trim();
        if (input.description !== undefined) character.description = input.description;
        if (input.category !== undefined) {
          const category = input.category.trim();
          if (category) character.category = category;
          else delete character.category;
        }
        if (input.imageUrl !== undefined) character.imageUrl = input.imageUrl.trim();
        if (input.isPlayable !== undefined) {
          if (input.isPlayable) {
            for (const candidate of story.characters ?? []) candidate.isPlayable = false;
          }
          character.isPlayable = input.isPlayable;
        }
        return story;
      },
      userId,
      storyHistoryOperations.characterUpdated,
    );
    return this.characterResult(story, characterId);
  }

  async createStatDefinition(
    storyId: string,
    input: CreateStatDefinitionDto,
    userId: string,
  ): Promise<StatDefinitionMutationResult> {
    const statDefinitionId = randomUUID();
    const story = await this.mutations.update(
      storyId,
      (story) => {
        createStatDefinition(story, statDefinitionId, {
          ...input,
          valueType: input.valueType ?? 'number',
        });
        return story;
      },
      userId,
      storyHistoryOperations.statDefinitionCreated,
    );
    return this.statDefinitionResult(story, statDefinitionId);
  }

  async updateStatDefinition(
    storyId: string,
    statDefinitionId: string,
    input: UpdateStatDefinitionDto,
    userId: string,
  ): Promise<StatDefinitionMutationResult> {
    const story = await this.mutations.update(
      storyId,
      (story) => {
        updateStatDefinition(story, statDefinitionId, input);
        return story;
      },
      userId,
      storyHistoryOperations.statDefinitionUpdated,
    );
    return this.statDefinitionResult(story, statDefinitionId);
  }

  async deleteStatDefinition(
    storyId: string,
    statDefinitionId: string,
    userId: string,
  ): Promise<Story> {
    return this.mutations.update(
      storyId,
      (story) => {
        deleteStatDefinition(story, statDefinitionId);
        return story;
      },
      userId,
      storyHistoryOperations.statDefinitionDeleted,
    );
  }

  async createStatAssignment(
    storyId: string,
    input: CreateStatAssignmentDto,
    userId: string,
  ): Promise<Story> {
    const statId = randomUUID();
    return this.mutations.update(
      storyId,
      (story) => {
        createStatAssignment(story, statId, input);
        return story;
      },
      userId,
      storyHistoryOperations.statAssignmentCreated,
    );
  }

  async updateStatAssignment(
    storyId: string,
    statId: string,
    input: UpdateStatAssignmentDto,
    userId: string,
  ): Promise<Story> {
    return this.mutations.update(
      storyId,
      (story) => {
        updateStatAssignment(story, statId, input.initialValue);
        return story;
      },
      userId,
      storyHistoryOperations.statAssignmentUpdated,
    );
  }

  async deleteStatAssignment(storyId: string, statId: string, userId: string): Promise<Story> {
    return this.mutations.update(
      storyId,
      (story) => {
        deleteStatAssignment(story, statId);
        return story;
      },
      userId,
      storyHistoryOperations.statAssignmentDeleted,
    );
  }

  async createItemDefinition(
    storyId: string,
    input: CreateItemDefinitionDto,
    userId: string,
  ): Promise<ItemDefinitionMutationResult> {
    const itemDefinitionId = randomUUID();
    const story = await this.mutations.update(
      storyId,
      (story) => {
        (story.itemDefinitions ??= []).push({
          id: itemDefinitionId,
          name: input.name.trim(),
          description: input.description ?? '',
          ...(input.category?.trim() ? { category: input.category.trim() } : {}),
          imageUrl: input.imageUrl?.trim() ?? '',
          stats: this.itemDefinitionStats(story, input.stats ?? []),
        });
        return story;
      },
      userId,
      storyHistoryOperations.itemDefinitionCreated,
    );
    return this.itemDefinitionResult(story, itemDefinitionId);
  }

  async updateItemDefinition(
    storyId: string,
    itemDefinitionId: string,
    input: UpdateItemDefinitionDto,
    userId: string,
  ): Promise<ItemDefinitionMutationResult> {
    const story = await this.mutations.update(
      storyId,
      (story) => {
        const definition = this.itemDefinition(story, itemDefinitionId);
        if (input.name !== undefined) definition.name = input.name.trim();
        if (input.description !== undefined) definition.description = input.description;
        if (input.category !== undefined) {
          const category = input.category.trim();
          if (category) definition.category = category;
          else delete definition.category;
        }
        if (input.imageUrl !== undefined) definition.imageUrl = input.imageUrl.trim();
        if (input.stats !== undefined) {
          const nextStats = this.itemDefinitionStats(story, input.stats, definition.stats ?? []);
          const nextIds = new Set(nextStats.map(({ id }) => id));
          for (const current of definition.stats ?? []) {
            if (!nextIds.has(current.id)) deleteStatAssignment(story, current.id);
          }
          definition.stats = nextStats;
        }
        return story;
      },
      userId,
      storyHistoryOperations.itemDefinitionUpdated,
    );
    return this.itemDefinitionResult(story, itemDefinitionId);
  }

  async createCharacterStat(
    storyId: string,
    characterId: string,
    input: CreateCharacterStatDto,
    userId: string,
  ): Promise<CharacterStatMutationResult> {
    const statId = randomUUID();
    const story = await this.mutations.update(
      storyId,
      (story) => {
        createStatAssignment(story, statId, {
          ...input,
          ownerType: 'character',
          ownerId: characterId,
        });
        return story;
      },
      userId,
      storyHistoryOperations.statAssignmentCreated,
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
    const story = await this.mutations.update(
      storyId,
      (story) => {
        const stat = this.stat(story, characterId, statId);
        updateStatAssignment(story, stat.id, input.initialValue);
        return story;
      },
      userId,
      storyHistoryOperations.statAssignmentUpdated,
    );
    return this.statResult(story, characterId, statId);
  }

  async deleteCharacterStat(
    storyId: string,
    characterId: string,
    statId: string,
    userId: string,
  ): Promise<Story> {
    return this.mutations.update(
      storyId,
      (story) => {
        this.stat(story, characterId, statId);
        deleteStatAssignment(story, statId);
        return story;
      },
      userId,
      storyHistoryOperations.statAssignmentDeleted,
    );
  }

  async createCharacterItem(
    storyId: string,
    characterId: string,
    input: CreateCharacterItemDto,
    userId: string,
  ): Promise<CharacterItemMutationResult> {
    const itemId = randomUUID();
    const story = await this.mutations.update(
      storyId,
      (story) => {
        const character = this.character(story, characterId);
        this.itemDefinition(story, input.itemDefinitionId);
        (character.items ??= []).push({
          id: itemId,
          itemDefinitionId: input.itemDefinitionId,
        });
        return story;
      },
      userId,
      storyHistoryOperations.itemInstanceCreated,
    );
    return this.itemResult(story, characterId, itemId);
  }

  async moveItemInstance(
    storyId: string,
    itemId: string,
    input: MoveItemInstanceDto,
    userId: string,
  ): Promise<Story> {
    return this.mutations.update(
      storyId,
      (story) => moveStoryItemInstance(story, itemId, input),
      userId,
      storyHistoryOperations.itemInstanceMoved,
    );
  }

  async deleteCharacterItem(
    storyId: string,
    characterId: string,
    itemId: string,
    userId: string,
  ): Promise<Story> {
    return this.mutations.update(
      storyId,
      (story) => {
        const character = this.character(story, characterId);
        this.item(story, characterId, itemId);
        if (
          getItemDescendantIds(
            getStoryItemEntries(story).map(({ item }) => item),
            itemId,
          ).size > 0
        ) {
          throw new BadRequestException(
            'Move or remove contained items before deleting a container',
          );
        }
        character.items = (character.items ?? []).filter(({ id }) => id !== itemId);
        for (const interaction of story.interactions) {
          interaction.itemEffects = (interaction.itemEffects ?? []).filter(
            ({ itemId: affectedItemId }) => affectedItemId !== itemId,
          );
          interaction.statEffects = (interaction.statEffects ?? []).filter(
            ({ itemId: affectedItemId }) => affectedItemId !== itemId,
          );
          for (const trigger of interaction.triggers) {
            trigger.conditionGroups = getTriggerConditionGroups(trigger).map((group) => ({
              ...group,
              conditions: group.conditions.filter(
                (condition) => !('statId' in condition) || condition.itemId !== itemId,
              ),
            }));
            trigger.appearanceProbability = getTriggerAppearanceProbability(trigger);
            delete trigger.conditions;
          }
        }
        return story;
      },
      userId,
      storyHistoryOperations.itemInstanceDeleted,
    );
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

  private statDefinition(story: Story, id: string) {
    const definition = (story.statDefinitions ?? []).find((item) => item.id === id);
    if (!definition) throw new NotFoundException('Stat definition not found');
    return definition;
  }

  private itemDefinition(story: Story, id: string) {
    const definition = (story.itemDefinitions ?? []).find((item) => item.id === id);
    if (!definition) throw new NotFoundException('Item definition not found');
    return definition;
  }

  private item(story: Story, characterId: string, itemId: string) {
    const item = this.character(story, characterId).items?.find(({ id }) => id === itemId);
    if (!item) throw new NotFoundException('Character item not found');
    return item;
  }

  private itemDefinitionStats(
    story: Story,
    stats: Array<{ id?: string; statDefinitionId: string; initialValue: unknown }>,
    existing: Array<{ id: string; statDefinitionId: string; initialValue: unknown }> = [],
  ) {
    const definitions = new Map(
      (story.statDefinitions ?? []).map((definition) => [definition.id, definition]),
    );
    if (stats.some(({ statDefinitionId }) => !definitions.has(statDefinitionId))) {
      throw new BadRequestException('Item stats must belong to the same story');
    }
    if (new Set(stats.map(({ statDefinitionId }) => statDefinitionId)).size !== stats.length) {
      throw new BadRequestException('An item definition can only assign a stat once');
    }
    return stats.map((stat) => {
      const definition = definitions.get(stat.statDefinitionId)!;
      const existingAssignment = existing.find(
        ({ statDefinitionId }) => statDefinitionId === stat.statDefinitionId,
      );
      if (
        (typeof stat.initialValue !== 'number' &&
          typeof stat.initialValue !== 'boolean' &&
          typeof stat.initialValue !== 'string') ||
        !isStatValueOfType(stat.initialValue, getStatValueType(definition))
      ) {
        throw new BadRequestException(`Stat value must be a ${getStatValueType(definition)}`);
      }
      return {
        id: existingAssignment?.id ?? randomUUID(),
        statDefinitionId: stat.statDefinitionId,
        initialValue: stat.initialValue,
      };
    });
  }

  private locationResult(story: Story, locationId: string): LocationMutationResult {
    return {
      location: structuredClone(this.location(story, locationId)),
      ...storyMutationMetadata(story),
    };
  }

  private characterResult(story: Story, characterId: string): CharacterMutationResult {
    return {
      character: structuredClone(this.character(story, characterId)),
      ...storyMutationMetadata(story),
    };
  }

  private statDefinitionResult(
    story: Story,
    statDefinitionId: string,
  ): StatDefinitionMutationResult {
    return {
      statDefinition: structuredClone(this.statDefinition(story, statDefinitionId)),
      ...storyMutationMetadata(story),
    };
  }

  private itemDefinitionResult(
    story: Story,
    itemDefinitionId: string,
  ): ItemDefinitionMutationResult {
    return {
      itemDefinition: structuredClone(this.itemDefinition(story, itemDefinitionId)),
      ...storyMutationMetadata(story),
    };
  }

  private itemResult(
    story: Story,
    characterId: string,
    itemId: string,
  ): CharacterItemMutationResult {
    return {
      characterId,
      item: structuredClone(this.item(story, characterId, itemId)),
      ...storyMutationMetadata(story),
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
      ...storyMutationMetadata(story),
    };
  }
}
