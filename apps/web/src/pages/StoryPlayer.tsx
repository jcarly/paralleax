import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import type { ReaderProgressState, ReaderSave, Story } from '@paralleax/shared';
import {
  canDeleteCommentThread,
  canManageCommentThread,
  doConditionsMatch,
  ensureStoryInteractionPositions,
  getAvailableInteractions,
  getInteractionTimerState,
  getInputReachableInteractions,
  getItemDefinitionIdForInstance,
  getTriggerConditionFailures,
  getTriggerTimerSeconds,
  isCommentAnchorDetached,
} from '@paralleax/shared';
import { RichTextContent } from '../components/RichTextContent';
import { RichTextEditor } from '../components/RichTextEditor';
import { StoryCommentsPanel } from '../features/comments/StoryCommentsPanel';
import { useStoryComments } from '../features/comments/useStoryComments';
import { ReaderSaveDialog } from '../features/story-player/ReaderSaveDialog';
import { PlayerChoices } from '../features/story-player/components/PlayerChoices';
import { PlayerContextPanels } from '../features/story-player/components/PlayerContextPanels';
import { PlayerScene } from '../features/story-player/components/PlayerScene';
import { PlayerToolbar } from '../features/story-player/components/PlayerToolbar';
import { useReaderProgressPersistence } from '../features/story-player/useReaderProgressPersistence';
import type { StoryPlayerRuntimeLoadResult } from '../features/story-player/loadStoryPlayerRuntime';
import { useStoryPlayerLoading } from '../features/story-player/runtime/useStoryPlayerLoading';
import { useStoryPlayerRuntimeSlice } from '../features/story-player/runtime/useStoryPlayerRuntimeSlice';
import { useStoryPlayerRealtimeRefresh } from '../features/story-player/runtime/useStoryPlayerRealtimeRefresh';
import { useReaderNavigationGuards } from '../features/story-player/navigation/useReaderNavigationGuards';
import { restoreReaderSave } from '../features/story-player/navigation/restoreReaderSave';
import { useAutomaticReaderTransitions } from '../features/story-player/navigation/useAutomaticReaderTransitions';
import { useReaderChoiceNavigation } from '../features/story-player/navigation/useReaderChoiceNavigation';
import { useSimulationAuthoringCommands } from '../features/story-player/simulation/useSimulationAuthoringCommands';
import {
  createReaderRandomSeed,
  useReaderSessionState,
} from '../features/story-player/useReaderSessionState';
import { useSimulationMutationPersistence } from '../features/story-player/useSimulationMutationPersistence';
import {
  getConditionSummary,
  getUnavailableReason,
} from '../features/story-player/storyPlayerPresentation';
import {
  isRealtimeEditableTarget,
  type StoryRealtimeInvalidation,
} from '../features/realtime/storyRealtime';
import { useStoryRouteAccessRecovery } from '../features/story/useStoryRouteAccessRecovery';
import { useStoryRealtime } from '../hooks/useStoryRealtime';
import { usePendingSaveGuard } from '../hooks/usePendingSaveGuard';
import { describeTriggerCondition } from '../triggerConditionPresentation';

export function StoryPlayer({
  authenticated = true,
  currentUserId,
}: {
  authenticated?: boolean;
  currentUserId?: string;
}) {
  const { t } = useTranslation();
  const { storyId = '' } = useParams();
  const { storyRouteInaccessible, markStoryInaccessible, recoverFromStoryAccessError } =
    useStoryRouteAccessRecovery(storyId);
  const [searchParams] = useSearchParams();
  const simulationRequested = authenticated && searchParams.get('mode') === 'simulation';
  const requestedStartInteractionId = simulationRequested
    ? searchParams.get('startInteractionId')
    : null;
  const [story, setStory] = useState<Story>();
  const isSimulationMode = simulationRequested && story?.capabilities?.canEdit === true;
  const progressMode = isSimulationMode ? 'simulation' : 'reader';
  const startInteractionId = isSimulationMode ? requestedStartInteractionId : null;
  const loadKey = `${storyId}:${simulationRequested ? 'simulation-request' : 'reader'}:${requestedStartInteractionId ?? ''}`;
  const runtimeLoadResultHandler = useRef<
    (result: StoryPlayerRuntimeLoadResult, markLoaded: () => void, requestKey: string) => void
  >(() => {});
  const dispatchRuntimeLoadResult = useCallback(
    (result: StoryPlayerRuntimeLoadResult, markLoaded: () => void, requestKey: string) => {
      runtimeLoadResultHandler.current(result, markLoaded, requestKey);
    },
    [],
  );
  const {
    loadedKey,
    loadError,
    retry: retryStoryLoad,
    clearError: clearStoryLoadError,
  } = useStoryPlayerLoading({
    loadKey,
    storyId,
    authenticated,
    progressMode,
    simulationRequested,
    requestedStartInteractionId,
    onLoaded: dispatchRuntimeLoadResult,
    recoverFromStoryAccessError,
    t,
  });
  const {
    session,
    replay: replayReaderSession,
    advance: advanceReaderSession,
  } = useReaderSessionState();
  const {
    journeyInteractionIds: journey,
    currentInteractionId: currentId,
    visitedInteractionIds: visited,
    currentDateTime,
    currentLocationId,
    statValues,
    ownedItemIds,
    itemStatValues = {},
    randomSeed = '',
    stepStartedAt = [],
  } = session;
  const {
    markRuntimeSliceLoaded,
    runtimeOptionsError,
    runtimeSliceMatchesRequest,
    runtimeSliceReady,
  } = useStoryPlayerRuntimeSlice({
    story,
    currentInteractionId: currentId,
    journeyInteractionIds: journey,
    routeLoaded: loadedKey === loadKey,
    setStory,
    recoverFromStoryAccessError,
    t,
  });
  const [playableCharacterId, setPlayableCharacterId] = useState<string>();
  const {
    status: progressStatus,
    markLoaded: markProgressLoaded,
    save: saveProgress,
    reset: resetProgress,
  } = useReaderProgressPersistence({ authenticated, storyId, mode: progressMode });
  const [savesOpen, setSavesOpen] = useState(false);
  const [forceUnavailableOptions, setForceUnavailableOptions] = useState(false);
  const [editingChoiceId, setEditingChoiceId] = useState<string>();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const editingChoiceInputRef = useRef<HTMLInputElement>(null);
  const savesDialogTrigger = useRef<HTMLButtonElement>(null);
  const sessionRef = useRef<ReaderProgressState>(session);
  const getCurrentReaderSession = useCallback(() => sessionRef.current, []);
  const replaySession = useCallback(
    (...args: Parameters<typeof replayReaderSession>) => {
      const nextSession = replayReaderSession(...args);
      sessionRef.current = nextSession;
      return nextSession;
    },
    [replayReaderSession],
  );
  const advanceSession = useCallback(
    (...args: Parameters<typeof advanceReaderSession>) => {
      const nextSession = advanceReaderSession(...args);
      sessionRef.current = nextSession;
      return nextSession;
    },
    [advanceReaderSession],
  );
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const directStartAutosavedKey = useRef('');
  const {
    clearChoiceCommit,
    commitChoiceStep,
    getNavigationVersion,
    incrementNavigationVersion,
    resetAutomaticTransitions,
    resetForNewStory,
    clearAutomaticPath,
    isAutomaticStepBlocked,
    continueAutomaticPath,
  } = useReaderNavigationGuards();
  const simulationMutations = useSimulationMutationPersistence({
    storyId,
    fallbackError: t('player.storyChangesSaveFailed'),
  });
  const hasActiveSimulationMutations = simulationMutations.hasActiveMutations;

  const closeSavesDialog = useCallback(() => {
    setSavesOpen(false);
    window.requestAnimationFrame(() => savesDialogTrigger.current?.focus());
  }, []);

  const pendingSaveGuard = usePendingSaveGuard(
    authenticated &&
      (progressStatus === 'saving' ||
        progressStatus === 'error' ||
        (isSimulationMode &&
          (simulationMutations.status === 'saving' || simulationMutations.status === 'error'))),
    'player',
  );

  const handleRuntimeLoaded = useCallback(
    (
      {
        positioned,
        progress,
        effectiveStartInteractionId,
        loadedProgressMode,
      }: StoryPlayerRuntimeLoadResult,
      markLoaded: () => void,
      requestKey: string,
    ) => {
      if (requestKey !== loadKey) return;
      resetForNewStory();
      setTimerNow(Date.now());
      const reconciledProgress = progress
        ? replaySession(
            positioned,
            progress.state.journeyInteractionIds,
            progress.state.ownedItemIds,
            progress.state.randomSeed ?? createReaderRandomSeed(),
            progress.state.stepStartedAt,
          )
        : undefined;
      const nextJourney =
        reconciledProgress?.journeyInteractionIds ??
        (effectiveStartInteractionId ? [effectiveStartInteractionId] : []);
      setStory(positioned);
      markRuntimeSliceLoaded(positioned, nextJourney.at(-1) ?? null, nextJourney);
      markLoaded();
      if (!reconciledProgress) {
        const createdSession = replaySession(positioned, nextJourney, [], createReaderRandomSeed());
        if (
          !effectiveStartInteractionId &&
          positioned.interactions.some((interaction) =>
            interaction.triggers.some((trigger) => getTriggerTimerSeconds(trigger) !== null),
          )
        ) {
          saveProgress(createdSession, loadedProgressMode);
        }
      } else if (
        !progress?.state.stepStartedAt ||
        progress.state.stepStartedAt.length !== progress.state.journeyInteractionIds.length + 1
      ) {
        saveProgress(reconciledProgress, loadedProgressMode);
      }
      if (nextJourney.length > 0) {
        setPlayableCharacterId(positioned.characters?.find(({ isPlayable }) => isPlayable)?.id);
      }
      markProgressLoaded(Boolean(progress));
    },
    [
      markProgressLoaded,
      markRuntimeSliceLoaded,
      resetForNewStory,
      loadKey,
      replaySession,
      saveProgress,
    ],
  );
  runtimeLoadResultHandler.current = handleRuntimeLoaded;

  useEffect(() => {
    if (
      !isSimulationMode ||
      !startInteractionId ||
      loadedKey !== loadKey ||
      session.currentInteractionId !== startInteractionId ||
      directStartAutosavedKey.current === loadKey
    ) {
      return;
    }
    directStartAutosavedKey.current = loadKey;
    saveProgress(session);
  }, [isSimulationMode, loadKey, loadedKey, saveProgress, session, startInteractionId]);

  const applyReloadedSimulationStory = useCallback(
    (nextStory: Story) => {
      const positioned = ensureStoryInteractionPositions(nextStory);
      setTimerNow(Date.now());
      if (positioned.capabilities?.canEdit !== true) {
        setStory(undefined);
        retryStoryLoad();
        return;
      }
      const currentSession = sessionRef.current;
      replaySession(
        positioned,
        currentSession.journeyInteractionIds,
        currentSession.ownedItemIds,
        currentSession.randomSeed,
        currentSession.stepStartedAt,
      );
      setStory(positioned);
      markRuntimeSliceLoaded(
        positioned,
        currentSession.currentInteractionId,
        currentSession.journeyInteractionIds,
      );
      setEditingChoiceId((choiceId) =>
        choiceId && positioned.interactions.some(({ id }) => id === choiceId)
          ? choiceId
          : undefined,
      );
      setPlayableCharacterId((characterId) =>
        characterId && positioned.characters?.some(({ id }) => id === characterId)
          ? characterId
          : undefined,
      );
    },
    [markRuntimeSliceLoaded, replaySession, retryStoryLoad],
  );

  const handleRealtimeRefreshFailure = useCallback(
    (caught: unknown, invalidation: StoryRealtimeInvalidation) => {
      if (invalidation === 'deleted') {
        setStory(undefined);
        markStoryInaccessible();
        return;
      }
      if (recoverFromStoryAccessError(caught)) setStory(undefined);
    },
    [markStoryInaccessible, recoverFromStoryAccessError],
  );
  const { refreshFromRealtime, beginSimulationEdit, endSimulationEdit } =
    useStoryPlayerRealtimeRefresh({
      storyId,
      getCurrentSession: getCurrentReaderSession,
      getNavigationVersion,
      hasActiveMutations: hasActiveSimulationMutations,
      mutationStatus: simulationMutations.status,
      applyReloadedStory: applyReloadedSimulationStory,
      onRefreshFailure: handleRealtimeRefreshFailure,
    });

  const storyRealtimeStatus = useStoryRealtime(
    storyId,
    isSimulationMode,
    refreshFromRealtime,
    story?.revision,
  );

  const current = useMemo(
    () => story?.interactions.find((item) => item.id === currentId),
    [currentId, story],
  );
  const canUseReaderComments =
    authenticated && !isSimulationMode && story?.capabilities?.canComment === true;
  const comments = useStoryComments(storyId, canUseReaderComments);
  const cancelCommentDraft = comments.cancelDraft;
  const selectCommentThread = comments.selectThread;
  const readerCommentThreads = useMemo(
    () =>
      story && current
        ? comments.threads
            .filter(
              ({ anchor }) =>
                anchor.kind !== 'canvas' &&
                anchor.targetType === 'interaction' &&
                anchor.targetId === current.id,
            )
            .map((thread) => ({
              ...thread,
              detached: isCommentAnchorDetached(story, thread.anchor),
            }))
        : [],
    [comments.threads, current, story],
  );
  const selectedReaderCommentThread = readerCommentThreads.find(
    ({ id }) => id === comments.selectedThreadId,
  );
  const canManageSelectedReaderThread = Boolean(
    selectedReaderCommentThread &&
    canManageCommentThread(story?.capabilities, currentUserId, selectedReaderCommentThread),
  );
  const canDeleteSelectedReaderThread = Boolean(
    selectedReaderCommentThread &&
    canDeleteCommentThread(story?.capabilities, currentUserId, selectedReaderCommentThread),
  );
  const ownedItemDefinitionIds = useMemo(
    () =>
      story && runtimeSliceMatchesRequest
        ? ownedItemIds.flatMap((itemId) => {
            const definitionId = getItemDefinitionIdForInstance(story, itemId);
            return definitionId ? [definitionId] : [];
          })
        : [],
    [ownedItemIds, runtimeSliceMatchesRequest, story],
  );
  const playableCharacters = useMemo(
    () => (story?.characters ?? []).filter(({ isPlayable }) => isPlayable),
    [story],
  );
  const playedCharacter = playableCharacters.find(({ id }) => id === playableCharacterId);
  const currentLocation = story?.locations?.find(
    ({ id }) => id === (current?.locationId ?? currentLocationId),
  );
  const presentCharacters = useMemo(
    () =>
      (current?.characterIds ?? []).flatMap((characterId) => {
        const character = story?.characters?.find(({ id }) => id === characterId);
        return character ? [character] : [];
      }),
    [current?.characterIds, story?.characters],
  );
  const currentStepStartedAt = stepStartedAt[journey.length];
  const triggerEvaluationContext = useMemo(() => {
    const startedAt = currentStepStartedAt ? Date.parse(currentStepStartedAt) : timerNow;
    return {
      randomSeed,
      step: journey.length,
      elapsedTimeMs: Math.max(0, timerNow - (Number.isNaN(startedAt) ? timerNow : startedAt)),
    };
  }, [currentStepStartedAt, journey.length, randomSeed, timerNow]);

  const choices = useMemo(
    () =>
      story && runtimeSliceReady
        ? getAvailableInteractions(
            story,
            current?.id ?? null,
            visited,
            currentLocationId,
            current?.characterIds ?? [],
            statValues,
            currentDateTime,
            ownedItemDefinitionIds,
            itemStatValues,
            triggerEvaluationContext,
          )
        : [],
    [
      story,
      current,
      visited,
      currentLocationId,
      statValues,
      currentDateTime,
      ownedItemDefinitionIds,
      itemStatValues,
      triggerEvaluationContext,
      runtimeSliceReady,
    ],
  );
  const availableChoiceIds = useMemo(() => new Set(choices.map((choice) => choice.id)), [choices]);
  const visibleChoices = useMemo(
    () =>
      isSimulationMode && story && runtimeSliceReady
        ? getInputReachableInteractions(story, current?.id ?? null).flatMap((interaction) => {
            const available = availableChoiceIds.has(interaction.id);
            const failures = available
              ? []
              : getTriggerConditionFailures(
                  interaction,
                  current?.id ?? null,
                  visited,
                  currentLocationId,
                  current?.characterIds ?? [],
                  statValues,
                  currentDateTime,
                  ownedItemDefinitionIds,
                  itemStatValues,
                );
            if (failures.some(({ condition }) => 'locationId' in condition)) return [];
            const timerState = getInteractionTimerState(
              interaction,
              current?.id ?? null,
              visited,
              triggerEvaluationContext,
              currentLocationId,
              current?.characterIds ?? [],
              statValues,
              currentDateTime,
              ownedItemDefinitionIds,
              itemStatValues,
            );
            return [
              {
                interaction,
                available,
                timerState,
                unavailableReason: available
                  ? undefined
                  : getUnavailableReason(
                      story,
                      interaction,
                      current?.id ?? null,
                      visited,
                      currentLocationId,
                      current?.characterIds ?? [],
                      statValues,
                      currentDateTime,
                      ownedItemDefinitionIds,
                      itemStatValues,
                      t,
                      triggerEvaluationContext,
                    ),
              },
            ];
          })
        : choices.map((interaction) => ({
            interaction,
            available: true,
            timerState: getInteractionTimerState(
              interaction,
              current?.id ?? null,
              visited,
              triggerEvaluationContext,
              currentLocationId,
              current?.characterIds ?? [],
              statValues,
              currentDateTime,
              ownedItemDefinitionIds,
              itemStatValues,
            ),
            unavailableReason: undefined,
          })),
    [
      availableChoiceIds,
      choices,
      current,
      currentLocationId,
      currentDateTime,
      isSimulationMode,
      statValues,
      story,
      visited,
      ownedItemDefinitionIds,
      itemStatValues,
      triggerEvaluationContext,
      t,
      runtimeSliceReady,
    ],
  );
  useEffect(() => {
    const nextExpiration = visibleChoices.reduce<number | undefined>((next, { timerState }) => {
      if (!timerState || timerState.expired || timerState.remainingTimeMs <= 0) return next;
      return next === undefined
        ? timerState.remainingTimeMs
        : Math.min(next, timerState.remainingTimeMs);
    }, undefined);
    if (nextExpiration === undefined) return;
    const timeout = window.setTimeout(
      () => setTimerNow(Date.now()),
      Math.max(1, Math.ceil(nextExpiration) + 20),
    );
    return () => window.clearTimeout(timeout);
  }, [visibleChoices]);
  useEffect(() => {
    const synchronizeTimer = () => setTimerNow(Date.now());
    window.addEventListener('focus', synchronizeTimer);
    document.addEventListener('visibilitychange', synchronizeTimer);
    return () => {
      window.removeEventListener('focus', synchronizeTimer);
      document.removeEventListener('visibilitychange', synchronizeTimer);
    };
  }, []);
  const conditionalTextState = useMemo(() => {
    if (!story || !current) return {};
    return Object.fromEntries(
      story.interactions.map((interaction) => {
        const connected = interaction.triggers.some((trigger) =>
          trigger.inputInteractionIds.includes(current.id),
        );
        const available = connected && availableChoiceIds.has(interaction.id);
        const reason = !connected
          ? t('player.disconnectedTarget')
          : available
            ? getConditionSummary(story, interaction, current.id, t)
            : getUnavailableReason(
                story,
                interaction,
                current.id,
                visited,
                currentLocationId,
                current.characterIds ?? [],
                statValues,
                currentDateTime,
                ownedItemDefinitionIds,
                itemStatValues,
                t,
                triggerEvaluationContext,
              );
        return [
          interaction.id,
          {
            visible: isSimulationMode || available,
            available,
            reason,
          },
        ];
      }),
    );
  }, [
    availableChoiceIds,
    current,
    currentDateTime,
    currentLocationId,
    isSimulationMode,
    ownedItemDefinitionIds,
    itemStatValues,
    statValues,
    story,
    t,
    triggerEvaluationContext,
    visited,
  ]);
  const conditionalTextBlockState = useMemo(() => {
    if (!story || !current) return {};
    const visitedIds = new Set(visited);
    return Object.fromEntries(
      (current.conditionalTextBlocks ?? []).map((block) => {
        const available = doConditionsMatch(
          block.conditions,
          visitedIds,
          currentLocationId,
          current.characterIds ?? [],
          statValues,
          currentDateTime,
          ownedItemDefinitionIds,
          itemStatValues,
        );
        return [
          block.id,
          {
            visible: isSimulationMode || available,
            available,
            reason: block.conditions
              .map((condition) => describeTriggerCondition(story, condition, t))
              .join(` ${t('player.condition.and')} `),
          },
        ];
      }),
    );
  }, [
    current,
    currentDateTime,
    currentLocationId,
    isSimulationMode,
    itemStatValues,
    ownedItemDefinitionIds,
    statValues,
    story,
    t,
    visited,
  ]);
  const interactionLinkTargets = useMemo(
    () =>
      !story || !current
        ? []
        : story.interactions.filter((interaction) => interaction.id !== current.id),
    [current, story],
  );

  useEffect(() => {
    editingChoiceInputRef.current?.focus();
    editingChoiceInputRef.current?.select();
  }, [editingChoiceId]);

  const choose = useReaderChoiceNavigation({
    story,
    current,
    visited,
    currentLocationId,
    currentDateTime,
    statValues,
    ownedItemDefinitionIds,
    itemStatValues,
    randomSeed,
    journeyLength: journey.length,
    currentStepStartedAt,
    isSimulationMode,
    forceUnavailableOptions,
    resetAutomaticTransitions,
    commitChoiceStep,
    cancelCommentDraft,
    selectCommentThread,
    setTimerNow,
    advanceSession,
    saveProgress,
  });

  useAutomaticReaderTransitions({
    isSimulationMode,
    loadedKey,
    loadKey,
    runtimeSliceReady,
    journeyLength: journey.length,
    playableCharacterCount: playableCharacters.length,
    playedCharacterId: playedCharacter?.id,
    choices,
    choose,
    current,
    currentStepStartedAt,
    story,
    conditionalTextState,
    conditionalTextBlockState,
    statValues,
    itemStatValues,
    isAutomaticStepBlocked,
    clearAutomaticPath,
    continueAutomaticPath,
  });

  const {
    saveCurrentInteraction,
    patchInteraction,
    patchCurrentInteraction,
    addOption,
    saveChoiceTitle,
    reloadAfterSimulationMutationFailure,
  } = useSimulationAuthoringCommands({
    storyId,
    story,
    current,
    setStory,
    setEditingChoiceId,
    runMutation: simulationMutations.run,
    getCurrentSession: getCurrentReaderSession,
    applyReloadedStory: applyReloadedSimulationStory,
  });

  function restart() {
    comments.cancelDraft();
    comments.selectThread(undefined);
    directStartAutosavedKey.current = '';
    clearChoiceCommit();
    resetAutomaticTransitions();
    incrementNavigationVersion();
    setTimerNow(Date.now());
    if (story) {
      replaySession(
        story,
        startInteractionId ? [startInteractionId] : [],
        [],
        createReaderRandomSeed(),
      );
    }
    setPlayableCharacterId(undefined);
    setForceUnavailableOptions(false);
    resetProgress();
  }

  function stepBack() {
    if (journey.length <= 1) return;
    clearChoiceCommit();
    incrementNavigationVersion();
    const nextJourney = journey.slice(0, -1);
    setTimerNow(Date.now());
    if (story) {
      saveProgress(
        replaySession(
          story,
          nextJourney,
          [],
          randomSeed,
          stepStartedAt.slice(0, nextJourney.length + 1),
        ),
      );
    }
  }

  async function loadSave(save: ReaderSave) {
    if (!story) return;
    resetForNewStory();
    incrementNavigationVersion();
    setTimerNow(Date.now());
    const { story: loadedStory, session: nextSession } = await restoreReaderSave({
      story,
      save,
      randomSeed: save.state.randomSeed ?? createReaderRandomSeed(),
      replaySession,
    });
    setStory(loadedStory);
    markRuntimeSliceLoaded(
      loadedStory,
      nextSession.currentInteractionId,
      nextSession.journeyInteractionIds,
      { clearFailure: false },
    );
    setPlayableCharacterId(
      nextSession.journeyInteractionIds.length > 0
        ? loadedStory.characters?.find(({ isPlayable }) => isPlayable)?.id
        : undefined,
    );
    saveProgress(nextSession);
  }

  function startReaderComment() {
    if (!canUseReaderComments || !current) return;
    comments.selectThread(undefined);
    comments.startThread({ kind: 'entity', targetType: 'interaction', targetId: current.id });
    setCommentsOpen(true);
  }

  async function deleteReaderComment(threadId: string) {
    if (!window.confirm(t('comments.confirmDelete'))) return;
    return comments.deleteThread(threadId);
  }

  if (storyRouteInaccessible) return <Navigate to="/" replace />;

  if (!story || loadedKey !== loadKey) {
    const activeLoadError = loadError?.key === loadKey ? loadError.message : '';
    return (
      <main className="page">
        {activeLoadError ? (
          <>
            <p className="error" role="alert">
              {activeLoadError}
            </p>
            <button
              onClick={() => {
                clearStoryLoadError();
                retryStoryLoad();
              }}
            >
              {t('player.retry')}
            </button>
          </>
        ) : (
          <p>{t('player.loading')}</p>
        )}
      </main>
    );
  }

  return (
    <main
      className={`player-page ${isSimulationMode ? 'simulation-mode' : 'reader-mode'}`}
      onFocusCapture={(event) => {
        if (isSimulationMode && isRealtimeEditableTarget(event.target)) beginSimulationEdit();
      }}
      onBlurCapture={(event) => {
        if (isSimulationMode && isRealtimeEditableTarget(event.target)) endSimulationEdit();
      }}
    >
      {pendingSaveGuard}
      <PlayerToolbar
        storyId={story.id}
        storyTitle={story.title}
        canEditStory={story.capabilities?.canEdit === true}
        isSimulationMode={isSimulationMode}
        storyRealtimeStatus={storyRealtimeStatus}
        simulationMutations={simulationMutations}
        onReloadAfterSimulationFailure={reloadAfterSimulationMutationFailure}
        authenticated={authenticated}
        progressStatus={progressStatus}
        savesDialogTrigger={savesDialogTrigger}
        onOpenSaves={() => setSavesOpen(true)}
        canStepBack={journey.length > 1}
        onStepBack={stepBack}
        onRestart={restart}
        canUseReaderComments={canUseReaderComments}
        commentsOpen={commentsOpen}
        openCommentCount={
          readerCommentThreads.filter(({ status, deletedAt }) => status === 'open' && !deletedAt)
            .length
        }
        onToggleComments={() => setCommentsOpen((open) => !open)}
      />
      <article className="player-card">
        <PlayerScene
          location={currentLocation}
          characters={presentCharacters}
          currentDateTime={currentDateTime}
        />
        <div className="player-story-content">
          {playableCharacters.length > 0 && !playedCharacter ? (
            <section className="character-selection" aria-label={t('player.chooseCharacter')}>
              <span className="product-eyebrow">{t('player.beforeStory')}</span>
              <h1>{t('player.chooseCharacter')}</h1>
              <p>{t('player.chooseCharacterDescription')}</p>
              <div>
                {playableCharacters.map((character) => (
                  <button
                    className="character-choice-card"
                    key={character.id}
                    type="button"
                    onClick={() => setPlayableCharacterId(character.id)}
                  >
                    {character.imageUrl ? (
                      <img src={character.imageUrl} alt="" />
                    ) : (
                      <span aria-hidden="true">{character.name.slice(0, 2).toUpperCase()}</span>
                    )}
                    <strong>{character.name}</strong>
                    {character.description ? <small>{character.description}</small> : null}
                    <i aria-hidden="true">→</i>
                  </button>
                ))}
              </div>
            </section>
          ) : current ? (
            <>
              {isSimulationMode ? (
                <>
                  <div className="simulation-edit-label">
                    <span className="product-badge accent">{t('player.liveEditing')}</span>
                    <small>{t('player.liveEditingHelp')}</small>
                  </div>
                  <input
                    className="simulation-title-input"
                    aria-label={t('player.currentInteractionTitle')}
                    value={current.title}
                    onChange={(event) => patchCurrentInteraction({ title: event.target.value })}
                    onBlur={(event) => void saveCurrentInteraction({ title: event.target.value })}
                  />
                  <RichTextEditor
                    ariaLabel={t('player.currentInteractionContent')}
                    interactionId={current.id}
                    story={story}
                    value={current.body}
                    onChange={(body) => patchCurrentInteraction({ body })}
                    onBlur={(body) => void saveCurrentInteraction({ body })}
                    interactionLinkTargets={interactionLinkTargets}
                    conditionalTextBlocks={current.conditionalTextBlocks}
                    onConditionalTextChange={(body, conditionalTextBlocks) => {
                      patchCurrentInteraction({ body, conditionalTextBlocks });
                      void saveCurrentInteraction({ body, conditionalTextBlocks });
                    }}
                    conditionalTextState={conditionalTextState}
                    conditionalTextBlockState={conditionalTextBlockState}
                    onConditionalTargetClick={(interactionId) => {
                      const target = story.interactions.find(({ id }) => id === interactionId);
                      if (
                        target &&
                        (availableChoiceIds.has(interactionId) || forceUnavailableOptions)
                      ) {
                        choose(target);
                      }
                    }}
                  />
                </>
              ) : (
                <>
                  <h1>{current.title}</h1>
                  <RichTextContent
                    className="story-body"
                    html={current.body}
                    conditionalTextState={conditionalTextState}
                    conditionalTextBlockState={conditionalTextBlockState}
                    statValues={statValues}
                    itemStatValues={itemStatValues}
                    onInteractionLinkClick={(interactionId) => {
                      const target = story.interactions.find(({ id }) => id === interactionId);
                      if (target && availableChoiceIds.has(interactionId)) choose(target);
                    }}
                  />
                  {canUseReaderComments ? (
                    <div className="reader-comment-actions">
                      <button type="button" onClick={startReaderComment}>
                        {t('comments.commentScene')}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <>
              <span className="product-eyebrow">{t('player.ready')}</span>
              <h1>{t('player.startStory')}</h1>
              <p>{t('player.chooseStartingInteraction')}</p>
            </>
          )}
          {runtimeOptionsError ? (
            <p className="error" role="alert">
              {runtimeOptionsError}
            </p>
          ) : null}
          {!runtimeSliceReady && !runtimeOptionsError ? (
            <p className="hint" role="status">
              {t('player.loadingOptions')}
            </p>
          ) : null}
          {playableCharacters.length === 0 || playedCharacter ? (
            <PlayerChoices
              choices={visibleChoices}
              editingChoiceId={editingChoiceId}
              editingChoiceInputRef={editingChoiceInputRef}
              isSimulationMode={isSimulationMode}
              forceUnavailableOptions={forceUnavailableOptions}
              journeyLength={journey.length}
              currentStepStartedAt={currentStepStartedAt}
              story={story}
              currentInteractionId={current?.id}
              showEnding={
                runtimeSliceReady && choices.length === 0 && Boolean(current) && !isSimulationMode
              }
              onChoose={choose}
              onPatchInteraction={patchInteraction}
              onSaveChoiceTitle={saveChoiceTitle}
              onAddOption={addOption}
            />
          ) : null}
        </div>
      </article>
      <PlayerContextPanels
        story={story}
        current={current}
        playedCharacter={playedCharacter}
        playableCharacterCount={playableCharacters.length}
        statValues={statValues}
        ownedItemIds={ownedItemIds}
        itemStatValues={itemStatValues}
        isSimulationMode={isSimulationMode}
        forceUnavailableOptions={forceUnavailableOptions}
        onForceUnavailableOptionsChange={setForceUnavailableOptions}
      />
      {isSimulationMode ? (
        <>
          <details className="debug player-history">
            <summary>
              {t(isSimulationMode ? 'player.simulationHistory' : 'player.readingHistory')}
            </summary>
            <ol>
              {visited.map((id) => (
                <li key={id}>{story.interactions.find((item) => item.id === id)?.title ?? id}</li>
              ))}
            </ol>
          </details>
        </>
      ) : null}
      <StoryCommentsPanel
        open={commentsOpen && canUseReaderComments}
        loading={comments.loading}
        error={comments.error}
        threads={readerCommentThreads}
        selectedThread={selectedReaderCommentThread}
        draftAnchor={comments.draftAnchor}
        canComment={canUseReaderComments}
        canManageThread={canManageSelectedReaderThread}
        canDeleteThread={canDeleteSelectedReaderThread}
        deletedLoading={comments.deletedLoading}
        realtimeStatus={comments.realtimeStatus}
        onClose={() => setCommentsOpen(false)}
        onSelect={comments.selectThread}
        onCancelDraft={comments.cancelDraft}
        onCreate={comments.create}
        onReply={comments.reply}
        onStatus={comments.setStatus}
        onDelete={deleteReaderComment}
        onRestore={comments.restoreThread}
        onLoadDeleted={comments.loadDeleted}
      />
      {savesOpen ? (
        <ReaderSaveDialog
          story={story}
          session={session}
          onClose={closeSavesDialog}
          onLoad={loadSave}
        />
      ) : null}
    </main>
  );
}
