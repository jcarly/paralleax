import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import {
  STORY_CHANGE_OPERATION_TYPES,
  type ResolvedStoryChangeInteractionFields,
  type ResolvedStoryChangeTriggerFields,
  type StoryChangeDiagnostic,
  type StoryChangeOperation,
} from '@paralleax/shared';
import {
  UpdateInteractionDto,
  type CreateCharacterDto,
  type CreateLocationDto,
  type CreateTriggerDto,
  type UpdateCharacterDto,
  type UpdateLocationDto,
  type UpdateTriggerDto,
} from '../dto/stories.dto';

/*
 * Shape checks for change batch operations (ADR-050). The envelope fields of an
 * operation are checked here; its entity fields are checked with the same DTOs
 * as the single-entity endpoints once temporary references are resolved, so the
 * size and type limits of both paths stay identical.
 */

const MAX_ID_LENGTH = 200;
const MAX_INPUT_INTERACTIONS = 500;

const operationKeys: Record<StoryChangeOperation['type'], readonly string[]> = {
  create_interaction: ['type', 'ref', 'inputInteractions', 'fields', 'defaultTrigger'],
  update_interaction: ['type', 'interaction', 'fields'],
  create_trigger: ['type', 'ref', 'interaction', 'inputInteractions', 'fields'],
  update_trigger: ['type', 'interaction', 'trigger', 'inputInteractions', 'fields'],
  create_character: ['type', 'ref', 'fields'],
  update_character: ['type', 'character', 'fields'],
  create_location: ['type', 'ref', 'fields'],
  update_location: ['type', 'location', 'fields'],
};

/** Operations whose `fields` object is required. */
const fieldsRequired: ReadonlySet<StoryChangeOperation['type']> = new Set([
  'update_interaction',
  'create_character',
  'update_character',
  'create_location',
  'update_location',
]);

const validatorOptions = { whitelist: true, forbidNonWhitelisted: true } as const;

type Diagnostics = StoryChangeDiagnostic[];
type ReportError = (code: string, message: string, path?: string) => void;
type OperationRecord = Record<string, unknown>;

/** Checks the operation envelope: type, known keys, reference and list shapes. */
export function validateStoryChangeOperationShape(operation: unknown, index: number): Diagnostics {
  const diagnostics: Diagnostics = [];
  const error: ReportError = (code, message, path) => {
    diagnostics.push({
      severity: 'error',
      operationIndex: index,
      code,
      message,
      ...(path === undefined ? {} : { path }),
    });
  };
  if (!isRecord(operation)) {
    error('INVALID_OPERATION', 'An operation must be an object.');
    return diagnostics;
  }
  const type = operation.type;
  if (!isOperationType(type)) {
    error(
      'UNSUPPORTED_OPERATION',
      `Operation type must be one of ${STORY_CHANGE_OPERATION_TYPES.join(', ')}.`,
      'type',
    );
    return diagnostics;
  }
  checkKnownKeys(operation, type, error);
  checkTargets(operation, type, error);
  checkReferenceList(operation.inputInteractions, error);
  checkOptionalString(operation.ref, 'ref', error);
  checkObject(operation.fields, 'fields', fieldsRequired.has(type), error);
  if (type === 'create_interaction') {
    checkDefaultTrigger(operation.defaultTrigger, error);
  }
  return diagnostics;
}

function checkKnownKeys(
  operation: OperationRecord,
  type: StoryChangeOperation['type'],
  error: ReportError,
): void {
  for (const key of Object.keys(operation)) {
    if (!operationKeys[type].includes(key)) {
      error('UNKNOWN_FIELD', `Field "${key}" is not allowed in ${type}.`, key);
    }
  }
}

/** `interaction` and `trigger`: which are required depends on the operation. */
function checkTargets(
  operation: OperationRecord,
  type: StoryChangeOperation['type'],
  error: ReportError,
): void {
  const interactionRequired =
    type === 'update_interaction' ||
    type === 'create_trigger' ||
    (type === 'update_trigger' && !isTemporaryReferenceValue(operation.trigger));
  checkReference(operation, 'interaction', interactionRequired, error);
  checkReference(operation, 'trigger', type === 'update_trigger', error);
  checkReference(operation, 'character', type === 'update_character', error);
  checkReference(operation, 'location', type === 'update_location', error);
}

function checkReference(
  operation: OperationRecord,
  key: string,
  required: boolean,
  error: ReportError,
): void {
  const value = operation[key];
  if (value === undefined) {
    if (required) {
      error('REQUIRED_FIELD', `Field "${key}" is required.`, key);
    }
    return;
  }
  if (!isReference(value)) {
    error('INVALID_REFERENCE', 'A reference is an existing ID string or { "ref": "name" }.', key);
  }
}

function checkDefaultTrigger(value: unknown, error: ReportError): void {
  checkObject(value, 'defaultTrigger', false, error);
  if (isRecord(value)) {
    checkOptionalString(value.ref, 'defaultTrigger.ref', error);
  }
}

/** Validates resolved Interaction fields with the single-edit DTO. */
export function toInteractionInput(
  fields: ResolvedStoryChangeInteractionFields,
  index: number,
  path: string,
): { input?: UpdateInteractionDto; diagnostics: Diagnostics } {
  return validateDto(UpdateInteractionDto, fields, index, path);
}

/** Validates resolved Trigger fields and inputs with the single-edit DTO. */
export function toTriggerInput<T extends CreateTriggerDto | UpdateTriggerDto>(
  dto: new () => T,
  fields: ResolvedStoryChangeTriggerFields & { inputInteractionIds?: string[] },
  index: number,
  path: string,
): { input?: T; diagnostics: Diagnostics } {
  return validateDto(dto, fields, index, path);
}

/** Validates Character or Location fields with the single-edit DTO. */
export function toContextEntityInput<
  T extends CreateCharacterDto | UpdateCharacterDto | CreateLocationDto | UpdateLocationDto,
>(
  dto: new () => T,
  fields: object,
  index: number,
  path: string,
): { input?: T; diagnostics: Diagnostics } {
  return validateDto(dto, fields, index, path);
}

function validateDto<T extends object>(
  dto: new () => T,
  value: object,
  index: number,
  path: string,
): { input?: T; diagnostics: Diagnostics } {
  const input = plainToInstance(dto, value);
  const errors = validateSync(input, validatorOptions);
  if (errors.length === 0) {
    return { input, diagnostics: [] };
  }
  return {
    diagnostics: flattenErrors(errors, path).map(({ property, message }) => ({
      severity: 'error',
      operationIndex: index,
      code: 'INVALID_FIELD',
      message,
      path: property,
    })),
  };
}

function flattenErrors(
  errors: ValidationError[],
  path: string,
): { property: string; message: string }[] {
  return errors.flatMap((error) => {
    const property = `${path}.${error.property}`;
    return [
      ...Object.values(error.constraints ?? {}).map((message) => ({ property, message })),
      ...flattenErrors(error.children ?? [], property),
    ];
  });
}

function checkReferenceList(value: unknown, error: ReportError): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.length > MAX_INPUT_INTERACTIONS) {
    error(
      'INVALID_FIELD',
      `"inputInteractions" must be a list of at most ${MAX_INPUT_INTERACTIONS} references.`,
      'inputInteractions',
    );
    return;
  }
  value.forEach((item, itemIndex) => {
    if (!isReference(item)) {
      error(
        'INVALID_REFERENCE',
        'A reference is an existing ID string or { "ref": "name" }.',
        `inputInteractions.${itemIndex}`,
      );
    }
  });
}

function checkOptionalString(value: unknown, path: string, error: ReportError): void {
  if (value !== undefined && typeof value !== 'string') {
    error('INVALID_REFERENCE', 'A reference name must be a string.', path);
  }
}

function checkObject(value: unknown, path: string, required: boolean, error: ReportError): void {
  if (value === undefined ? required : !isRecord(value)) {
    error('INVALID_FIELD', `"${path}" must be an object.`, path);
  }
}

function isReference(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.length > 0 && value.length <= MAX_ID_LENGTH;
  }
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    typeof value.ref === 'string' &&
    value.ref.length <= MAX_ID_LENGTH
  );
}

function isTemporaryReferenceValue(value: unknown): boolean {
  return isRecord(value) && typeof value.ref === 'string';
}

function isOperationType(value: unknown): value is StoryChangeOperation['type'] {
  return (STORY_CHANGE_OPERATION_TYPES as readonly unknown[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
