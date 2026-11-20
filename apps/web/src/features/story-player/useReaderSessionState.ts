import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  applyInteractionItemEffects,
  applyInteractionVariableChanges,
  buildReaderProgressState,
  getJourneyDateTime,
  type Interaction,
  type ReaderProgressState,
  type Story,
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
  return randomSeedFromCrypto(globalThis.crypto);
}

function randomSeedFromCrypto(cryptoValue: { randomUUID?: () => string } | undefined): string {
  return (
    cryptoValue?.randomUUID?.() ?? `reader-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function useReaderSessionState() {
  const [session, setSession] = useState<ReaderProgressState>(EMPTY_READER_SESSION);
  const randomSeedRef = useRef(createReaderRandomSeed());

  const replay = useReaderReplay(randomSeedRef, setSession);
  const advance = useReaderAdvance(session, randomSeedRef, setSession);

  return { session, replay, advance };
}

type ReaderSessionSetter = Dispatch<SetStateAction<ReaderProgressState>>;
type ReaderReplayArguments = [
  story: Story,
  journeyInteractionIds: string[],
  ownedItemIds?: string[],
  randomSeed?: string,
  stepStartedAt?: string[],
];

function useReaderReplay(randomSeedRef: RefObject<string>, setSession: ReaderSessionSetter) {
  return useCallback(
    (
      ...[
        story,
        journeyInteractionIds,
        ownedItemIds = [],
        randomSeed,
        stepStartedAt,
      ]: ReaderReplayArguments
    ) => {
      randomSeedRef.current =
        randomSeed !== undefined && randomSeed !== '' ? randomSeed : randomSeedRef.current;
      const now = new Date().toISOString();
      const normalizedStepStartedAt = Array.from(
        { length: journeyInteractionIds.length + 1 },
        (_, index) => {
          const value = stepStartedAt?.[index];
          return value !== undefined && value !== '' && !Number.isNaN(Date.parse(value))
            ? value
            : now;
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
    [randomSeedRef, setSession],
  );
}

function useReaderAdvance(
  session: ReaderProgressState,
  randomSeedRef: RefObject<string>,
  setSession: ReaderSessionSetter,
) {
  return useCallback(
    (story: Story, interaction: Interaction) => {
      const journeyInteractionIds = [...session.journeyInteractionIds, interaction.id];
      const ownedItemIds = applyInteractionItemEffects(
        story,
        session.ownedItemIds,
        interaction,
        session.journeyInteractionIds.length,
      );
      const variables = applyInteractionVariableChanges(
        story,
        session.statValues,
        session.itemStatValues ?? {},
        interaction,
        ownedItemIds,
      );
      const nextSession: ReaderProgressState = {
        ...session,
        version: 4,
        randomSeed:
          session.randomSeed !== undefined && session.randomSeed !== ''
            ? session.randomSeed
            : randomSeedRef.current,
        stepStartedAt: [...(session.stepStartedAt ?? []), new Date().toISOString()],
        journeyInteractionIds,
        currentInteractionId: interaction.id,
        visitedInteractionIds: session.visitedInteractionIds.includes(interaction.id)
          ? session.visitedInteractionIds
          : [...session.visitedInteractionIds, interaction.id],
        currentDateTime: getJourneyDateTime(story, journeyInteractionIds),
        currentLocationId: interaction.locationId ?? session.currentLocationId,
        ...variables,
        ownedItemIds,
      };
      setSession(nextSession);
      return nextSession;
    },
    [randomSeedRef, session, setSession],
  );
}
