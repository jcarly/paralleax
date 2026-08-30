import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  deleteGraphDecorationFromStory,
  deleteInteractionFromStory,
  deleteTriggerInStory,
  getStoryItemEntries,
  isStoryDate,
  isStoryTime,
  normalizeTriggerInputIds,
  updateGraphDecorationInStory,
  updateStoryGraphPositions,
  updateTriggerInStory,
  type GraphDecorationMutationResult,
  type InteractionMutationResult,
  type Story,
  type TriggerCondition,
  type TriggerMutationResult,
} from '@paralleax/shared';
import type {
  CreateGraphDecorationDto,
  CreateInteractionDto,
  CreateTriggerDto,
  TriggerConditionDto,
  UpdateGraphDecorationDto,
  UpdateInteractionDto,
  UpdateStoryGraphPositionsDto,
  UpdateTriggerDto,
} from '../dto/stories.dto';
import { sanitizeRichText } from '../rich-text';
import { buildGraphDecoration } from './graph-decorations';
import { storyMutationMetadata } from './story-mutation-results';
import { StoryMutationService } from './story-mutations';
import { buildStatCondition, validateStatEffects } from './story-stats';

@Injectable()
export class StoryGraphService {
  constructor(private readonly mutations: StoryMutationService) {}

  async createInteraction(
    storyId: string,
    input: CreateInteractionDto,
    userId: string,
  ): Promise<InteractionMutationResult> {
    const interactionId = randomUUID();
    const triggerId = randomUUID();
    const story = await this.mutations.update(
      storyId,
      (story) => {
        if (input.parentId && !story.interactions.some((item) => item.id === input.parentId)) {
          throw new NotFoundException('Parent interaction not found');
        }
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
    const story = await this.mutations.update(
      storyId,
      (story) => {
        const interaction = this.interaction(story, interactionId);
        if (input.title !== undefined) interaction.title = input.title;
        if (input.conditionalTextBlocks !== undefined) {
          const blockIds = input.conditionalTextBlocks.map(({ id }) => id);
          if (new Set(blockIds).size !== blockIds.length) {
            throw new BadRequestException('Conditional text block IDs must be unique');
          }
          interaction.conditionalTextBlocks = input.conditionalTextBlocks.map((block) => ({
            id: block.id,
            conditions: this.conditions(story, block.conditions),
          }));
        }
        if (input.body !== undefined) interaction.body = sanitizeRichText(input.body ?? '', story);
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
          interaction.statEffects = validateStatEffects(story, input.statEffects);
        }
        if (input.itemEffects !== undefined) {
          const itemIds = new Set(getStoryItemEntries(story).map(({ item }) => item.id));
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
        if (input.durationMinutes !== undefined) {
          interaction.durationMinutes = input.durationMinutes;
        }
        return story;
      },
      userId,
    );
    return this.interactionResult(story, interactionId);
  }

  async updatePositions(storyId: string, input: UpdateStoryGraphPositionsDto, userId: string) {
    if (input.interactionUpdates.length === 0 && input.triggerUpdates.length === 0) {
      throw new BadRequestException('At least one graph position update is required');
    }
    const story = await this.mutations.update(
      storyId,
      (story) => {
        const interactionIds = new Set(story.interactions.map(({ id }) => id));
        const updatedInteractionIds = input.interactionUpdates.map(
          ({ interactionId }) => interactionId,
        );
        if (
          new Set(updatedInteractionIds).size !== updatedInteractionIds.length ||
          updatedInteractionIds.some((id) => !interactionIds.has(id))
        ) {
          throw new BadRequestException(
            'Graph interaction position targets must be unique and belong to the Story',
          );
        }
        const updatedTriggerKeys = input.triggerUpdates.flatMap(({ interactionId, triggerIds }) =>
          triggerIds.map((triggerId) => `${interactionId}:${triggerId}`),
        );
        if (new Set(updatedTriggerKeys).size !== updatedTriggerKeys.length) {
          throw new BadRequestException('Graph Trigger position targets must be unique');
        }
        for (const { interactionId, triggerIds } of input.triggerUpdates) {
          const interaction = story.interactions.find(({ id }) => id === interactionId);
          const storyTriggerIds = new Set(interaction?.triggers.map(({ id }) => id) ?? []);
          if (!interaction || triggerIds.some((triggerId) => !storyTriggerIds.has(triggerId))) {
            throw new BadRequestException(
              'Graph Trigger position targets must belong to their Story interaction',
            );
          }
        }
        return updateStoryGraphPositions(story, input);
      },
      userId,
    );
    return storyMutationMetadata(story);
  }

  deleteInteraction(storyId: string, interactionId: string, userId: string): Promise<Story> {
    return this.mutations.update(
      storyId,
      (story) => {
        this.interaction(story, interactionId);
        return deleteInteractionFromStory(story, interactionId);
      },
      userId,
    );
  }

  async createGraphDecoration(
    storyId: string,
    input: CreateGraphDecorationDto,
    userId: string,
  ): Promise<GraphDecorationMutationResult> {
    const decorationId = randomUUID();
    const story = await this.mutations.update(
      storyId,
      (story) => {
        (story.graphDecorations ??= []).push(buildGraphDecoration(decorationId, input));
        return story;
      },
      userId,
    );
    return this.graphDecorationResult(story, decorationId);
  }

  async updateGraphDecoration(
    storyId: string,
    decorationId: string,
    input: UpdateGraphDecorationDto,
    userId: string,
  ): Promise<GraphDecorationMutationResult> {
    const story = await this.mutations.update(
      storyId,
      (story) => {
        this.graphDecoration(story, decorationId);
        return updateGraphDecorationInStory(story, decorationId, input);
      },
      userId,
    );
    return this.graphDecorationResult(story, decorationId);
  }

  deleteGraphDecoration(storyId: string, decorationId: string, userId: string): Promise<Story> {
    return this.mutations.update(
      storyId,
      (story) => {
        this.graphDecoration(story, decorationId);
        return deleteGraphDecorationFromStory(story, decorationId);
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
    const story = await this.mutations.update(
      storyId,
      (story) => {
        const interaction = this.interaction(story, interactionId);
        const trigger = interaction.triggers.find((item) => item.id === triggerId);
        if (!trigger) throw new NotFoundException('Trigger not found');
        const conditions =
          input.conditions === undefined
            ? trigger.conditions
            : this.conditions(story, input.conditions);
        const inputInteractionIds =
          input.inputInteractionIds === undefined
            ? trigger.inputInteractionIds
            : normalizeTriggerInputIds(input.inputInteractionIds);
        this.assertInteractionReferences(story, inputInteractionIds);
        return updateTriggerInStory(story, interactionId, triggerId, {
          inputInteractionIds,
          conditions,
          ...(input.position === undefined ? {} : { position: input.position }),
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
    const story = await this.mutations.update(
      storyId,
      (story) => {
        const conditions = this.conditions(story, input.conditions ?? []);
        this.assertInteractionReferences(story, input.inputInteractionIds ?? []);
        this.interaction(story, interactionId).triggers.push({
          id: triggerId,
          inputInteractionIds: normalizeTriggerInputIds(input.inputInteractionIds ?? []),
          conditions,
          ...(input.position === undefined ? {} : { position: input.position }),
        });
        return story;
      },
      userId,
    );
    return this.triggerResult(story, interactionId, triggerId);
  }

  deleteTrigger(
    storyId: string,
    interactionId: string,
    triggerId: string,
    userId: string,
  ): Promise<Story> {
    return this.mutations.update(
      storyId,
      (story) => {
        const interaction = this.interaction(story, interactionId);
        if (!interaction.triggers.some((item) => item.id === triggerId)) {
          throw new NotFoundException('Trigger not found');
        }
        return deleteTriggerInStory(story, interactionId, triggerId);
      },
      userId,
    );
  }

  private interaction(story: Story, id: string) {
    const interaction = story.interactions.find((item) => item.id === id);
    if (!interaction) throw new NotFoundException('Interaction not found');
    return interaction;
  }

  private graphDecoration(story: Story, id: string) {
    const decoration = (story.graphDecorations ?? []).find((item) => item.id === id);
    if (!decoration) throw new NotFoundException('Graph decoration not found');
    return decoration;
  }

  private assertInteractionReferences(story: Story, inputInteractionIds: string[]) {
    const interactionIds = new Set(story.interactions.map(({ id }) => id));
    if (inputInteractionIds.some((id) => !interactionIds.has(id))) {
      throw new BadRequestException('Trigger references must belong to the same story');
    }
  }

  private conditions(story: Story, conditions: TriggerConditionDto[]): TriggerCondition[] {
    const interactionIds = new Set(story.interactions.map(({ id }) => id));
    const locationIds = new Set((story.locations ?? []).map(({ id }) => id));
    const characterIds = new Set((story.characters ?? []).map(({ id }) => id));
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
          'A condition must contain exactly one supported condition type',
        );
      }
      if (isInteractionCondition) {
        if (!interactionIds.has(condition.interactionId!)) {
          throw new BadRequestException('Condition references must belong to the same story');
        }
        return {
          interactionId: condition.interactionId!,
          hasBeenVisited: condition.hasBeenVisited!,
        };
      }
      if (isLocationCondition) {
        if (!locationIds.has(condition.locationId!)) {
          throw new BadRequestException('Condition references must belong to the same story');
        }
        return {
          locationId: condition.locationId!,
          isCurrentLocation: condition.isCurrentLocation!,
        };
      }
      if (isCharacterCondition) {
        if (!characterIds.has(condition.characterId!)) {
          throw new BadRequestException('Condition references must belong to the same story');
        }
        return {
          characterId: condition.characterId!,
          isPresent: condition.isPresent!,
        };
      }
      if (isItemCondition) {
        if (!itemDefinitionIds.has(condition.itemDefinitionId!)) {
          throw new BadRequestException('Condition references must belong to the same story');
        }
        return {
          itemDefinitionId: condition.itemDefinitionId!,
          isOwned: condition.isOwned!,
        };
      }
      if (isStatCondition) {
        return buildStatCondition(story, {
          statId: condition.statId!,
          ...(condition.itemId ? { itemId: condition.itemId } : {}),
          operator: condition.operator!,
          value: condition.value,
        });
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
          throw new BadRequestException('Temporal condition is invalid');
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
      throw new BadRequestException('Condition is invalid');
    });
  }

  private interactionResult(story: Story, interactionId: string): InteractionMutationResult {
    return {
      interaction: structuredClone(this.interaction(story, interactionId)),
      ...storyMutationMetadata(story),
    };
  }

  private graphDecorationResult(story: Story, decorationId: string): GraphDecorationMutationResult {
    return {
      decoration: structuredClone(this.graphDecoration(story, decorationId)),
      ...storyMutationMetadata(story),
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
      ...storyMutationMetadata(story),
    };
  }
}
