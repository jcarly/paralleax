import type {
  StoryChangeEntityKind,
  StoryChangeOperation,
  StoryChangeReference,
} from './contract.js';
import type { ResolvedStoryChangeOperation } from './resolved.js';

/*
 * Reference resolution of the stat operations and of stat effects (ADR-050
 * amendment). A definition and an assignment are different entity kinds: an
 * effect or a condition names an assignment, so a definition reference there is
 * a kind mismatch.
 */

/** What the resolver offers to its stat extension. */
export interface StatReferenceScope {
  readonly index: number;
  generateId(): string;
  reference(reference: StoryChangeReference, kind: StoryChangeEntityKind, path: string): string;
  declare(
    ref: string | undefined,
    path: string,
    reference: { kind: StoryChangeEntityKind; id: string },
  ): void;
}

type StatOperation = Extract<
  StoryChangeOperation,
  {
    type:
      | 'create_stat_definition'
      | 'update_stat_definition'
      | 'create_stat_assignment'
      | 'update_stat_assignment';
  }
>;

export function isStatOperation(operation: StoryChangeOperation): operation is StatOperation {
  return operation.type.includes('_stat_');
}

export function resolveStatOperation(
  scope: StatReferenceScope,
  operation: StatOperation,
): ResolvedStoryChangeOperation {
  const { index } = scope;
  switch (operation.type) {
    case 'create_stat_definition': {
      const statDefinitionId = scope.generateId();
      scope.declare(operation.ref, 'ref', { kind: 'statDefinition', id: statDefinitionId });
      return { type: operation.type, index, statDefinitionId, fields: operation.fields };
    }
    case 'update_stat_definition':
      return {
        type: operation.type,
        index,
        statDefinitionId: scope.reference(
          operation.statDefinition,
          'statDefinition',
          'statDefinition',
        ),
        fields: operation.fields,
      };
    case 'create_stat_assignment':
      return resolveCreateAssignment(scope, operation);
    case 'update_stat_assignment':
      return {
        type: operation.type,
        index,
        assignmentId: scope.reference(operation.assignment, 'statAssignment', 'assignment'),
        fields: operation.fields,
      };
  }
}

function resolveCreateAssignment(
  scope: StatReferenceScope,
  operation: Extract<StatOperation, { type: 'create_stat_assignment' }>,
): ResolvedStoryChangeOperation {
  const statDefinitionId = scope.reference(
    operation.statDefinition,
    'statDefinition',
    'statDefinition',
  );
  const { owner } = operation;
  const ownerId = resolveOwnerId(scope, owner);
  const assignmentId = scope.generateId();
  scope.declare(operation.ref, 'ref', { kind: 'statAssignment', id: assignmentId });
  return {
    type: operation.type,
    index: scope.index,
    assignmentId,
    statDefinitionId,
    ownerType: owner.type,
    ...(ownerId === undefined ? {} : { ownerId }),
    fields: operation.fields,
  };
}

/** The Story has no ID; a character or location may be a reference; an item definition is existing. */
function resolveOwnerId(
  scope: StatReferenceScope,
  owner: Extract<StatOperation, { type: 'create_stat_assignment' }>['owner'],
): string | undefined {
  if (owner.type === 'story') {
    return undefined;
  }
  return owner.type === 'itemDefinition'
    ? owner.id
    : scope.reference(owner.id, owner.type, 'owner.id');
}

/** Each effect's `statId` names an assignment: an existing ID or a reference. */
export function resolveStatEffects(
  scope: StatReferenceScope,
  effects: unknown,
  path: string,
): Record<string, unknown> {
  if (effects === undefined) {
    return {};
  }
  return {
    statEffects: Array.isArray(effects)
      ? effects.map((effect: unknown, effectIndex) =>
          resolveStatEffect(scope, effect, `${path}.statEffects.${effectIndex}`),
        )
      : effects,
  };
}

function resolveStatEffect(scope: StatReferenceScope, effect: unknown, path: string): unknown {
  if (!isReferenceHolder(effect)) {
    return effect;
  }
  return { ...effect, statId: scope.reference(effect.statId, 'statAssignment', `${path}.statId`) };
}

function isReferenceHolder(value: unknown): value is { statId: { ref: string } } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const statId: unknown = Reflect.get(value, 'statId');
  return (
    typeof statId === 'object' &&
    statId !== null &&
    !Array.isArray(statId) &&
    typeof Reflect.get(statId, 'ref') === 'string'
  );
}
