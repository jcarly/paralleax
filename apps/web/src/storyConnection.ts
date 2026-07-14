import type { Connection } from '@xyflow/react';
import type { Interaction, Story } from '@paralleax/shared';

export interface PendingConnection {
  sourceId: string;
  target: Interaction;
  existingTriggerIds: Set<string>;
}

export function getPendingConnection(
  story: Story | undefined,
  connection: Connection,
): PendingConnection | undefined {
  if (!story || !connection.source || !connection.target) return undefined;
  if (connection.source === connection.target) return undefined;

  const target = story.interactions.find((item) => item.id === connection.target);
  if (!target) return undefined;
  if (target.triggers.some((trigger) => trigger.inputInteractionIds.includes(connection.source))) {
    return undefined;
  }

  return {
    sourceId: connection.source,
    target,
    existingTriggerIds: new Set(target.triggers.map((trigger) => trigger.id)),
  };
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
