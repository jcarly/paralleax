import type { Story, StoryChangeDiagnostic, ResolvedStoryChangeOperation } from '@paralleax/shared';
import {
  CreateStatDefinitionDto,
  UpdateStatAssignmentDto,
  UpdateStatDefinitionDto,
} from '../dto/stories.dto';
import { toContextEntityInput } from '../validation/story-change-operations';
import {
  createStatAssignment,
  createStatDefinition,
  updateStatAssignment,
  updateStatDefinition,
} from './story-stats';

/*
 * Stat definitions and assignments in change batches (ADR-050 amendment). The
 * authoring rules are those of the single-entity endpoints: this module only
 * validates fields with the same DTOs and calls the same `story-stats`
 * functions on the disposable Story copy. It adds no rule of its own.
 */

export type PlannedStatStep =
  | {
      type: 'create_stat_definition';
      index: number;
      statDefinitionId: string;
      definition: CreateStatDefinitionDto;
    }
  | {
      type: 'update_stat_definition';
      index: number;
      statDefinitionId: string;
      definition: UpdateStatDefinitionDto;
    }
  | {
      type: 'create_stat_assignment';
      index: number;
      assignmentId: string;
      statDefinitionId: string;
      ownerType: 'story' | 'character' | 'location' | 'itemDefinition';
      ownerId?: string;
      initialValue: unknown;
    }
  | {
      type: 'update_stat_assignment';
      index: number;
      assignmentId: string;
      initialValue: unknown;
    };

type StatOperation = Extract<
  ResolvedStoryChangeOperation,
  {
    type:
      | 'create_stat_definition'
      | 'update_stat_definition'
      | 'create_stat_assignment'
      | 'update_stat_assignment';
  }
>;

export type PlannedStatResult = { step?: PlannedStatStep; diagnostics: StoryChangeDiagnostic[] };

export function isStatOperation(
  operation: ResolvedStoryChangeOperation,
): operation is StatOperation {
  return operation.type.includes('_stat_');
}

export function isStatStep(step: { type: string }): step is PlannedStatStep {
  return step.type.includes('_stat_');
}

export function planStatOperation(operation: StatOperation): PlannedStatResult {
  switch (operation.type) {
    case 'create_stat_definition':
      return planCreateDefinition(operation);
    case 'update_stat_definition':
      return planUpdateDefinition(operation);
    case 'create_stat_assignment':
      return planCreateAssignment(operation);
    case 'update_stat_assignment':
      return planUpdateAssignment(operation);
  }
}

type StatOperationOf<T extends StatOperation['type']> = Extract<StatOperation, { type: T }>;

function planCreateDefinition(operation: StatOperationOf<'create_stat_definition'>) {
  const { type, index, statDefinitionId } = operation;
  const input = toContextEntityInput(CreateStatDefinitionDto, operation.fields, index, 'fields');
  return planned(input.diagnostics, () => ({
    type,
    index,
    statDefinitionId,
    definition: present(input.input),
  }));
}

function planUpdateDefinition(operation: StatOperationOf<'update_stat_definition'>) {
  const { type, index, statDefinitionId } = operation;
  const input = toContextEntityInput(UpdateStatDefinitionDto, operation.fields, index, 'fields');
  return planned(input.diagnostics, () => ({
    type,
    index,
    statDefinitionId,
    definition: present(input.input),
  }));
}

function planCreateAssignment(operation: StatOperationOf<'create_stat_assignment'>) {
  const { type, index, assignmentId, statDefinitionId, ownerType, ownerId } = operation;
  const input = toContextEntityInput(UpdateStatAssignmentDto, operation.fields, index, 'fields');
  return planned(input.diagnostics, () => ({
    type,
    index,
    assignmentId,
    statDefinitionId,
    ownerType,
    ...(ownerId === undefined ? {} : { ownerId }),
    initialValue: present(input.input).initialValue,
  }));
}

function planUpdateAssignment(operation: StatOperationOf<'update_stat_assignment'>) {
  const { type, index, assignmentId } = operation;
  const input = toContextEntityInput(UpdateStatAssignmentDto, operation.fields, index, 'fields');
  return planned(input.diagnostics, () => ({
    type,
    index,
    assignmentId,
    initialValue: present(input.input).initialValue,
  }));
}

function planned(
  diagnostics: StoryChangeDiagnostic[],
  build: () => PlannedStatStep,
): PlannedStatResult {
  return diagnostics.length > 0 ? { diagnostics } : { step: build(), diagnostics };
}

function present<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('A validated change input is missing');
  }
  return value;
}

/** Applies one step with the single-entity rules; the Story is a disposable copy. */
export function applyStatStep(story: Story, step: PlannedStatStep): Story {
  switch (step.type) {
    case 'create_stat_definition':
      createStatDefinition(story, step.statDefinitionId, {
        name: step.definition.name,
        // The batch contract requires it: no implicit type is assumed here.
        valueType: present(step.definition.valueType),
        category: step.definition.category,
        imageUrl: step.definition.imageUrl,
        changePerHour: step.definition.changePerHour,
      });
      return story;
    case 'update_stat_definition':
      updateStatDefinition(story, step.statDefinitionId, step.definition);
      return story;
    case 'create_stat_assignment':
      createStatAssignment(story, step.assignmentId, {
        statDefinitionId: step.statDefinitionId,
        ownerType: step.ownerType,
        ownerId: step.ownerId,
        initialValue: step.initialValue,
      });
      return story;
    case 'update_stat_assignment':
      updateStatAssignment(story, step.assignmentId, step.initialValue);
      return story;
  }
}
