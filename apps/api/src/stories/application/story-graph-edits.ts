import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  findNewTriggerInputConflict,
  getStoryItemEntries,
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  getTriggerTimerSeconds,
  normalizeTriggerInputIds,
  updateTriggerInStory,
  type Position,
  type Story,
  type TriggerConditionGroup,
} from '@paralleax/shared';
import type { CreateTriggerDto, UpdateInteractionDto, UpdateTriggerDto } from '../dto/stories.dto';
import { sanitizeRichText } from '../rich-text';
import { apiErrorResponse } from '../../operations/api-error-response';
import { buildInteractionWithDefaultTrigger } from './interaction-factory';
import { buildConditions } from './story-graph-conditions';
import { validateStatEffects } from './story-stats';

/*
 * Authoring rules for creating and editing Interactions and Triggers, shared by
 * the single-entity endpoints (StoryGraphService) and grouped Story changes
 * (StoryChangesService, ADR-050). Each function mutates the Story it receives,
 * or throws without a partial guarantee: callers work on a disposable copy.
 */

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

export function applyInteractionUpdate(
  story: Story,
  interactionId: string,
  input: UpdateInteractionDto,
): Story {
  const interaction = findInteraction(story, interactionId);
  updateInteractionContent(story, interaction, input);
  updateInteractionRelationships(story, interaction, input);
  updateInteractionEffects(story, interaction, input);
  if (input.durationMinutes !== undefined) {
    interaction.durationMinutes = input.durationMinutes;
  }
  return story;
}

function updateInteractionContent(
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
      conditions: buildConditions(story, block.conditions),
    }));
  }
  if (input.body !== undefined) {
    interaction.body = sanitizeRichText(input.body ?? '', story);
  }
  if (input.position !== undefined) {
    interaction.position = input.position;
  }
}

function updateInteractionRelationships(
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
    if (input.locationId === null) {
      delete interaction.locationId;
    } else {
      interaction.locationId = input.locationId;
    }
  }
  if (input.characterIds !== undefined) {
    const characterIds = new Set((story.characters ?? []).map(({ id }) => id));
    if (input.characterIds.some((id) => !characterIds.has(id))) {
      throw new BadRequestException('Interaction characters must belong to the same story');
    }
    interaction.characterIds = [...new Set(input.characterIds)];
  }
}

function updateInteractionEffects(
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

export function findInteraction(story: Story, id: string) {
  const interaction = story.interactions.find((item) => item.id === id);
  if (!interaction) {
    throw new NotFoundException('Interaction not found');
  }
  return interaction;
}

export function assertInteractionReferences(story: Story, inputInteractionIds: string[]) {
  const interactionIds = new Set(story.interactions.map(({ id }) => id));
  if (inputInteractionIds.some((id) => !interactionIds.has(id))) {
    throw new BadRequestException('Trigger references must belong to the same story');
  }
}

export function assertNoTriggerConnectionConflicts(
  story: Story,
  interactionId: string,
  inputInteractionIds: string[],
  options: { triggerId?: string; existingInputInteractionIds?: string[] } = {},
) {
  const conflict = findNewTriggerInputConflict(story, interactionId, inputInteractionIds, options);
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

export function triggerConditionGroups(
  story: Story,
  input: CreateTriggerDto | UpdateTriggerDto,
  current?: Story['interactions'][number]['triggers'][number],
): TriggerConditionGroup[] {
  if (input.conditionGroups !== undefined && input.conditions !== undefined) {
    throw new BadRequestException('Use conditionGroups instead of legacy conditions');
  }
  const groups = buildTriggerConditionGroups(story, input, current);
  if (new Set(groups.map(({ id }) => id)).size !== groups.length) {
    throw new BadRequestException('Trigger condition group IDs must be unique');
  }
  if (groups.reduce((count, group) => count + group.conditions.length, 0) > 500) {
    throw new BadRequestException('A Trigger can contain at most 500 conditions');
  }
  return groups;
}

function buildTriggerConditionGroups(
  story: Story,
  input: CreateTriggerDto | UpdateTriggerDto,
  current?: Story['interactions'][number]['triggers'][number],
): TriggerConditionGroup[] {
  if (input.conditionGroups !== undefined) {
    return input.conditionGroups.map((group) => ({
      id: group.id,
      conditions: buildConditions(story, group.conditions),
    }));
  }
  if (input.conditions !== undefined) {
    return [
      {
        id: current ? getTriggerConditionGroups(current)[0].id : randomUUID(),
        conditions: buildConditions(story, input.conditions),
      },
    ];
  }
  return current ? getTriggerConditionGroups(current) : [{ id: randomUUID(), conditions: [] }];
}

export interface NewInteraction {
  interactionId: string;
  triggerId?: string;
  inputInteractionIds: string[];
  position: Position;
}

/** Adds an Interaction with its default Trigger from the given input Interactions. */
export function addInteraction(story: Story, input: NewInteraction): Story {
  const inputInteractionIds = normalizeTriggerInputIds(input.inputInteractionIds);
  assertInteractionReferences(story, inputInteractionIds);
  if (story.interactions.some(({ id }) => id === input.interactionId)) {
    throw new ConflictException('Interaction ID already exists');
  }
  const interaction = buildInteractionWithDefaultTrigger({
    id: input.interactionId,
    inputInteractionIds,
    position: input.position,
  });
  if (input.triggerId !== undefined) {
    interaction.triggers[0].id = input.triggerId;
  }
  story.interactions.push(interaction);
  return story;
}

/** The editor's fallback placement for an Interaction created without a position. */
export function defaultInteractionPosition(story: Story): Position {
  return { x: 80 + story.interactions.length * 40, y: 100 + story.interactions.length * 30 };
}

export function addTrigger(
  story: Story,
  interactionId: string,
  triggerId: string,
  input: CreateTriggerDto,
): Story {
  const conditionGroups = triggerConditionGroups(story, input);
  const inputInteractionIds = normalizeTriggerInputIds(input.inputInteractionIds ?? []);
  assertInteractionReferences(story, inputInteractionIds);
  assertNoTriggerConnectionConflicts(story, interactionId, inputInteractionIds);
  findInteraction(story, interactionId).triggers.push({
    id: triggerId,
    inputInteractionIds,
    conditionGroups,
    appearanceProbability: input.appearanceProbability ?? 100,
    timerSeconds: input.timerSeconds ?? null,
    ...(input.position === undefined ? {} : { position: input.position }),
  });
  return story;
}

export function applyTriggerUpdate(
  story: Story,
  interactionId: string,
  triggerId: string,
  input: UpdateTriggerDto,
): Story {
  const interaction = findInteraction(story, interactionId);
  const trigger = interaction.triggers.find((item) => item.id === triggerId);
  if (!trigger) {
    throw new NotFoundException('Trigger not found');
  }
  const conditionGroups = triggerConditionGroups(story, input, trigger);
  const inputInteractionIds =
    input.inputInteractionIds === undefined
      ? trigger.inputInteractionIds
      : normalizeTriggerInputIds(input.inputInteractionIds);
  assertInteractionReferences(story, inputInteractionIds);
  if (input.inputInteractionIds !== undefined) {
    assertNoTriggerConnectionConflicts(story, interactionId, inputInteractionIds, {
      triggerId,
      existingInputInteractionIds: trigger.inputInteractionIds,
    });
  }
  return updateTriggerInStory(story, interactionId, triggerId, {
    inputInteractionIds,
    conditionGroups,
    appearanceProbability: input.appearanceProbability ?? getTriggerAppearanceProbability(trigger),
    timerSeconds:
      input.timerSeconds === undefined ? getTriggerTimerSeconds(trigger) : input.timerSeconds,
    ...(input.position === undefined ? {} : { position: input.position }),
  });
}

/** Reuses editor reference and effect rules after a native file's structural checks. */
export function validateNativeInteractionRelations(
  story: Story,
  interaction: Story['interactions'][number],
): string | undefined {
  if (new Set(interaction.characterIds ?? []).size !== (interaction.characterIds ?? []).length) {
    return 'Interaction characters must be unique';
  }
  const copy = { ...interaction };
  updateInteractionRelationships(story, copy, interaction);
  updateInteractionEffects(story, copy, interaction);
  for (const block of interaction.conditionalTextBlocks ?? []) {
    buildConditions(story, block.conditions);
  }
  for (const trigger of interaction.triggers) {
    if (new Set(trigger.inputInteractionIds).size !== trigger.inputInteractionIds.length) {
      return 'Trigger inputs must be unique';
    }
    assertInteractionReferences(story, trigger.inputInteractionIds);
    triggerConditionGroups(story, trigger, trigger);
  }
  return undefined;
}
