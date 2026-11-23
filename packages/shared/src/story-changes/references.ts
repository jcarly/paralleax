import {
  STORY_CHANGE_BATCH_LIMITS,
  STORY_CHANGE_CONDITION_REFERENCE_KINDS,
  STORY_CHANGE_REFERENCE_PATTERN,
  type StoryChangeCreatedEntity,
  type StoryChangeDiagnostic,
  type StoryChangeEntityKind,
  type StoryChangeInteractionFields,
  type StoryChangeOperation,
  type StoryChangeReference,
  type StoryChangeTriggerFields,
} from './contract.js';
import { isStatOperation, resolveStatEffects, resolveStatOperation } from './stat-references.js';
import type {
  ResolvedStoryChangeInteractionFields,
  ResolvedStoryChangeOperation,
  ResolvedStoryChangeTriggerFields,
} from './resolved.js';

export interface StoryChangeResolution {
  operations: ResolvedStoryChangeOperation[];
  created: StoryChangeCreatedEntity[];
  diagnostics: StoryChangeDiagnostic[];
}

interface DeclaredReference {
  kind: StoryChangeEntityKind;
  id: string;
  interactionId?: string;
}

/**
 * Replaces temporary references with entity IDs, in operation order.
 *
 * - A `ref` names the entity created by its operation. Names are unique in the
 *   batch, whatever the entity kind.
 * - `{ ref }` resolves only to a reference declared by an earlier operation:
 *   never to a later one, never to its own operation.
 * - A string is an existing Story ID; whether it exists is checked when the
 *   operation is applied, with the same rules as a single edit.
 * - IDs of created entities, and omitted condition group or conditional text
 *   block IDs, come from `generateId`, called in a fixed order.
 */
export function resolveStoryChangeOperations(
  operations: readonly StoryChangeOperation[],
  generateId: () => string,
): StoryChangeResolution {
  const resolver = new ReferenceResolver(generateId);
  const resolved = operations.flatMap((operation, index) => {
    const result = resolver.resolve(operation, index);
    return result ? [result] : [];
  });
  return { operations: resolved, created: resolver.created, diagnostics: resolver.diagnostics };
}

class ReferenceResolver {
  readonly created: StoryChangeCreatedEntity[] = [];
  readonly diagnostics: StoryChangeDiagnostic[] = [];
  private readonly references = new Map<string, DeclaredReference>();
  index = 0;
  private operationDiagnostics = 0;

  constructor(readonly generateId: () => string) {}

  resolve(
    operation: StoryChangeOperation,
    index: number,
  ): ResolvedStoryChangeOperation | undefined {
    this.index = index;
    this.operationDiagnostics = this.diagnostics.length;
    const resolved = this.resolveOperation(operation);
    return this.failed() ? undefined : resolved;
  }

  private failed(): boolean {
    return this.diagnostics.length > this.operationDiagnostics;
  }

  private resolveOperation(operation: StoryChangeOperation): ResolvedStoryChangeOperation {
    if (isStatOperation(operation)) {
      return resolveStatOperation(this, operation);
    }
    switch (operation.type) {
      case 'create_interaction':
        return this.createInteraction(operation);
      case 'update_interaction':
        return {
          type: operation.type,
          index: this.index,
          interactionId: this.reference(operation.interaction, 'interaction', 'interaction'),
          fields: this.interactionFields(operation.fields, 'fields'),
        };
      case 'create_trigger':
        return this.createTrigger(operation);
      case 'update_trigger':
        return this.updateTrigger(operation);
      case 'create_character': {
        const characterId = this.generateId();
        this.declare(operation.ref, 'ref', { kind: 'character', id: characterId });
        return { type: operation.type, index: this.index, characterId, fields: operation.fields };
      }
      case 'update_character':
        return {
          type: operation.type,
          index: this.index,
          characterId: this.reference(operation.character, 'character', 'character'),
          fields: operation.fields,
        };
      case 'create_location': {
        const locationId = this.generateId();
        this.declare(operation.ref, 'ref', { kind: 'location', id: locationId });
        return { type: operation.type, index: this.index, locationId, fields: operation.fields };
      }
      case 'update_location':
        return {
          type: operation.type,
          index: this.index,
          locationId: this.reference(operation.location, 'location', 'location'),
          fields: operation.fields,
        };
    }
  }

  private createInteraction(
    operation: Extract<StoryChangeOperation, { type: 'create_interaction' }>,
  ): ResolvedStoryChangeOperation {
    const inputInteractionIds = this.referenceList(
      operation.inputInteractions,
      'inputInteractions',
    );
    const fields = this.interactionFields(operation.fields ?? {}, 'fields');
    const { ref: triggerRef, ...triggerFields } = operation.defaultTrigger ?? {};
    const defaultTrigger = this.triggerFields(triggerFields, 'defaultTrigger');
    const interactionId = this.generateId();
    const triggerId = this.generateId();
    this.declare(operation.ref, 'ref', { kind: 'interaction', id: interactionId });
    this.declare(triggerRef, 'defaultTrigger.ref', {
      kind: 'trigger',
      id: triggerId,
      interactionId,
    });
    return {
      type: operation.type,
      index: this.index,
      interactionId,
      triggerId,
      inputInteractionIds,
      fields,
      defaultTrigger,
    };
  }

  private createTrigger(
    operation: Extract<StoryChangeOperation, { type: 'create_trigger' }>,
  ): ResolvedStoryChangeOperation {
    const interactionId = this.reference(operation.interaction, 'interaction', 'interaction');
    const inputInteractionIds = this.referenceList(
      operation.inputInteractions,
      'inputInteractions',
    );
    const fields = this.triggerFields(operation.fields ?? {}, 'fields');
    const triggerId = this.generateId();
    this.declare(operation.ref, 'ref', { kind: 'trigger', id: triggerId, interactionId });
    return {
      type: operation.type,
      index: this.index,
      interactionId,
      triggerId,
      inputInteractionIds,
      fields,
    };
  }

  private updateTrigger(
    operation: Extract<StoryChangeOperation, { type: 'update_trigger' }>,
  ): ResolvedStoryChangeOperation {
    const declared = isTemporaryReference(operation.trigger)
      ? this.references.get(operation.trigger.ref)
      : undefined;
    const triggerId = this.reference(operation.trigger, 'trigger', 'trigger');
    const interactionId =
      operation.interaction === undefined
        ? this.ownerOf(declared)
        : this.reference(operation.interaction, 'interaction', 'interaction');
    if (
      declared?.interactionId !== undefined &&
      operation.interaction !== undefined &&
      declared.interactionId !== interactionId
    ) {
      this.error(
        'TRIGGER_OWNER_MISMATCH',
        'The Trigger does not belong to this interaction.',
        'trigger',
      );
    }
    return {
      type: operation.type,
      index: this.index,
      interactionId,
      triggerId,
      ...(operation.inputInteractions === undefined
        ? {}
        : {
            inputInteractionIds: this.referenceList(
              operation.inputInteractions,
              'inputInteractions',
            ),
          }),
      fields: this.triggerFields(operation.fields ?? {}, 'fields'),
    };
  }

  private ownerOf(declared: DeclaredReference | undefined): string {
    if (declared?.interactionId === undefined) {
      this.error(
        'TRIGGER_OWNER_REQUIRED',
        'Give the owning interaction of an existing Trigger.',
        'interaction',
      );
      return '';
    }
    return declared.interactionId;
  }

  private interactionFields(
    fields: StoryChangeInteractionFields,
    path: string,
  ): ResolvedStoryChangeInteractionFields {
    const { conditionalTextBlocks, locationId, characterIds, statEffects, ...others } = fields;
    // Request values are untrusted: widen them and keep malformed ones as is.
    const rest = {
      ...others,
      ...this.relationships({ locationId, characterIds }, path),
      ...resolveStatEffects(this, statEffects, path),
    };
    const blocks: unknown = conditionalTextBlocks;
    if (!Array.isArray(blocks)) {
      return rest;
    }
    return {
      ...rest,
      conditionalTextBlocks: blocks.map((block: unknown, blockIndex) =>
        isRecord(block)
          ? {
              ...block,
              id: block.id ?? this.generateId(),
              conditions: this.conditions(
                block.conditions,
                `${path}.conditionalTextBlocks.${blockIndex}.conditions`,
              ),
            }
          : block,
      ),
    };
  }

  /** `locationId` and `characterIds`: existing IDs or references to earlier creations. */
  private relationships(
    fields: { locationId?: unknown; characterIds?: unknown },
    path: string,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    if (fields.locationId !== undefined) {
      resolved.locationId = this.entityField(fields.locationId, 'location', `${path}.locationId`);
    }
    const { characterIds } = fields;
    if (characterIds !== undefined) {
      resolved.characterIds = Array.isArray(characterIds)
        ? characterIds.map((id: unknown, index) =>
            this.entityField(id, 'character', `${path}.characterIds.${index}`),
          )
        : characterIds;
    }
    return resolved;
  }

  /** A reference is resolved; any other value is left to the field validation. */
  private entityField(value: unknown, kind: StoryChangeEntityKind, path: string): unknown {
    return isTemporaryReference(value) ? this.reference(value, kind, path) : value;
  }

  private triggerFields(
    fields: StoryChangeTriggerFields,
    path: string,
  ): ResolvedStoryChangeTriggerFields {
    const { conditionGroups, ...rest } = fields;
    const groups: unknown = conditionGroups;
    if (!Array.isArray(groups)) {
      return rest;
    }
    return {
      ...rest,
      conditionGroups: groups.map((group: unknown, groupIndex) =>
        isRecord(group)
          ? {
              ...group,
              id: group.id ?? this.generateId(),
              conditions: this.conditions(
                group.conditions,
                `${path}.conditionGroups.${groupIndex}.conditions`,
              ),
            }
          : group,
      ),
    };
  }

  private conditions(conditions: unknown, path: string): unknown {
    if (!Array.isArray(conditions)) {
      return conditions;
    }
    return conditions.map((condition: unknown, conditionIndex) => {
      if (!isRecord(condition)) {
        return condition;
      }
      const resolved = { ...condition };
      for (const [field, kind] of Object.entries(STORY_CHANGE_CONDITION_REFERENCE_KINDS)) {
        if (isTemporaryReference(condition[field])) {
          resolved[field] = this.reference(
            condition[field],
            kind,
            `${path}.${conditionIndex}.${field}`,
          );
        }
      }
      return resolved;
    });
  }

  private referenceList(references: StoryChangeReference[] | undefined, path: string): string[] {
    return (references ?? []).map((reference, index) =>
      this.reference(reference, 'interaction', `${path}.${index}`),
    );
  }

  reference(reference: StoryChangeReference, kind: StoryChangeEntityKind, path: string): string {
    if (!isTemporaryReference(reference)) {
      return reference;
    }
    const declared = this.references.get(reference.ref);
    if (!declared) {
      this.error(
        'UNKNOWN_REFERENCE',
        `Reference "${reference.ref}" is not declared by an earlier operation.`,
        path,
        { ref: reference.ref },
      );
      return '';
    }
    if (declared.kind !== kind) {
      this.error(
        'REFERENCE_KIND_MISMATCH',
        `Reference "${reference.ref}" names a ${declared.kind}, not a ${kind}.`,
        path,
        { ref: reference.ref, expected: kind, actual: declared.kind },
      );
      return '';
    }
    return declared.id;
  }

  declare(ref: string | undefined, path: string, reference: DeclaredReference): void {
    if (this.failed()) {
      return;
    }
    if (ref !== undefined) {
      if (!STORY_CHANGE_REFERENCE_PATTERN.test(ref)) {
        this.error(
          'INVALID_REFERENCE',
          'A reference starts with a letter and contains at most 64 letters, digits, "_" or "-".',
          path,
        );
        return;
      }
      if (this.references.has(ref)) {
        this.error('DUPLICATE_REFERENCE', `Reference "${ref}" is already declared.`, path, { ref });
        return;
      }
      if (this.references.size >= STORY_CHANGE_BATCH_LIMITS.references) {
        this.error('TOO_MANY_REFERENCES', 'The batch declares too many references.', path);
        return;
      }
      this.references.set(ref, reference);
    }
    this.created.push({
      kind: reference.kind,
      operationIndex: this.index,
      id: reference.id,
      ...(ref === undefined ? {} : { ref }),
      ...(reference.interactionId === undefined ? {} : { interactionId: reference.interactionId }),
    });
  }

  private error(
    code: string,
    message: string,
    path: string,
    details?: Record<string, unknown>,
  ): void {
    this.diagnostics.push({
      severity: 'error',
      operationIndex: this.index,
      code,
      message,
      path,
      ...(details === undefined ? {} : { details }),
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolution keeps malformed values in place so that the entity validation of
 * the caller reports them with their path; it never throws on a malformed batch.
 */
export function isTemporaryReference(value: unknown): value is { ref: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { ref?: unknown }).ref === 'string'
  );
}
