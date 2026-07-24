export interface Position {
  x: number;
  y: number;
}
export interface TriggerCondition {
  interactionId: string;
  hasBeenVisited: boolean;
}
export interface Trigger {
  id: string;
  inputInteractionIds: string[];
  conditions: TriggerCondition[];
}
export interface Interaction {
  id: string;
  title: string;
  body: string;
  position: Position;
  triggers: Trigger[];
}
export interface Story {
  id: string;
  revision?: number;
  title: string;
  interactions: Interaction[];
  createdAt: string;
  updatedAt: string;
}
export interface StoryMutationMetadata {
  revision: number;
  updatedAt: string;
}
export interface InteractionMutationResult extends StoryMutationMetadata {
  interaction: Interaction;
}
export interface TriggerMutationResult extends StoryMutationMetadata {
  interactionId: string;
  trigger: Trigger;
}
export interface CreateStoryInput {
  title: string;
}
export interface CreateInteractionInput {
  parentId?: string;
  position?: Position;
}
export interface UpdateInteractionInput {
  title?: string;
  body?: string | null;
  position?: Position;
}
export interface UpdateTriggerInput {
  inputInteractionIds: string[];
  conditions: TriggerCondition[];
}
export interface TriggerConditionFailure {
  triggerId: string;
  condition: TriggerCondition;
}
export type InteractionContentPatch = Partial<Pick<Interaction, 'title' | 'body' | 'position'>>;
export type TriggerPatch = Pick<Trigger, 'inputInteractionIds' | 'conditions'>;

export const childOffsetX = 0;
export const childOffsetY = 132;
export const childVerticalGap = 132;
export const minNodeVerticalDistance = 112;
export const sameColumnTolerance = 260;
export const rootColumnX = 80;
export const rootStartY = 120;

export function createDemoStory(storyId: string, timestamp: string): Story {
  return {
    id: storyId,
    title: 'Demo: branching investigation',
    createdAt: timestamp,
    updatedAt: timestamp,
    interactions: [
      {
        id: 'demo-root-museum',
        title: 'Enter the museum',
        body: 'The museum opens for a private evening visit. Two wings are lit, but the staff has vanished.',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'demo-trigger-root-museum', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'demo-root-archive',
        title: 'Start in the archive',
        body: 'You begin in the basement archive, surrounded by catalog cards and old security logs.',
        position: { x: 80, y: 420 },
        triggers: [{ id: 'demo-trigger-root-archive', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'demo-signal',
        title: 'Follow the radio signal',
        body: 'A handheld radio crackles with a repeating code coming from the east wing.',
        position: { x: 420, y: 60 },
        triggers: [
          {
            id: 'demo-trigger-signal',
            inputInteractionIds: ['demo-root-museum'],
            conditions: [],
          },
        ],
      },
      {
        id: 'demo-door',
        title: 'Inspect the sealed door',
        body: 'A service door is sealed with a new electronic lock. Fresh scratches mark the frame.',
        position: { x: 420, y: 250 },
        triggers: [
          { id: 'demo-trigger-door', inputInteractionIds: ['demo-root-museum'], conditions: [] },
        ],
      },
      {
        id: 'demo-ledger',
        title: 'Read the missing ledger',
        body: 'The archive ledger lists one exhibit that should not exist: Gallery Zero.',
        position: { x: 420, y: 470 },
        triggers: [
          {
            id: 'demo-trigger-ledger',
            inputInteractionIds: ['demo-root-archive'],
            conditions: [],
          },
        ],
      },
      {
        id: 'demo-courtyard',
        title: 'Reach the inner courtyard',
        body: 'Both paths lead to a glass courtyard. Rain taps against the roof while the lights flicker.',
        position: { x: 760, y: 160 },
        triggers: [
          {
            id: 'demo-trigger-courtyard',
            inputInteractionIds: ['demo-signal', 'demo-door'],
            conditions: [],
          },
        ],
      },
      {
        id: 'demo-vault',
        title: 'Open Gallery Zero',
        body: 'The ledger code unlocks a hidden gallery. Inside, the missing exhibit waits under a dust cover.',
        position: { x: 1100, y: 80 },
        triggers: [
          {
            id: 'demo-trigger-vault',
            inputInteractionIds: ['demo-courtyard'],
            conditions: [{ interactionId: 'demo-ledger', hasBeenVisited: true }],
          },
        ],
      },
      {
        id: 'demo-guard',
        title: 'Call the night guard',
        body: 'Without the archive code, you call the night guard and describe the courtyard clue.',
        position: { x: 1100, y: 300 },
        triggers: [
          {
            id: 'demo-trigger-guard',
            inputInteractionIds: ['demo-courtyard'],
            conditions: [{ interactionId: 'demo-ledger', hasBeenVisited: false }],
          },
        ],
      },
      {
        id: 'demo-report',
        title: 'Write the incident report',
        body: 'Your notes connect the radio code, the sealed door, and the archive ledger into one report.',
        position: { x: 1440, y: 190 },
        triggers: [
          {
            id: 'demo-trigger-report',
            inputInteractionIds: ['demo-vault', 'demo-guard'],
            conditions: [],
          },
        ],
      },
    ],
  };
}

function hasOwn<T extends object, K extends PropertyKey>(
  item: T,
  key: K,
): item is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(item, key);
}

export function normalizeTriggerInputIds(inputInteractionIds: string[]): string[] {
  return [...new Set(inputInteractionIds)];
}

export function updateInteractionInStory(
  story: Story,
  interactionId: string,
  patch: Partial<Interaction>,
): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId ? { ...item, ...patch } : item,
    ),
  };
}

export function updateTriggerInStory(
  story: Story,
  interactionId: string,
  triggerId: string,
  patch: TriggerPatch,
): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId
        ? {
            ...item,
            triggers: item.triggers.map((trigger) =>
              trigger.id === triggerId
                ? {
                    ...trigger,
                    inputInteractionIds: normalizeTriggerInputIds(patch.inputInteractionIds),
                    conditions: patch.conditions,
                  }
                : trigger,
            ),
          }
        : item,
    ),
  };
}

export function deleteTriggerInStory(
  story: Story,
  interactionId: string,
  triggerId: string,
): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId
        ? {
            ...item,
            triggers:
              item.triggers.length <= 1
                ? item.triggers.map((trigger) =>
                    trigger.id === triggerId ? { ...trigger, inputInteractionIds: [] } : trigger,
                  )
                : item.triggers.filter((trigger) => trigger.id !== triggerId),
          }
        : item,
    ),
  };
}

export function deleteInteractionFromStory(story: Story, interactionId: string): Story {
  return {
    ...story,
    interactions: story.interactions
      .filter((item) => item.id !== interactionId)
      .map((item) => ({
        ...item,
        triggers: item.triggers.map((trigger) => {
          const inputInteractionIds = trigger.inputInteractionIds.filter(
            (id) => id !== interactionId,
          );
          return {
            ...trigger,
            inputInteractionIds,
            conditions: trigger.conditions.filter(
              (condition) => condition.interactionId !== interactionId,
            ),
          };
        }),
      })),
  };
}

export function mergeServerStory(
  current: Story,
  incoming: Story,
  edited?: { interactionId: string; patch: InteractionContentPatch },
  options: {
    preserveCurrentTriggers?: boolean;
    deletedTriggerIds?: ReadonlySet<string>;
    deletedTriggerInputKeys?: ReadonlySet<string>;
  } = {},
): Story {
  return {
    ...incoming,
    interactions: incoming.interactions.map((item) => {
      const currentItem = current.interactions.find((candidate) => candidate.id === item.id);
      const triggers = (
        options.preserveCurrentTriggers && currentItem ? currentItem.triggers : item.triggers
      )
        .filter((trigger) => !options.deletedTriggerIds?.has(trigger.id))
        .map((trigger) => ({
          ...trigger,
          inputInteractionIds: trigger.inputInteractionIds.filter(
            (inputId) => !options.deletedTriggerInputKeys?.has(`${trigger.id}:${inputId}`),
          ),
        }));
      if (!currentItem) return { ...item, triggers };
      const patch = item.id === edited?.interactionId ? edited.patch : undefined;

      return {
        ...item,
        title: hasOwn(patch ?? {}, 'title') ? (patch?.title ?? '') : currentItem.title,
        body: hasOwn(patch ?? {}, 'body') ? (patch?.body ?? '') : currentItem.body,
        position: hasOwn(patch ?? {}, 'position')
          ? (patch?.position ?? currentItem.position)
          : currentItem.position,
        triggers,
      };
    }),
  };
}

export function ensureStoryInteractionPositions(story: Story): Story {
  return {
    ...story,
    interactions: story.interactions.map((interaction, index) =>
      hasPosition(interaction)
        ? interaction
        : { ...interaction, position: getDefaultInteractionPosition(index) },
    ),
  };
}

export function getNextChildPosition(story: Story, parent: Interaction): Position {
  const parentPosition = getInteractionPosition(
    parent,
    story.interactions.findIndex((interaction) => interaction.id === parent.id),
  );
  const x = parentPosition.x + childOffsetX;
  const firstY = parentPosition.y + childOffsetY;
  const occupied = story.interactions.filter((item) => item.id !== parent.id);

  return findFreePosition(occupied, x, firstY);
}

export function getNextParentPosition(story: Story, target: Interaction): Position {
  const targetPosition = getInteractionPosition(
    target,
    story.interactions.findIndex((interaction) => interaction.id === target.id),
  );
  const x = targetPosition.x - childOffsetX;
  return findFreePositionAbove(story.interactions, x, targetPosition.y - childOffsetY);
}

export function getNextRootPosition(story: Story): Position {
  const roots = story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) => trigger.inputInteractionIds.length === 0),
  );
  if (roots.length === 0) return { x: rootColumnX, y: rootStartY };

  const lowestRoot = roots.reduce((lowest, interaction) => {
    const interactionPosition = getInteractionPosition(
      interaction,
      story.interactions.findIndex((item) => item.id === interaction.id),
    );
    const lowestPosition = getInteractionPosition(
      lowest,
      story.interactions.findIndex((item) => item.id === lowest.id),
    );
    return interactionPosition.y > lowestPosition.y ? interaction : lowest;
  });
  const lowestRootPosition = getInteractionPosition(
    lowestRoot,
    story.interactions.findIndex((item) => item.id === lowestRoot.id),
  );

  return findFreePosition(
    story.interactions,
    lowestRootPosition.x,
    lowestRootPosition.y + childVerticalGap,
  );
}

function findFreePosition(occupied: Interaction[], x: number, firstY: number): Position {
  for (let index = 0; index <= occupied.length + 1; index += 1) {
    const y = firstY + index * childVerticalGap;
    const isFree = occupied.every((item, itemIndex) => {
      const position = getInteractionPosition(item, itemIndex);
      return (
        Math.abs(position.x - x) > sameColumnTolerance ||
        Math.abs(position.y - y) >= minNodeVerticalDistance
      );
    });
    if (isFree) return { x, y };
  }

  return { x, y: firstY + (occupied.length + 2) * childVerticalGap };
}

function findFreePositionAbove(occupied: Interaction[], x: number, firstY: number): Position {
  for (let index = 0; index <= occupied.length + 1; index += 1) {
    const y = firstY - index * childVerticalGap;
    const isFree = occupied.every((item, itemIndex) => {
      const position = getInteractionPosition(item, itemIndex);
      return (
        Math.abs(position.x - x) > sameColumnTolerance ||
        Math.abs(position.y - y) >= minNodeVerticalDistance
      );
    });
    if (isFree) return { x, y };
  }

  return { x, y: firstY - (occupied.length + 2) * childVerticalGap };
}

function getInteractionPosition(interaction: Interaction, index: number): Position {
  if (hasPosition(interaction)) {
    return interaction.position;
  }

  return getDefaultInteractionPosition(index);
}

function getDefaultInteractionPosition(index: number): Position {
  return {
    x: rootColumnX,
    y: rootStartY + Math.max(index, 0) * childVerticalGap,
  };
}

function hasPosition(interaction: Interaction): boolean {
  return (
    typeof interaction.position?.x === 'number' &&
    Number.isFinite(interaction.position.x) &&
    typeof interaction.position?.y === 'number' &&
    Number.isFinite(interaction.position.y)
  );
}

export function isTriggerEligible(
  trigger: Trigger,
  currentInteractionId: string | null,
  visited: Set<string>,
): boolean {
  return (
    doesTriggerInputMatch(trigger, currentInteractionId) &&
    trigger.conditions.every((condition) =>
      condition.hasBeenVisited
        ? visited.has(condition.interactionId)
        : !visited.has(condition.interactionId),
    )
  );
}

export function doesTriggerInputMatch(
  trigger: Trigger,
  currentInteractionId: string | null,
): boolean {
  const hasInputs = trigger.inputInteractionIds.length > 0;
  const hasConditions = trigger.conditions.length > 0;
  return hasInputs
    ? currentInteractionId !== null && trigger.inputInteractionIds.includes(currentInteractionId)
    : hasConditions || currentInteractionId === null;
}

export function getAvailableInteractions(
  story: Story,
  currentInteractionId: string | null,
  visitedIds: string[],
): Interaction[] {
  const visited = new Set(visitedIds);
  return story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) =>
      isTriggerEligible(trigger, currentInteractionId, visited),
    ),
  );
}

export function getInputReachableInteractions(
  story: Story,
  currentInteractionId: string | null,
): Interaction[] {
  return story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) => doesTriggerInputMatch(trigger, currentInteractionId)),
  );
}

export function getTriggerConditionFailures(
  interaction: Interaction,
  currentInteractionId: string | null,
  visitedIds: string[],
): TriggerConditionFailure[] {
  const visited = new Set(visitedIds);
  const inputMatchingTriggers = interaction.triggers.filter((trigger) =>
    doesTriggerInputMatch(trigger, currentInteractionId),
  );

  if (
    inputMatchingTriggers.some((trigger) =>
      trigger.conditions.every((condition) =>
        condition.hasBeenVisited
          ? visited.has(condition.interactionId)
          : !visited.has(condition.interactionId),
      ),
    )
  ) {
    return [];
  }

  return inputMatchingTriggers.flatMap((trigger) =>
    trigger.conditions
      .filter((condition) =>
        condition.hasBeenVisited
          ? !visited.has(condition.interactionId)
          : visited.has(condition.interactionId),
      )
      .map((condition) => ({ triggerId: trigger.id, condition })),
  );
}
