import { randomUUID } from 'node:crypto';
import type { Interaction, Position } from '@paralleax/shared';

interface DefaultInteractionInput {
  id: string;
  position: Position;
  title?: string;
  body?: string;
  inputInteractionIds?: string[];
}

export function buildInteractionWithDefaultTrigger({
  id,
  position,
  title = 'New interaction',
  body = 'Describe what happens here.',
  inputInteractionIds = [],
}: DefaultInteractionInput): Interaction {
  return {
    id,
    title,
    body,
    position: { ...position },
    durationMinutes: 0,
    triggers: [
      {
        id: randomUUID(),
        inputInteractionIds: [...inputInteractionIds],
        conditionGroups: [{ id: randomUUID(), conditions: [] }],
        appearanceProbability: 100,
        timerSeconds: null,
      },
    ],
  };
}
