import type { Story } from '../model/stories.js';

export interface TriggerConnectionConflict {
  sourceInteractionId: string;
  targetInteractionId: string;
  existingTriggerId: string;
}

/** Finds another Trigger that already owns the directed source -> target connection. */
export function findTriggerConnectionConflict(
  story: Pick<Story, 'interactions'>,
  sourceInteractionId: string,
  targetInteractionId: string,
  excludingTriggerId?: string,
): TriggerConnectionConflict | undefined {
  const target = story.interactions.find(({ id }) => id === targetInteractionId);
  const existingTrigger = target?.triggers.find(
    (trigger) =>
      trigger.id !== excludingTriggerId &&
      trigger.inputInteractionIds.includes(sourceInteractionId),
  );
  return existingTrigger
    ? { sourceInteractionId, targetInteractionId, existingTriggerId: existingTrigger.id }
    : undefined;
}

/** Finds the first newly introduced input that duplicates a connection on another Trigger. */
export function findNewTriggerInputConflict(
  story: Pick<Story, 'interactions'>,
  targetInteractionId: string,
  proposedInputInteractionIds: readonly string[],
  options: {
    triggerId?: string;
    existingInputInteractionIds?: readonly string[];
  } = {},
): TriggerConnectionConflict | undefined {
  const existingInputs = new Set(options.existingInputInteractionIds ?? []);
  for (const sourceInteractionId of new Set(proposedInputInteractionIds)) {
    if (existingInputs.has(sourceInteractionId)) continue;
    const conflict = findTriggerConnectionConflict(
      story,
      sourceInteractionId,
      targetInteractionId,
      options.triggerId,
    );
    if (conflict) return conflict;
  }
  return undefined;
}
