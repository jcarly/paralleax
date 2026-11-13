import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  deleteGraphDecorationFromStory,
  deleteInteractionFromStory,
  deleteTriggerInStory,
  findNewTriggerInputConflict,
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  getTriggerTimerSeconds,
  getStoryItemEntries,
  isStoryDate,
  isStoryTime,
  normalizeTriggerInputIds,
  storyHistoryOperations,
  updateGraphDecorationInStory,
  updateStoryGraphPositions,
  updateTriggerInStory,
  type GraphDecorationMutationResult,
  type GraphDecorationDeletionResult,
  type InteractionDeletionResult,
  type InteractionMutationResult,
  type Story,
  type TriggerCondition,
  type TriggerConditionGroup,
  type TriggerMutationResult,
  type TriggerDeletionResult,
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
import { apiErrorResponse } from '../../operations/api-error-response';
import { buildGraphDecoration } from './graph-decorations';
import { buildInteractionWithDefaultTrigger } from './interaction-factory';
import { storyMutationMetadata } from './story-mutation-results';
import { StoryMutationService } from './story-mutations';
import { buildStatCondition, validateStatEffects } from './story-stats';

type ConditionKind = 'interaction' | 'location' | 'character' | 'stat' | 'item' | 'temporal';
type ConditionReferences = {
  interactions: ReadonlySet<string>;
  locations: ReadonlySet<string>;
  characters: ReadonlySet<string>;
  itemDefinitions: ReadonlySet<string>;
};
type UpdateTriggerArgs = [
  storyId: string,
  interactionId: string,
  triggerId: string,
  input: UpdateTriggerDto,
  userId: string,
];

function conditionValue<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new BadRequestException('Condition is invalid');
  }
  return value;
}

function matchesInteractionCondition(condition: TriggerConditionDto): boolean {
  return condition.interactionId !== undefined && condition.hasBeenVisited !== undefined;
}

function matchesLocationCondition(condition: TriggerConditionDto): boolean {
  return condition.locationId !== undefined && condition.isCurrentLocation !== undefined;
}

function matchesCharacterCondition(condition: TriggerConditionDto): boolean {
  return condition.characterId !== undefined && condition.isPresent !== undefined;
}

function matchesStatCondition(condition: TriggerConditionDto): boolean {
  const statOperandCount = [
    condition.value !== undefined,
    condition.comparisonStatId !== undefined,
    condition.expression !== undefined,
  ].filter(Boolean).length;
  return (
    condition.statId !== undefined && condition.operator !== undefined && statOperandCount === 1
  );
}

function matchesItemCondition(condition: TriggerConditionDto): boolean {
  return condition.itemDefinitionId !== undefined && condition.isOwned !== undefined;
}

function conditionKind(condition: TriggerConditionDto): ConditionKind {
  const supportedKinds: Array<[ConditionKind, boolean]> = [
    ['interaction', matchesInteractionCondition(condition)],
    ['location', matchesLocationCondition(condition)],
    ['character', matchesCharacterCondition(condition)],
    ['stat', matchesStatCondition(condition)],
    ['item', matchesItemCondition(condition)],
    ['temporal', condition.temporal !== undefined],
  ];
  const kinds = supportedKinds.filter(([, matches]) => matches).map(([kind]) => kind);
  if (kinds.length !== 1) {
    throw new BadRequestException('A condition must contain exactly one supported condition type');
  }
  const kind = kinds[0];
  if (kind === undefined) {
    throw new BadRequestException('Condition is invalid');
  }
  return kind;
}

function assertItemEffectsBelongToStory(
  story: Story,
  itemEffects: NonNullable<UpdateInteractionDto['itemEffects']>,
): void {
  const itemIds = new Set(getStoryItemEntries(story).map(({ item }) => item.id));
  const itemDefinitionIds = new Set((story.itemDefinitions ?? []).map(({ id }) => id));
  const characterIds = new Set((story.characters ?? []).map(({ id }) => id));
  const hasForeignTarget = itemEffects.some(
    ({ itemId, itemDefinitionId, characterId }) =>
      Number(itemId !== undefined) + Number(itemDefinitionId !== undefined) !== 1 ||
      (itemId !== undefined && !itemIds.has(itemId)) ||
      (itemDefinitionId !== undefined && !itemDefinitionIds.has(itemDefinitionId)) ||
      (characterId !== undefined && !characterIds.has(characterId)),
  );
  if (hasForeignTarget) {
    throw new BadRequestException('Item effects must belong to the same story');
  }
}

function assertUniqueItemEffectTargets(
  itemEffects: NonNullable<UpdateInteractionDto['itemEffects']>,
): void {
  const effectTargets = itemEffects.map(
    ({ itemId, itemDefinitionId, characterId }) =>
      `${characterId ?? ''}:${itemId ?? `definition:${itemDefinitionId}`}`,
  );
  if (new Set(effectTargets).size !== itemEffects.length) {
    throw new BadRequestException('An interaction can only affect an item once');
  }
}

function validateGraphPositionUpdates(story: Story, input: UpdateStoryGraphPositionsDto): void {
  const interactionIds = new Set(story.interactions.map(({ id }) => id));
  const updatedInteractionIds = input.interactionUpdates.map(({ interactionId }) => interactionId);
  if (
    new Set(updatedInteractionIds).size !== updatedInteractionIds.length ||
    updatedInteractionIds.some((id) => !interactionIds.has(id))
  ) {
    throw new BadRequestException(
      'Graph interaction position targets must be unique and belong to the Story',
    );
  }
  assertUniqueTriggerPositionTargets(input.triggerUpdates);
  assertTriggerPositionsBelongToInteractions(story, input.triggerUpdates);
}

function assertUniqueTriggerPositionTargets(
  updates: UpdateStoryGraphPositionsDto['triggerUpdates'],
): void {
  const updatedTriggerKeys = updates.flatMap(({ interactionId, triggerIds }) =>
    triggerIds.map((triggerId) => `${interactionId}:${triggerId}`),
  );
  if (new Set(updatedTriggerKeys).size !== updatedTriggerKeys.length) {
    throw new BadRequestException('Graph Trigger position targets must be unique');
  }
}

function assertTriggerPositionsBelongToInteractions(
  story: Story,
  updates: UpdateStoryGraphPositionsDto['triggerUpdates'],
): void {
  for (const { interactionId, triggerIds } of updates) {
    const interaction = story.interactions.find(({ id }) => id === interactionId);
    const storyTriggerIds = new Set(interaction?.triggers.map(({ id }) => id) ?? []);
    if (!interaction || triggerIds.some((triggerId) => !storyTriggerIds.has(triggerId))) {
      throw new BadRequestException(
        'Graph Trigger position targets must belong to their Story interaction',
      );
    }
  }
}

@Injectable()
export class StoryGraphService {
  constructor(private readonly mutations: StoryMutationService) {}

  async createInteraction(
    storyId: string,
    input: CreateInteractionDto,
    userId: string,
  ): Promise<InteractionMutationResult> {
    const interactionId = randomUUID();
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        if (input.parentId && !story.interactions.some((item) => item.id === input.parentId)) {
          throw new NotFoundException('Parent interaction not found');
        }
        story.interactions.push(
          buildInteractionWithDefaultTrigger({
            id: interactionId,
            inputInteractionIds: input.parentId ? [input.parentId] : [],
            position: input.position ?? {
              x: 80 + story.interactions.length * 40,
              y: 100 + story.interactions.length * 30,
            },
          }),
        );
        return story;
      },
      userId,
      storyHistoryOperations.interactionCreated,
    );
    return this.interactionResult(updatedStory, interactionId);
  }

  async updateInteraction(
    storyId: string,
    interactionId: string,
    input: UpdateInteractionDto,
    userId: string,
  ): Promise<InteractionMutationResult> {
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => this.applyInteractionUpdate(story, interactionId, input),
      userId,
      storyHistoryOperations.interactionUpdated,
    );
    return this.interactionResult(updatedStory, interactionId);
  }

  async updatePositions(storyId: string, input: UpdateStoryGraphPositionsDto, userId: string) {
    if (input.interactionUpdates.length === 0 && input.triggerUpdates.length === 0) {
      throw new BadRequestException('At least one graph position update is required');
    }
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        validateGraphPositionUpdates(story, input);
        return updateStoryGraphPositions(story, input);
      },
      userId,
      storyHistoryOperations.graphPositionsUpdated,
    );
    return storyMutationMetadata(updatedStory);
  }

  async deleteInteraction(
    storyId: string,
    interactionId: string,
    userId: string,
  ): Promise<InteractionDeletionResult> {
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        this.interaction(story, interactionId);
        return deleteInteractionFromStory(story, interactionId);
      },
      userId,
      storyHistoryOperations.interactionDeleted,
    );
    return { ...storyMutationMetadata(updatedStory), interactionId };
  }

  async createGraphDecoration(
    storyId: string,
    input: CreateGraphDecorationDto,
    userId: string,
  ): Promise<GraphDecorationMutationResult> {
    const decorationId = randomUUID();
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        (story.graphDecorations ??= []).push(buildGraphDecoration(decorationId, input));
        return story;
      },
      userId,
      storyHistoryOperations.graphDecorationCreated,
    );
    return this.graphDecorationResult(updatedStory, decorationId);
  }

  async updateGraphDecoration(
    storyId: string,
    decorationId: string,
    input: UpdateGraphDecorationDto,
    userId: string,
  ): Promise<GraphDecorationMutationResult> {
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        this.graphDecoration(story, decorationId);
        return updateGraphDecorationInStory(story, decorationId, input);
      },
      userId,
      storyHistoryOperations.graphDecorationUpdated,
    );
    return this.graphDecorationResult(updatedStory, decorationId);
  }

  async deleteGraphDecoration(
    storyId: string,
    decorationId: string,
    userId: string,
  ): Promise<GraphDecorationDeletionResult> {
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        this.graphDecoration(story, decorationId);
        return deleteGraphDecorationFromStory(story, decorationId);
      },
      userId,
      storyHistoryOperations.graphDecorationDeleted,
    );
    return { ...storyMutationMetadata(updatedStory), decorationId };
  }

  async updateTrigger(...args: UpdateTriggerArgs): Promise<TriggerMutationResult> {
    const [storyId, interactionId, triggerId, input, userId] = args;
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        const interaction = this.interaction(story, interactionId);
        const trigger = interaction.triggers.find((item) => item.id === triggerId);
        if (!trigger) {
          throw new NotFoundException('Trigger not found');
        }
        const conditionGroups = this.triggerConditionGroups(story, input, trigger);
        const inputInteractionIds =
          input.inputInteractionIds === undefined
            ? trigger.inputInteractionIds
            : normalizeTriggerInputIds(input.inputInteractionIds);
        this.assertInteractionReferences(story, inputInteractionIds);
        if (input.inputInteractionIds !== undefined) {
          this.assertNoTriggerConnectionConflicts(story, interactionId, inputInteractionIds, {
            triggerId,
            existingInputInteractionIds: trigger.inputInteractionIds,
          });
        }
        return updateTriggerInStory(story, interactionId, triggerId, {
          inputInteractionIds,
          conditionGroups,
          appearanceProbability:
            input.appearanceProbability ?? getTriggerAppearanceProbability(trigger),
          timerSeconds:
            input.timerSeconds === undefined ? getTriggerTimerSeconds(trigger) : input.timerSeconds,
          ...(input.position === undefined ? {} : { position: input.position }),
        });
      },
      userId,
      storyHistoryOperations.triggerUpdated,
    );
    return this.triggerResult(updatedStory, interactionId, triggerId);
  }

  async addTrigger(
    storyId: string,
    interactionId: string,
    input: CreateTriggerDto,
    userId: string,
  ): Promise<TriggerMutationResult> {
    const triggerId = randomUUID();
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        const conditionGroups = this.triggerConditionGroups(story, input);
        const inputInteractionIds = normalizeTriggerInputIds(input.inputInteractionIds ?? []);
        this.assertInteractionReferences(story, inputInteractionIds);
        this.assertNoTriggerConnectionConflicts(story, interactionId, inputInteractionIds);
        this.interaction(story, interactionId).triggers.push({
          id: triggerId,
          inputInteractionIds,
          conditionGroups,
          appearanceProbability: input.appearanceProbability ?? 100,
          timerSeconds: input.timerSeconds ?? null,
          ...(input.position === undefined ? {} : { position: input.position }),
        });
        return story;
      },
      userId,
      storyHistoryOperations.triggerCreated,
    );
    return this.triggerResult(updatedStory, interactionId, triggerId);
  }

  async deleteTrigger(
    storyId: string,
    interactionId: string,
    triggerId: string,
    userId: string,
  ): Promise<TriggerDeletionResult> {
    let triggerRemoved = false;
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        const interaction = this.interaction(story, interactionId);
        if (!interaction.triggers.some((item) => item.id === triggerId)) {
          throw new NotFoundException('Trigger not found');
        }
        triggerRemoved = interaction.triggers.length > 1;
        return deleteTriggerInStory(story, interactionId, triggerId);
      },
      userId,
      storyHistoryOperations.triggerDeleted,
    );
    return { ...storyMutationMetadata(updatedStory), interactionId, triggerId, triggerRemoved };
  }

  private applyInteractionUpdate(
    story: Story,
    interactionId: string,
    input: UpdateInteractionDto,
  ): Story {
    const interaction = this.interaction(story, interactionId);
    this.updateInteractionContent(story, interaction, input);
    this.updateInteractionRelationships(story, interaction, input);
    this.updateInteractionEffects(story, interaction, input);
    if (input.durationMinutes !== undefined) {
      interaction.durationMinutes = input.durationMinutes;
    }
    return story;
  }

  private updateInteractionContent(
    story: Story,
    interaction: Story['interactions'][number],
    input: UpdateInteractionDto,
  ): void {
    if (input.title !== undefined) {
      interaction.title = input.title;
    }
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
    if (input.body !== undefined) {
      interaction.body = sanitizeRichText(input.body ?? '', story);
    }
    if (input.position !== undefined) {
      interaction.position = input.position;
    }
  }

  private updateInteractionRelationships(
    story: Story,
    interaction: Story['interactions'][number],
    input: UpdateInteractionDto,
  ): void {
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
  }

  private updateInteractionEffects(
    story: Story,
    interaction: Story['interactions'][number],
    input: UpdateInteractionDto,
  ): void {
    if (input.statEffects !== undefined) {
      interaction.statEffects = validateStatEffects(story, input.statEffects);
    }
    if (input.itemEffects !== undefined) {
      assertItemEffectsBelongToStory(story, input.itemEffects);
      assertUniqueItemEffectTargets(input.itemEffects);
      interaction.itemEffects = input.itemEffects;
    }
  }

  private interaction(story: Story, id: string) {
    const interaction = story.interactions.find((item) => item.id === id);
    if (!interaction) {
      throw new NotFoundException('Interaction not found');
    }
    return interaction;
  }

  private graphDecoration(story: Story, id: string) {
    const decoration = (story.graphDecorations ?? []).find((item) => item.id === id);
    if (!decoration) {
      throw new NotFoundException('Graph decoration not found');
    }
    return decoration;
  }

  private assertInteractionReferences(story: Story, inputInteractionIds: string[]) {
    const interactionIds = new Set(story.interactions.map(({ id }) => id));
    if (inputInteractionIds.some((id) => !interactionIds.has(id))) {
      throw new BadRequestException('Trigger references must belong to the same story');
    }
  }

  private assertNoTriggerConnectionConflicts(
    story: Story,
    interactionId: string,
    inputInteractionIds: string[],
    options: { triggerId?: string; existingInputInteractionIds?: string[] } = {},
  ) {
    const conflict = findNewTriggerInputConflict(
      story,
      interactionId,
      inputInteractionIds,
      options,
    );
    if (conflict) {
      throw new ConflictException(
        apiErrorResponse(
          'TRIGGER_CONNECTION_EXISTS',
          'Another Trigger already connects these Interactions.',
          conflict,
        ),
      );
    }
  }

  private triggerConditionGroups(
    story: Story,
    input: CreateTriggerDto | UpdateTriggerDto,
    current?: Story['interactions'][number]['triggers'][number],
  ): TriggerConditionGroup[] {
    if (input.conditionGroups !== undefined && input.conditions !== undefined) {
      throw new BadRequestException('Use conditionGroups instead of legacy conditions');
    }
    const groups = this.buildTriggerConditionGroups(story, input, current);
    if (new Set(groups.map(({ id }) => id)).size !== groups.length) {
      throw new BadRequestException('Trigger condition group IDs must be unique');
    }
    if (groups.reduce((count, group) => count + group.conditions.length, 0) > 500) {
      throw new BadRequestException('A Trigger can contain at most 500 conditions');
    }
    return groups;
  }

  private buildTriggerConditionGroups(
    story: Story,
    input: CreateTriggerDto | UpdateTriggerDto,
    current?: Story['interactions'][number]['triggers'][number],
  ): TriggerConditionGroup[] {
    if (input.conditionGroups !== undefined) {
      return input.conditionGroups.map((group) => ({
        id: group.id,
        conditions: this.conditions(story, group.conditions),
      }));
    }
    if (input.conditions !== undefined) {
      return [
        {
          id: current ? getTriggerConditionGroups(current)[0].id : randomUUID(),
          conditions: this.conditions(story, input.conditions),
        },
      ];
    }
    return current ? getTriggerConditionGroups(current) : [{ id: randomUUID(), conditions: [] }];
  }

  private conditions(story: Story, conditions: TriggerConditionDto[]): TriggerCondition[] {
    const references: ConditionReferences = {
      interactions: new Set(story.interactions.map(({ id }) => id)),
      locations: new Set((story.locations ?? []).map(({ id }) => id)),
      characters: new Set((story.characters ?? []).map(({ id }) => id)),
      itemDefinitions: new Set((story.itemDefinitions ?? []).map(({ id }) => id)),
    };
    return conditions.map((condition) => this.condition(story, condition, references));
  }

  private condition(
    story: Story,
    condition: TriggerConditionDto,
    references: ConditionReferences,
  ): TriggerCondition {
    switch (conditionKind(condition)) {
      case 'interaction':
        return this.interactionCondition(references, condition);
      case 'location':
        return this.locationCondition(references, condition);
      case 'character':
        return this.characterCondition(references, condition);
      case 'stat':
        return this.statCondition(story, condition);
      case 'item':
        return this.itemCondition(references, condition);
      case 'temporal':
        return this.temporalCondition(condition);
      default:
        throw new BadRequestException('Condition is invalid');
    }
  }

  private interactionCondition(
    references: ConditionReferences,
    condition: TriggerConditionDto,
  ): TriggerCondition {
    const interactionId = conditionValue(condition.interactionId);
    const hasBeenVisited = conditionValue(condition.hasBeenVisited);
    this.assertConditionReference(references.interactions, interactionId);
    return { interactionId, hasBeenVisited };
  }

  private locationCondition(
    references: ConditionReferences,
    condition: TriggerConditionDto,
  ): TriggerCondition {
    const locationId = conditionValue(condition.locationId);
    const isCurrentLocation = conditionValue(condition.isCurrentLocation);
    this.assertConditionReference(references.locations, locationId);
    return { locationId, isCurrentLocation };
  }

  private characterCondition(
    references: ConditionReferences,
    condition: TriggerConditionDto,
  ): TriggerCondition {
    const characterId = conditionValue(condition.characterId);
    const isPresent = conditionValue(condition.isPresent);
    this.assertConditionReference(references.characters, characterId);
    return { characterId, isPresent };
  }

  private itemCondition(
    references: ConditionReferences,
    condition: TriggerConditionDto,
  ): TriggerCondition {
    const itemDefinitionId = conditionValue(condition.itemDefinitionId);
    const isOwned = conditionValue(condition.isOwned);
    this.assertConditionReference(references.itemDefinitions, itemDefinitionId);
    return { itemDefinitionId, isOwned };
  }

  private statCondition(story: Story, condition: TriggerConditionDto): TriggerCondition {
    const target = {
      statId: conditionValue(condition.statId),
      ...(condition.itemId ? { itemId: condition.itemId } : {}),
      operator: conditionValue(condition.operator),
    };
    if (condition.comparisonStatId !== undefined) {
      return buildStatCondition(story, {
        ...target,
        comparisonStatId: condition.comparisonStatId,
        ...(condition.comparisonItemId ? { comparisonItemId: condition.comparisonItemId } : {}),
      });
    }
    if (condition.expression !== undefined) {
      return buildStatCondition(story, { ...target, expression: condition.expression });
    }
    return buildStatCondition(story, { ...target, value: conditionValue(condition.value) });
  }

  private temporalCondition(condition: TriggerConditionDto): TriggerCondition {
    const temporal = conditionValue(condition.temporal);
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

  private assertConditionReference(validIds: ReadonlySet<string>, referenceId: string): void {
    if (!validIds.has(referenceId)) {
      throw new BadRequestException('Condition references must belong to the same story');
    }
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
    if (!trigger) {
      throw new NotFoundException('Trigger not found');
    }
    return {
      interactionId,
      trigger: structuredClone(trigger),
      ...storyMutationMetadata(story),
    };
  }
}
