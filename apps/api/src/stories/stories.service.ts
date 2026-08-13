import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  createDemoStory,
  defaultStoryAccess,
  buildReaderProgressState,
  isStoryDate,
  isStoryDateTime,
  isStoryTime,
  deleteInteractionFromStory,
  deleteTriggerInStory,
  ensureStoryInteractionPositions,
  normalizeTriggerInputIds,
  updateTriggerInStory,
  type CharacterMutationResult,
  type CharacterItemMutationResult,
  type CharacterStatMutationResult,
  type InteractionMutationResult,
  type ItemDefinitionMutationResult,
  type ItemInstance,
  type LocationMutationResult,
  type ReaderProgress,
  type StatDefinitionMutationResult,
  type Story,
  type TriggerCondition,
  type TriggerMutationResult,
  type StoryAccessSettings,
} from '@paralleax/shared';
import {
  CreateInteractionDto,
  CreateCharacterDto,
  CreateCharacterItemDto,
  CreateCharacterStatDto,
  CreateLocationDto,
  MoveItemInstanceDto,
  CreateItemDefinitionDto,
  CreateStatDefinitionDto,
  CreateStoryDto,
  CreateTriggerDto,
  SaveReaderProgressDto,
  UpdateInteractionDto,
  UpdateCharacterDto,
  UpdateCharacterStatDto,
  UpdateLocationDto,
  UpdateItemDefinitionDto,
  UpdateStatDefinitionDto,
  UpdateTriggerDto,
  UpdateStoryDto,
  TriggerConditionDto,
  UpdateStoryAccessDto,
  SetStoryCollaboratorDto,
} from './dto/stories.dto';
import { sanitizeRichText } from './rich-text';
import { StoriesRepository } from './stories.repository';

@Injectable()
export class StoriesService {
  constructor(private readonly repository: StoriesRepository) {}

  async list(userId: string) {
    return this.repository.list(userId);
  }
  async get(id: string, userId?: string): Promise<Story> {
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
      startDateTime: now.slice(0, 16),
      locations: [],
      characters: [],
      interactions: [],
      access: { ...defaultStoryAccess },
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.save(story, userId);
    return structuredClone(story);
  }
  async createDemo(userId: string): Promise<Story> {
    const now = new Date().toISOString();
    const story = createDemoStory(randomUUID(), now);
    story.access = { ...defaultStoryAccess };
    await this.repository.save(story, userId);
    return structuredClone(story);
  }
  async updateStory(id: string, input: UpdateStoryDto, userId: string): Promise<Story> {
    return this.update(
      id,
      (story) => {
        if (input.title !== undefined) story.title = input.title.trim() || 'Untitled';
        if (input.startDateTime !== undefined) {
          if (!isStoryDateTime(input.startDateTime)) {
            throw new BadRequestException('Story start date and time is invalid');
          }
          story.startDateTime = input.startDateTime;
        }
        return story;
      },
      userId,
    );
  }
  async delete(id: string, userId: string): Promise<void> {
    if (!(await this.repository.delete(id, userId))) throw new NotFoundException('Story not found');
  }
  async getProgress(storyId: string, userId: string): Promise<ReaderProgress | null> {
    await this.get(storyId, userId);
    const progress = await this.repository.findProgress(storyId, userId);
    return progress ?? null;
  }
  async getAccess(storyId: string, userId: string) {
    const access = await this.repository.getAccess(storyId, userId);
    if (!access) throw new NotFoundException('Story not found');
    return access;
  }
  async updateAccess(storyId: string, input: UpdateStoryAccessDto, userId: string) {
    const settings: StoryAccessSettings = {
      visibility: input.visibility,
      editPolicy: input.editPolicy,
      commentPolicy: input.commentPolicy,
    };
    if (!(await this.repository.updateAccess(storyId, userId, settings))) {
      throw new NotFoundException('Story not found');
    }
    return this.getAccess(storyId, userId);
  }
  async setCollaborator(storyId: string, input: SetStoryCollaboratorDto, userId: string) {
    await this.getAccess(storyId, userId);
    const email = input.email.trim().toLowerCase();
    if (!(await this.repository.setCollaborator(storyId, userId, email, input.role))) {
      throw new BadRequestException('The collaborator must be an existing non-owner account');
    }
    return this.getAccess(storyId, userId);
  }
  async removeCollaborator(storyId: string, collaboratorId: string, userId: string) {
    await this.getAccess(storyId, userId);
    await this.repository.removeCollaborator(storyId, userId, collaboratorId);
  }
  async saveProgress(
    storyId: string,
    input: SaveReaderProgressDto,
    userId: string,
  ): Promise<ReaderProgress> {
    const story = await this.get(storyId, userId);
    const interactionIds = new Set(story.interactions.map(({ id }) => id));
    if (input.journeyInteractionIds.some((id) => !interactionIds.has(id))) {
      throw new BadRequestException('Reader journey interactions must belong to the same story');
    }
    const itemIds = this.itemIds(story);
    if ((input.ownedItemIds ?? []).some((id) => !itemIds.has(id))) {
      throw new BadRequestException('Reader items must belong to the same story');
    }
    const state = buildReaderProgressState(story, input.journeyInteractionIds, input.ownedItemIds);
    const updatedAt = new Date().toISOString();
    if (!(await this.repository.saveProgress(storyId, userId, state, updatedAt))) {
      throw new NotFoundException('Story not found');
    }
    return { state, updatedAt };
  }
  async deleteProgress(storyId: string, userId: string): Promise<void> {
    await this.get(storyId, userId);
    await this.repository.deleteProgress(storyId, userId);
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
          durationMinutes: 0,
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
        if (input.body !== undefined) interaction.body = sanitizeRichText(input.body ?? '');
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
        if (input.itemEffects !== undefined) {
          const itemIds = this.itemIds(story);
          const itemDefinitionIds = new Set((story.itemDefinitions ?? []).map(({ id }) => id));
          const characterIds = new Set((story.characters ?? []).map(({ id }) => id));
          if (
            input.itemEffects.some(
              ({ itemId, itemDefinitionId, characterId }) =>
                Number(itemId !== undefined) + Number(itemDefinitionId !== undefined) !== 1 ||
                (itemId !== undefined && !itemIds.has(itemId)) ||
                (itemDefinitionId !== undefined && !itemDefinitionIds.has(itemDefinitionId)) ||
                (characterId !== undefined && !characterIds.has(characterId)),
            )
          ) {
            throw new BadRequestException('Item effects must belong to the same story');
          }
          const effectTargets = input.itemEffects.map(
            ({ itemId, itemDefinitionId, characterId }) =>
              `${characterId ?? ''}:${itemId ?? `definition:${itemDefinitionId}`}`,
          );
          if (new Set(effectTargets).size !== input.itemEffects.length) {
            throw new BadRequestException('An interaction can only affect an item once');
          }
          interaction.itemEffects = input.itemEffects;
        }
        if (input.itemStatEffects !== undefined) {
          const items = new Map(
            [...(story.characters ?? []), ...(story.locations ?? [])].flatMap((owner) =>
              (owner.items ?? []).map((item) => [item.id, item]),
            ),
          );
          const definitions = new Map(
            (story.itemDefinitions ?? []).map((definition) => [definition.id, definition]),
          );
          if (
            input.itemStatEffects.some((effect) => {
              const item = items.get(effect.itemId);
              return (
                !item ||
                !(definitions.get(item.itemDefinitionId)?.stats ?? []).some(
                  ({ statDefinitionId }) => statDefinitionId === effect.statDefinitionId,
                )
              );
            })
          ) {
            throw new BadRequestException(
              'Item stat effects must reference a stat assigned to the same-story item',
            );
          }
          const effectKeys = input.itemStatEffects.map(
            ({ itemId, statDefinitionId }) => `${itemId}:${statDefinitionId}`,
          );
          if (new Set(effectKeys).size !== effectKeys.length) {
            throw new BadRequestException('An interaction can only affect an item stat once');
          }
          interaction.itemStatEffects = input.itemStatEffects;
        }
        if (input.durationMinutes !== undefined) {
          interaction.durationMinutes = input.durationMinutes;
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
          ...(input.category?.trim() ? { category: input.category.trim() } : {}),
          imageUrl: input.imageUrl?.trim() ?? '',
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
        if (input.category !== undefined) {
          const category = input.category.trim();
          if (category) location.category = category;
          else delete location.category;
        }
        if (input.imageUrl !== undefined) location.imageUrl = input.imageUrl.trim();
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
    );
    return this.characterResult(story, characterId);
  }
  async createStatDefinition(
    storyId: string,
    input: CreateStatDefinitionDto,
    userId: string,
  ): Promise<StatDefinitionMutationResult> {
    const statDefinitionId = randomUUID();
    const story = await this.update(
      storyId,
      (story) => {
        (story.statDefinitions ??= []).push({
          id: statDefinitionId,
          name: input.name.trim(),
          ...(input.category?.trim() ? { category: input.category.trim() } : {}),
          imageUrl: input.imageUrl?.trim() ?? '',
          changePerHour: input.changePerHour ?? 0,
        });
        return story;
      },
      userId,
    );
    return this.statDefinitionResult(story, statDefinitionId);
  }
  async createItemDefinition(
    storyId: string,
    input: CreateItemDefinitionDto,
    userId: string,
  ): Promise<ItemDefinitionMutationResult> {
    const itemDefinitionId = randomUUID();
    const story = await this.update(
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
    );
    return this.itemDefinitionResult(story, itemDefinitionId);
  }
  async updateItemDefinition(
    storyId: string,
    itemDefinitionId: string,
    input: UpdateItemDefinitionDto,
    userId: string,
  ): Promise<ItemDefinitionMutationResult> {
    const story = await this.update(
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
          definition.stats = this.itemDefinitionStats(story, input.stats);
          const assignedStatIds = new Set(
            definition.stats.map(({ statDefinitionId }) => statDefinitionId),
          );
          const affectedItemIds = new Set(
            [...(story.characters ?? []), ...(story.locations ?? [])].flatMap((owner) =>
              (owner.items ?? [])
                .filter(({ itemDefinitionId }) => itemDefinitionId === definition.id)
                .map(({ id }) => id),
            ),
          );
          for (const interaction of story.interactions) {
            interaction.itemStatEffects = (interaction.itemStatEffects ?? []).filter(
              ({ itemId, statDefinitionId }) =>
                !affectedItemIds.has(itemId) || assignedStatIds.has(statDefinitionId),
            );
          }
        }
        return story;
      },
      userId,
    );
    return this.itemDefinitionResult(story, itemDefinitionId);
  }
  async updateStatDefinition(
    storyId: string,
    statDefinitionId: string,
    input: UpdateStatDefinitionDto,
    userId: string,
  ): Promise<StatDefinitionMutationResult> {
    const story = await this.update(
      storyId,
      (story) => {
        const definition = this.statDefinition(story, statDefinitionId);
        if (input.name !== undefined) definition.name = input.name.trim();
        if (input.category !== undefined) {
          const category = input.category.trim();
          if (category) definition.category = category;
          else delete definition.category;
        }
        if (input.imageUrl !== undefined) definition.imageUrl = input.imageUrl.trim();
        if (input.changePerHour !== undefined) definition.changePerHour = input.changePerHour;
        return story;
      },
      userId,
    );
    return this.statDefinitionResult(story, statDefinitionId);
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
        this.statDefinition(story, input.statDefinitionId);
        if (
          (character.stats ?? []).some(
            ({ statDefinitionId }) => statDefinitionId === input.statDefinitionId,
          )
        ) {
          throw new BadRequestException('Character already has this stat');
        }
        (character.stats ??= []).push({
          id: statId,
          statDefinitionId: input.statDefinitionId,
          initialValue: input.initialValue,
        });
        return story;
      },
      userId,
    );
    return this.statResult(story, characterId, statId);
  }
  async createCharacterItem(
    storyId: string,
    characterId: string,
    input: CreateCharacterItemDto,
    userId: string,
  ): Promise<CharacterItemMutationResult> {
    const itemId = randomUUID();
    const story = await this.update(
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
    );
    return this.itemResult(story, characterId, itemId);
  }
  async moveItemInstance(
    storyId: string,
    itemId: string,
    input: MoveItemInstanceDto,
    userId: string,
  ): Promise<Story> {
    return this.update(
      storyId,
      (story) => {
        const entries = [
          ...(story.characters ?? []).flatMap((character) =>
            (character.items ?? []).map((item) => ({ owner: character, item })),
          ),
          ...(story.locations ?? []).flatMap((location) =>
            (location.items ?? []).map((item) => ({ owner: location, item })),
          ),
        ];
        const moving = entries.find(({ item }) => item.id === itemId);
        if (!moving) throw new NotFoundException('Item instance not found');
        const targets =
          Number(Boolean(input.characterId)) +
          Number(Boolean(input.locationId)) +
          Number(Boolean(input.parentItemId));
        if (targets !== 1) {
          throw new BadRequestException(
            'An item placement must target exactly one character, location, or parent item',
          );
        }

        const descendants = new Set([itemId]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const { item } of entries) {
            if (
              item.parentItemId &&
              descendants.has(item.parentItemId) &&
              !descendants.has(item.id)
            ) {
              descendants.add(item.id);
              changed = true;
            }
          }
        }

        let targetOwner: { items?: ItemInstance[] } | undefined = input.characterId
          ? this.character(story, input.characterId)
          : input.locationId
            ? this.location(story, input.locationId)
            : undefined;
        if (input.parentItemId) {
          if (!input.relationshipType) {
            throw new BadRequestException('A parent item placement requires a relationship type');
          }
          if (descendants.has(input.parentItemId)) {
            throw new BadRequestException('An item cannot become a descendant of itself');
          }
          const parent = entries.find(({ item }) => item.id === input.parentItemId);
          if (!parent) throw new BadRequestException('Parent item must belong to the same story');
          targetOwner = parent.owner;
        } else if (input.relationshipType || input.slotKey) {
          throw new BadRequestException(
            'Relationship type and slot are only valid for a parent item placement',
          );
        }

        const subtree = entries
          .filter(({ item }) => descendants.has(item.id))
          .map(({ item }) => item);
        for (const character of story.characters ?? []) {
          character.items = (character.items ?? []).filter(({ id }) => !descendants.has(id));
        }
        for (const location of story.locations ?? []) {
          location.items = (location.items ?? []).filter(({ id }) => !descendants.has(id));
        }
        if (input.parentItemId) {
          moving.item.parentItemId = input.parentItemId;
          moving.item.relationshipType = input.relationshipType;
          if (input.slotKey) moving.item.slotKey = input.slotKey;
          else delete moving.item.slotKey;
        } else {
          delete moving.item.parentItemId;
          delete moving.item.relationshipType;
          delete moving.item.slotKey;
        }
        (targetOwner!.items ??= []).push(...subtree);
        return story;
      },
      userId,
    );
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
        if (input.initialValue !== undefined) stat.initialValue = input.initialValue;
        return story;
      },
      userId,
    );
    return this.statResult(story, characterId, statId);
  }
  async deleteCharacterStat(
    storyId: string,
    characterId: string,
    statId: string,
    userId: string,
  ): Promise<Story> {
    return this.update(
      storyId,
      (story) => {
        const character = this.character(story, characterId);
        this.stat(story, characterId, statId);
        character.stats = (character.stats ?? []).filter(({ id }) => id !== statId);
        for (const interaction of story.interactions) {
          interaction.statEffects = (interaction.statEffects ?? []).filter(
            ({ statId: affectedStatId }) => affectedStatId !== statId,
          );
          for (const trigger of interaction.triggers) {
            trigger.conditions = trigger.conditions.filter(
              (condition) => !('statId' in condition) || condition.statId !== statId,
            );
          }
        }
        return story;
      },
      userId,
    );
  }
  async deleteCharacterItem(
    storyId: string,
    characterId: string,
    itemId: string,
    userId: string,
  ): Promise<Story> {
    return this.update(
      storyId,
      (story) => {
        const character = this.character(story, characterId);
        this.item(story, characterId, itemId);
        if (
          [...(story.characters ?? []), ...(story.locations ?? [])].some((candidate) =>
            (candidate.items ?? []).some(({ parentItemId }) => parentItemId === itemId),
          )
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
          interaction.itemStatEffects = (interaction.itemStatEffects ?? []).filter(
            ({ itemId: affectedItemId }) => affectedItemId !== itemId,
          );
        }
        return story;
      },
      userId,
    );
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
  private statIds(story: Story) {
    return new Set(
      (story.characters ?? []).flatMap((character) => (character.stats ?? []).map(({ id }) => id)),
    );
  }
  private itemIds(story: Story) {
    return new Set(
      [...(story.characters ?? []), ...(story.locations ?? [])].flatMap((owner) =>
        (owner.items ?? []).map(({ id }) => id),
      ),
    );
  }
  private itemDefinitionStats(
    story: Story,
    stats: Array<{ statDefinitionId: string; initialValue: number }>,
  ) {
    const definitionIds = new Set((story.statDefinitions ?? []).map(({ id }) => id));
    if (stats.some(({ statDefinitionId }) => !definitionIds.has(statDefinitionId))) {
      throw new BadRequestException('Item stats must belong to the same story');
    }
    if (new Set(stats.map(({ statDefinitionId }) => statDefinitionId)).size !== stats.length) {
      throw new BadRequestException('An item definition can only assign a stat once');
    }
    return stats;
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
    const itemDefinitionIds = new Set((story.itemDefinitions ?? []).map(({ id }) => id));
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
      const isItemCondition =
        condition.itemDefinitionId !== undefined && condition.isOwned !== undefined;
      const isTemporalCondition = condition.temporal !== undefined;
      if (
        Number(isInteractionCondition) +
          Number(isLocationCondition) +
          Number(isCharacterCondition) +
          Number(isStatCondition) +
          Number(isItemCondition) +
          Number(isTemporalCondition) !==
        1
      ) {
        throw new BadRequestException(
          'A trigger condition must contain exactly one supported condition type',
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
      if (isItemCondition) {
        if (!itemDefinitionIds.has(condition.itemDefinitionId!)) {
          throw new BadRequestException('Trigger references must belong to the same story');
        }
        return {
          itemDefinitionId: condition.itemDefinitionId!,
          isOwned: condition.isOwned!,
        };
      }
      if (isTemporalCondition) {
        const temporal = condition.temporal!;
        const dates = [...new Set(temporal.dates ?? [])];
        const dateRanges = temporal.dateRanges ?? [];
        const weekdays = [...new Set(temporal.weekdays ?? [])];
        const timeSlots = temporal.timeSlots ?? [];
        if (
          dates.length + dateRanges.length + weekdays.length + timeSlots.length === 0 ||
          dates.some((date) => !isStoryDate(date)) ||
          dateRanges.some(
            ({ startDate, endDate }) =>
              !isStoryDate(startDate) || !isStoryDate(endDate) || startDate > endDate,
          ) ||
          timeSlots.some(
            ({ startTime, endTime }) =>
              !isStoryTime(startTime) || !isStoryTime(endTime) || startTime === endTime,
          )
        ) {
          throw new BadRequestException('Temporal trigger condition is invalid');
        }
        return {
          temporal: {
            dates,
            dateRanges: dateRanges.map((range) => ({ ...range })),
            weekdays,
            timeSlots: timeSlots.map((slot) => ({ ...slot })),
          },
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
  private statDefinitionResult(
    story: Story,
    statDefinitionId: string,
  ): StatDefinitionMutationResult {
    return {
      statDefinition: structuredClone(this.statDefinition(story, statDefinitionId)),
      revision: story.revision ?? 1,
      updatedAt: story.updatedAt,
    };
  }
  private itemDefinitionResult(
    story: Story,
    itemDefinitionId: string,
  ): ItemDefinitionMutationResult {
    return {
      itemDefinition: structuredClone(this.itemDefinition(story, itemDefinitionId)),
      revision: story.revision ?? 1,
      updatedAt: story.updatedAt,
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
