import { useCallback, useRef, useState } from 'react';
import type { Interaction, ReaderProgressState, Story } from '@paralleax/shared';
import {
  applyInteractionItemEffects,
  applyInteractionItemStatChanges,
  applyInteractionStatChanges,
  buildReaderProgressState,
  getJourneyDateTime,
} from '@paralleax/shared';

const EMPTY_READER_SESSION: ReaderProgressState = {
  version: 4,
  randomSeed: '',
  stepStartedAt: [],
  journeyInteractionIds: [],
  currentInteractionId: null,
  visitedInteractionIds: [],
  currentDateTime: '2000-01-03T08:00',
  currentLocationId: null,
  statValues: {},
  ownedItemIds: [],
  itemStatValues: {},
};

export function createReaderRandomSeed(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `reader-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function useReaderSessionState() {
  const [session, setSession] = useState<ReaderProgressState>(EMPTY_READER_SESSION);
  const randomSeedRef = useRef(createReaderRandomSeed());

  const replay = useCallback(
    (
      story: Story,
      journeyInteractionIds: string[],
      ownedItemIds: string[] = [],
      randomSeed?: string,
      stepStartedAt?: string[],
    ) => {
      randomSeedRef.current = randomSeed || randomSeedRef.current;
      const now = new Date().toISOString();
      const normalizedStepStartedAt = Array.from(
        { length: journeyInteractionIds.length + 1 },
        (_, index) => {
          const value = stepStartedAt?.[index];
          return value && !Number.isNaN(Date.parse(value)) ? value : now;
        },
      );
      const nextSession = buildReaderProgressState(
        story,
        journeyInteractionIds,
        ownedItemIds,
        randomSeedRef.current,
        normalizedStepStartedAt,
      );
      setSession(nextSession);
      return nextSession;
    },
    [],
  );

  const advance = useCallback(
    (story: Story, interaction: Interaction) => {
      const journeyInteractionIds = [...session.journeyInteractionIds, interaction.id];
      const ownedItemIds = applyInteractionItemEffects(
        story,
        session.ownedItemIds,
        interaction,
        session.journeyInteractionIds.length,
      );
      const nextSession: ReaderProgressState = {
        ...session,
        version: 4,
        randomSeed: session.randomSeed || randomSeedRef.current,
        stepStartedAt: [...(session.stepStartedAt ?? []), new Date().toISOString()],
        journeyInteractionIds,
        currentInteractionId: interaction.id,
        visitedInteractionIds: session.visitedInteractionIds.includes(interaction.id)
          ? session.visitedInteractionIds
          : [...session.visitedInteractionIds, interaction.id],
        currentDateTime: getJourneyDateTime(story, journeyInteractionIds),
        currentLocationId: interaction.locationId ?? session.currentLocationId,
        statValues: applyInteractionStatChanges(story, session.statValues, interaction),
        ownedItemIds,
        itemStatValues: applyInteractionItemStatChanges(
          story,
          session.itemStatValues ?? {},
          interaction,
          ownedItemIds,
        ),
      };
      setSession(nextSession);
      return nextSession;
    },
    [session],
  );

  return { session, replay, advance };
}
