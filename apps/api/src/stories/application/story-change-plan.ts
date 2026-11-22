import { HttpException } from '@nestjs/common';
import {
  DomainValidationError,
  STORY_CHANGE_BATCH_LIMITS,
  getNextChildPosition,
  getNextRootPosition,
  resolveStoryChangeOperations,
  type Position,
  type ResolvedStoryChangeOperation,
  type Story,
  type StoryChangeCreatedEntity,
  type StoryChangeDiagnostic,
  type StoryChangeOperation,
} from '@paralleax/shared';
import { CreateTriggerDto, UpdateTriggerDto, type UpdateInteractionDto } from '../dto/stories.dto';
import {
  toInteractionInput,
  toTriggerInput,
  validateStoryChangeOperationShape,
} from '../validation/story-change-operations';
import {
  addInteraction,
  addTrigger,
  applyInteractionUpdate,
  applyTriggerUpdate,
} from './story-graph-edits';

/*
 * A change batch (ADR-050) in two pure steps. Planning checks shapes, resolves
 * temporary references and validates entity fields with the single-edit DTOs;
 * it does not read the Story. Applying runs each step with the same authoring
 * rules as the single-entity endpoints on a disposable Story copy.
 */

type PlannedStep =
  | {
      type: 'create_interaction';
      index: number;
      interactionId: string;
      triggerId: string;
      inputInteractionIds: string[];
      position?: Position;
      interaction?: UpdateInteractionDto;
      trigger?: UpdateTriggerDto;
    }
  | {
      type: 'update_interaction';
      index: number;
      interactionId: string;
      interaction: UpdateInteractionDto;
    }
  | {
      type: 'create_trigger';
      index: number;
      interactionId: string;
      triggerId: string;
      trigger: CreateTriggerDto;
    }
  | {
      type: 'update_trigger';
      index: number;
      interactionId: string;
      triggerId: string;
      trigger: UpdateTriggerDto;
    };

export interface StoryChangePlan {
  steps: PlannedStep[];
  created: StoryChangeCreatedEntity[];
  diagnostics: StoryChangeDiagnostic[];
}

export function planStoryChanges(
  operations: readonly unknown[],
  generateId: () => string,
): StoryChangePlan {
  const shapeDiagnostics = operations.flatMap(validateStoryChangeOperationShape);
  const shaped = operations.filter(hasOperationShape);
  if (shapeDiagnostics.length > 0 || shaped.length !== operations.length) {
    return { steps: [], created: [], diagnostics: bounded(shapeDiagnostics) };
  }
  const resolution = resolveStoryChangeOperations(shaped, generateId);
  const planned = resolution.operations.map(planStep);
  const diagnostics = [
    ...resolution.diagnostics,
    ...planned.flatMap(({ diagnostics: stepDiagnostics }) => stepDiagnostics),
  ].sort((left, right) => (left.operationIndex ?? -1) - (right.operationIndex ?? -1));
  return {
    steps: diagnostics.length > 0 ? [] : planned.flatMap(({ step }) => (step ? [step] : [])),
    created: resolution.created,
    diagnostics: bounded(diagnostics),
  };
}

/** The operation envelope is valid; its entity fields are validated by the DTOs. */
function hasOperationShape(operation: unknown, index: number): operation is StoryChangeOperation {
  return validateStoryChangeOperationShape(operation, index).length === 0;
}

type PlannedResult = { step?: PlannedStep; diagnostics: StoryChangeDiagnostic[] };
type Resolved<T extends ResolvedStoryChangeOperation['type']> = Extract<
  ResolvedStoryChangeOperation,
  { type: T }
>;

function planStep(operation: ResolvedStoryChangeOperation): PlannedResult {
  switch (operation.type) {
    case 'create_interaction':
      return planCreateInteraction(operation);
    case 'update_interaction':
      return planUpdateInteraction(operation);
    case 'create_trigger':
      return planCreateTrigger(operation);
    case 'update_trigger':
      return planUpdateTrigger(operation);
  }
}

function planCreateInteraction(operation: Resolved<'create_interaction'>): PlannedResult {
  const { index } = operation;
  const interaction = optionalInteraction(operation.fields, index);
  const trigger = optionalTrigger(operation.defaultTrigger, index, 'defaultTrigger');
  return combine([interaction, trigger], () => ({
    type: operation.type,
    index,
    interactionId: operation.interactionId,
    triggerId: operation.triggerId,
    inputInteractionIds: operation.inputInteractionIds,
    ...(interaction.input?.position === undefined ? {} : { position: interaction.input.position }),
    ...(interaction.input === undefined ? {} : { interaction: interaction.input }),
    ...(trigger.input === undefined ? {} : { trigger: trigger.input }),
  }));
}

function planUpdateInteraction(operation: Resolved<'update_interaction'>): PlannedResult {
  const interaction = toInteractionInput(operation.fields, operation.index, 'fields');
  return combine([interaction], () => ({
    type: operation.type,
    index: operation.index,
    interactionId: operation.interactionId,
    interaction: required(interaction.input),
  }));
}

function planCreateTrigger(operation: Resolved<'create_trigger'>): PlannedResult {
  const trigger = toTriggerInput(
    CreateTriggerDto,
    { ...operation.fields, inputInteractionIds: operation.inputInteractionIds },
    operation.index,
    'fields',
  );
  return combine([trigger], () => ({
    type: operation.type,
    index: operation.index,
    interactionId: operation.interactionId,
    triggerId: operation.triggerId,
    trigger: required(trigger.input),
  }));
}

function planUpdateTrigger(operation: Resolved<'update_trigger'>): PlannedResult {
  const inputs =
    operation.inputInteractionIds === undefined
      ? {}
      : { inputInteractionIds: operation.inputInteractionIds };
  const trigger = toTriggerInput(
    UpdateTriggerDto,
    { ...operation.fields, ...inputs },
    operation.index,
    'fields',
  );
  return combine([trigger], () => ({
    type: operation.type,
    index: operation.index,
    interactionId: operation.interactionId,
    triggerId: operation.triggerId,
    trigger: required(trigger.input),
  }));
}

function optionalInteraction(fields: object, index: number) {
  return Object.keys(fields).length === 0
    ? { diagnostics: [] }
    : toInteractionInput(fields, index, 'fields');
}

function optionalTrigger(fields: object, index: number, path: string) {
  return Object.keys(fields).length === 0
    ? { diagnostics: [] }
    : toTriggerInput(UpdateTriggerDto, fields, index, path);
}

function combine(
  parts: { diagnostics: StoryChangeDiagnostic[] }[],
  build: () => PlannedStep,
): { step?: PlannedStep; diagnostics: StoryChangeDiagnostic[] } {
  const diagnostics = parts.flatMap((part) => part.diagnostics);
  return diagnostics.length > 0 ? { diagnostics } : { step: build(), diagnostics };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('A validated change input is missing');
  }
  return value;
}

function bounded(diagnostics: StoryChangeDiagnostic[]): StoryChangeDiagnostic[] {
  return diagnostics.slice(0, STORY_CHANGE_BATCH_LIMITS.diagnostics);
}

export interface StoryChangeApplication {
  story: Story;
  diagnostics: StoryChangeDiagnostic[];
}

/**
 * Applies the planned steps in order. The first step that breaks an authoring
 * rule stops the batch: its diagnostic is returned and the Story copy must be
 * discarded. Unexpected errors are rethrown.
 */
export function applyStoryChangePlan(story: Story, plan: StoryChangePlan): StoryChangeApplication {
  let current = story;
  for (const step of plan.steps) {
    try {
      current = applyStep(current, step);
    } catch (error) {
      return { story: current, diagnostics: [ruleDiagnostic(error, step.index)] };
    }
  }
  return { story: current, diagnostics: createdEntityWarnings(current, plan) };
}

function applyStep(story: Story, step: PlannedStep): Story {
  switch (step.type) {
    case 'create_interaction': {
      let next = addInteraction(story, {
        interactionId: step.interactionId,
        triggerId: step.triggerId,
        inputInteractionIds: step.inputInteractionIds,
        position: step.position ?? placement(story, step.inputInteractionIds),
      });
      if (step.interaction) {
        next = applyInteractionUpdate(next, step.interactionId, step.interaction);
      }
      return step.trigger
        ? applyTriggerUpdate(next, step.interactionId, step.triggerId, step.trigger)
        : next;
    }
    case 'update_interaction':
      return applyInteractionUpdate(story, step.interactionId, step.interaction);
    case 'create_trigger':
      return addTrigger(story, step.interactionId, step.triggerId, step.trigger);
    case 'update_trigger':
      return applyTriggerUpdate(story, step.interactionId, step.triggerId, step.trigger);
  }
}

/** The editor's placement rule: below the first source, or in the root column. */
function placement(story: Story, inputInteractionIds: readonly string[]): Position {
  const parent = story.interactions.find(({ id }) => id === inputInteractionIds[0]);
  return parent ? getNextChildPosition(story, parent) : getNextRootPosition(story);
}

const statusCodes: Record<number, string> = {
  400: 'INVALID_OPERATION',
  404: 'REFERENCE_NOT_FOUND',
  409: 'CONFLICT',
};

/** Turns an authoring rule violation of one step into a diagnostic. */
export function ruleDiagnostic(
  error: unknown,
  operationIndex: number | null,
): StoryChangeDiagnostic {
  if (error instanceof DomainValidationError) {
    return {
      severity: 'error',
      operationIndex,
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  if (error instanceof HttpException && error.getStatus() < 500) {
    return { severity: 'error', operationIndex, ...httpRuleViolation(error) };
  }
  throw error;
}

function httpRuleViolation(
  error: HttpException,
): Pick<StoryChangeDiagnostic, 'code' | 'message' | 'details'> {
  const response = error.getResponse();
  const body: { code?: unknown; message?: unknown; details?: unknown } =
    typeof response === 'object' ? response : { message: response };
  const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  return {
    code: typeof body.code === 'string' ? body.code : (statusCodes[error.getStatus()] ?? 'INVALID'),
    message: typeof message === 'string' ? message : error.message,
    ...(isRecord(body.details) ? { details: body.details } : {}),
  };
}

function createdEntityWarnings(story: Story, plan: StoryChangePlan): StoryChangeDiagnostic[] {
  return plan.steps.flatMap((step) => {
    if (step.type !== 'create_interaction') {
      return [];
    }
    const interaction = story.interactions.find(({ id }) => id === step.interactionId);
    const warnings: StoryChangeDiagnostic[] = [];
    if (interaction?.title.trim() === '') {
      warnings.push({
        severity: 'warning',
        operationIndex: step.index,
        code: 'EMPTY_TITLE',
        message: 'The created interaction has no title.',
      });
    }
    if (step.inputInteractionIds.length === 0) {
      warnings.push({
        severity: 'warning',
        operationIndex: step.index,
        code: 'NO_INPUT_INTERACTION',
        message:
          'The created interaction has no input interaction: it is offered at the start or through its conditions only.',
      });
    }
    return warnings;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
