import type { Connection } from '@xyflow/react';
import type { Interaction, Story } from '@paralleax/shared';

export interface PendingConnection {
  sourceId: string;
  target: Interaction;
  existingTriggerIds: Set<string>;
}

export interface PendingTriggerInputConnection {
  sourceId: string;
  targetId: string;
  trigger: Interaction['triggers'][number];
}

export function getPendingConnection(
  story: Story | undefined,
  connection: Connection,
): PendingConnection | undefined {
  if (!story || !connection.source || !connection.target) return undefined;
  if (connection.source === connection.target) return undefined;
  if (connection.targetHandle && connection.targetHandle !== 'new-trigger-input') {
    return undefined;
  }

  const target = story.interactions.find((item) => item.id === connection.target);
  if (!target) return undefined;

  return {
    sourceId: connection.source,
    target,
    existingTriggerIds: new Set(target.triggers.map((trigger) => trigger.id)),
  };
}

export function getPendingTriggerInputConnection(
  story: Story | undefined,
  sourceId: string | undefined,
  targetId: string | undefined,
  triggerId: string | undefined,
): PendingTriggerInputConnection | undefined {
  if (!story || !sourceId || !targetId || !triggerId) return undefined;
  if (sourceId === targetId) return undefined;

  const target = story.interactions.find((item) => item.id === targetId);
  const source = story.interactions.find((item) => item.id === sourceId);
  if (!target || !source) return undefined;

  const trigger = target.triggers.find((item) => item.id === triggerId);
  if (!trigger || trigger.inputInteractionIds.includes(sourceId)) return undefined;

  return { sourceId, targetId, trigger };
}

export function findCreatedTrigger(
  story: Story,
  targetId: string,
  existingTriggerIds: ReadonlySet<string>,
): Interaction['triggers'][number] | undefined {
  const target = story.interactions.find((item) => item.id === targetId);
  return (
    target?.triggers.find((trigger) => !existingTriggerIds.has(trigger.id)) ??
    target?.triggers.at(-1)
  );
}
