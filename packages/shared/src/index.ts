export interface Position { x: number; y: number }
export interface TriggerCondition { interactionId: string; hasBeenVisited: boolean }
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
  title: string;
  interactions: Interaction[];
  createdAt: string;
  updatedAt: string;
}
export interface CreateStoryInput { title?: string }
export interface CreateInteractionInput { parentId?: string; position?: Position }
export interface UpdateInteractionInput { title?: string; body?: string; position?: Position }
export interface UpdateTriggerInput { inputInteractionIds: string[]; conditions: TriggerCondition[] }
export type InteractionContentPatch = Partial<Pick<Interaction, 'title' | 'body' | 'position'>>
export type TriggerPatch = Pick<Trigger, 'inputInteractionIds' | 'conditions'>

export const childOffsetX = 340;
export const childOffsetY = 140;
export const childVerticalGap = 150;
export const minNodeVerticalDistance = 120;
export const sameColumnTolerance = 260;

function hasOwn<T extends object, K extends PropertyKey>(item: T, key: K): item is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(item, key);
}

export function normalizeTriggerInputIds(inputInteractionIds: string[]): string[] {
  return [...new Set(inputInteractionIds)];
}

export function updateInteractionInStory(story: Story, interactionId: string, patch: Partial<Interaction>): Story {
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

export function deleteTriggerInStory(story: Story, interactionId: string, triggerId: string): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId
        ? { ...item, triggers: item.triggers.filter((trigger) => trigger.id !== triggerId) }
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
        triggers: item.triggers.flatMap((trigger) => {
          const hadDeletedInput = trigger.inputInteractionIds.includes(interactionId);
          const inputInteractionIds = trigger.inputInteractionIds.filter((id) => id !== interactionId);
          if (hadDeletedInput && inputInteractionIds.length === 0) return [];
          return [{
            ...trigger,
            inputInteractionIds,
            conditions: trigger.conditions.filter((condition) => condition.interactionId !== interactionId),
          }];
        }),
      })),
  };
}

export function mergeServerStory(
  current: Story,
  incoming: Story,
  edited?: { interactionId: string; patch: InteractionContentPatch },
  options: { preserveCurrentTriggers?: boolean; deletedTriggerIds?: ReadonlySet<string> } = {},
): Story {
  return {
    ...incoming,
    interactions: incoming.interactions.map((item) => {
      const currentItem = current.interactions.find((candidate) => candidate.id === item.id);
      const triggers = (options.preserveCurrentTriggers && currentItem ? currentItem.triggers : item.triggers)
        .filter((trigger) => !options.deletedTriggerIds?.has(trigger.id));
      if (!currentItem) return { ...item, triggers };
      const patch = item.id === edited?.interactionId ? edited.patch : undefined;

      return {
        ...item,
        title: hasOwn(patch ?? {}, 'title') ? patch?.title ?? '' : currentItem.title,
        body: hasOwn(patch ?? {}, 'body') ? patch?.body ?? '' : currentItem.body,
        position: hasOwn(patch ?? {}, 'position') ? patch?.position ?? currentItem.position : currentItem.position,
        triggers,
      };
    }),
  };
}

export function getNextChildPosition(story: Story, parent: Interaction): Position {
  const x = parent.position.x + childOffsetX;
  const firstY = parent.position.y + childOffsetY;
  const occupied = story.interactions.filter((item) => item.id !== parent.id);

  for (let index = 0; index <= occupied.length + 1; index += 1) {
    const y = firstY + index * childVerticalGap;
    const isFree = occupied.every((item) =>
      Math.abs(item.position.x - x) > sameColumnTolerance
      || Math.abs(item.position.y - y) >= minNodeVerticalDistance,
    );
    if (isFree) return { x, y };
  }

  return { x, y: firstY + (occupied.length + 2) * childVerticalGap };
}

export function isTriggerEligible(trigger: Trigger, currentInteractionId: string | null, visited: Set<string>): boolean {
  const inputMatches = trigger.inputInteractionIds.length === 0
    ? currentInteractionId === null
    : currentInteractionId !== null && trigger.inputInteractionIds.includes(currentInteractionId);
  return inputMatches && trigger.conditions.every((condition) =>
    condition.hasBeenVisited ? visited.has(condition.interactionId) : !visited.has(condition.interactionId),
  );
}

export function getAvailableInteractions(story: Story, currentInteractionId: string | null, visitedIds: string[]): Interaction[] {
  const visited = new Set(visitedIds);
  return story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) => isTriggerEligible(trigger, currentInteractionId, visited)),
  );
}
