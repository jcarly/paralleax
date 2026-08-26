import { useCallback, useState } from 'react';
import type { Interaction, ReaderProgressState, Story } from '@paralleax/shared';
import {
  applyInteractionItemEffects,
  applyInteractionItemStatChanges,
  applyInteractionStatChanges,
  buildReaderProgressState,
  getJourneyDateTime,
} from '@paralleax/shared';

const EMPTY_READER_SESSION: ReaderProgressState = {
  version: 2,
  journeyInteractionIds: [],
  currentInteractionId: null,
  visitedInteractionIds: [],
  currentDateTime: '2000-01-03T08:00',
  currentLocationId: null,
  statValues: {},
  ownedItemIds: [],
  itemStatValues: {},
};

export function useReaderSessionState() {
  const [session, setSession] = useState<ReaderProgressState>(EMPTY_READER_SESSION);

  const replay = useCallback(
    (story: Story, journeyInteractionIds: string[], ownedItemIds: string[] = []) => {
      const nextSession = buildReaderProgressState(story, journeyInteractionIds, ownedItemIds);
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
        version: 2,
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
