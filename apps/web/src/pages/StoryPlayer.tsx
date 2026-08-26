import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Interaction, InteractionMutationResult, Story } from '@paralleax/shared';
import {
  canManageCommentThread,
  ensureStoryInteractionPositions,
  getAvailableInteractions,
  getInputReachableInteractions,
  getItemDefinitionIdForInstance,
  getItemOwnerIdForInstance,
  getTriggerConditionFailures,
  isCommentAnchorDetached,
} from '@paralleax/shared';
import { api } from '../api';
import { RichTextContent } from '../components/RichTextContent';
import { RichTextEditor } from '../components/RichTextEditor';
import { StoryCommentsPanel } from '../features/comments/StoryCommentsPanel';
import { useStoryComments } from '../features/comments/useStoryComments';
import { useReaderProgressPersistence } from '../features/story-player/useReaderProgressPersistence';
import { useReaderSessionState } from '../features/story-player/useReaderSessionState';
import {
  getConditionSummary,
  getUnavailableReason,
} from '../features/story-player/storyPlayerPresentation';
import {
  isApiNotFound,
  isRealtimeEditableTarget,
  prioritizeStoryRealtimeInvalidation,
  type StoryRealtimeInvalidation,
} from '../features/realtime/storyRealtime';
import {
  applyInteractionMutationResult,
  findSavedInteraction,
} from '../features/story/storyMutationResults';
import { useStoryRealtime } from '../hooks/useStoryRealtime';
import { getStoryGraphClickCreationPosition } from '../storyGraphCreationLayout';

export function StoryPlayer({
  authenticated = true,
  currentUserId,
}: {
  authenticated?: boolean;
  currentUserId?: string;
}) {
  const { t } = useTranslation();
  const { storyId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const simulationRequested = authenticated && searchParams.get('mode') === 'simulation';
  const requestedStartInteractionId = simulationRequested
    ? searchParams.get('startInteractionId')
    : null;
  const [story, setStory] = useState<Story>();
  const isSimulationMode = simulationRequested && story?.capabilities?.canEdit === true;
  const startInteractionId = isSimulationMode ? requestedStartInteractionId : null;
  const loadKey = `${storyId}:${simulationRequested ? 'simulation-request' : 'reader'}:${requestedStartInteractionId ?? ''}`;
  const [loadedKey, setLoadedKey] = useState('');
  const [loadError, setLoadError] = useState<{ key: string; message: string }>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { session, replay: replaySession, advance: advanceSession } = useReaderSessionState();
  const {
    journeyInteractionIds: journey,
    currentInteractionId: currentId,
    visitedInteractionIds: visited,
    currentDateTime,
    currentLocationId,
    statValues,
    ownedItemIds,
    itemStatValues = {},
  } = session;
  const [playableCharacterId, setPlayableCharacterId] = useState<string>();
  const {
    status: progressStatus,
    markLoaded: markProgressLoaded,
    save: saveProgress,
    reset: resetProgress,
  } = useReaderProgressPersistence({ authenticated, storyId });
  const [forceUnavailableOptions, setForceUnavailableOptions] = useState(false);
  const [editingChoiceId, setEditingChoiceId] = useState<string>();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const editingChoiceInputRef = useRef<HTMLInputElement>(null);
  const journeyRef = useRef<string[]>([]);
  const realtimeLoadAttempt = useRef(0);
  const simulationMutationCount = useRef(0);
  const simulationEditDepth = useRef(0);
  const pendingRealtimeInvalidation = useRef<StoryRealtimeInvalidation | undefined>(undefined);
  const realtimeRefresh = useRef<(invalidation: StoryRealtimeInvalidation) => void>(() => {});

  useEffect(() => {
    journeyRef.current = journey;
  }, [journey]);

  useEffect(() => {
    let cancelled = false;
    void api
      .getStory(storyId)
      .then(async (nextStory) => {
        const positioned = ensureStoryInteractionPositions(nextStory);
        const authorizedSimulation =
          simulationRequested && positioned.capabilities?.canEdit === true;
        const effectiveStartInteractionId = authorizedSimulation
          ? requestedStartInteractionId
          : null;
        const progress =
          !authenticated || authorizedSimulation ? null : await api.getReaderProgress(storyId);
        return { positioned, progress, effectiveStartInteractionId };
      })
      .then(({ positioned, progress, effectiveStartInteractionId }) => {
        if (cancelled) return;
        const reconciledProgress = progress
          ? replaySession(
              positioned,
              progress.state.journeyInteractionIds,
              progress.state.ownedItemIds,
            )
          : undefined;
        const nextJourney =
          reconciledProgress?.journeyInteractionIds ??
          (effectiveStartInteractionId ? [effectiveStartInteractionId] : []);
        setStory(positioned);
        setLoadedKey(loadKey);
        if (!reconciledProgress) replaySession(positioned, nextJourney);
        if (nextJourney.length > 0) {
          setPlayableCharacterId(positioned.characters?.find(({ isPlayable }) => isPlayable)?.id);
        }
        markProgressLoaded(Boolean(progress));
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setLoadError({
          key: loadKey,
          message: caught instanceof Error ? caught.message : t('player.loadFailed'),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    authenticated,
    loadAttempt,
    loadKey,
    markProgressLoaded,
    requestedStartInteractionId,
    replaySession,
    simulationRequested,
    storyId,
    t,
  ]);

  const flushPendingRealtimeRefresh = useCallback(() => {
    if (simulationMutationCount.current > 0 || simulationEditDepth.current > 0) return;
    const pending = pendingRealtimeInvalidation.current;
    if (!pending) return;
    pendingRealtimeInvalidation.current = undefined;
    realtimeRefresh.current(pending);
  }, []);

  const refreshFromRealtime = useCallback(
    (invalidation: StoryRealtimeInvalidation) => {
      if (simulationMutationCount.current > 0 || simulationEditDepth.current > 0) {
        pendingRealtimeInvalidation.current = prioritizeStoryRealtimeInvalidation(
          pendingRealtimeInvalidation.current,
          invalidation,
        );
        return;
      }

      const attempt = ++realtimeLoadAttempt.current;
      void api
        .getStory(storyId)
        .then((nextStory) => {
          if (attempt !== realtimeLoadAttempt.current) return;
          if (simulationMutationCount.current > 0 || simulationEditDepth.current > 0) {
            pendingRealtimeInvalidation.current = prioritizeStoryRealtimeInvalidation(
              pendingRealtimeInvalidation.current,
              invalidation,
            );
            return;
          }

          const positioned = ensureStoryInteractionPositions(nextStory);
          if (positioned.capabilities?.canEdit !== true) {
            setStory(undefined);
            setLoadAttempt((currentAttempt) => currentAttempt + 1);
            return;
          }
          replaySession(positioned, journeyRef.current);
          setStory(positioned);
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
        })
        .catch((caught: unknown) => {
          if (attempt !== realtimeLoadAttempt.current) return;
          if (invalidation === 'deleted' || isApiNotFound(caught)) {
            setStory(undefined);
            setLoadError({
              key: loadKey,
              message: caught instanceof Error ? caught.message : t('player.loadFailed'),
            });
          }
        });
    },
    [loadKey, replaySession, storyId, t],
  );

  useEffect(() => {
    realtimeRefresh.current = refreshFromRealtime;
  }, [refreshFromRealtime]);

  const storyRealtimeStatus = useStoryRealtime(storyId, isSimulationMode, refreshFromRealtime);

  const beginSimulationEdit = useCallback(() => {
    simulationEditDepth.current += 1;
  }, []);

  const endSimulationEdit = useCallback(() => {
    simulationEditDepth.current = Math.max(0, simulationEditDepth.current - 1);
    setTimeout(flushPendingRealtimeRefresh, 0);
  }, [flushPendingRealtimeRefresh]);

  async function trackSimulationMutation<T>(operation: () => Promise<T>): Promise<T> {
    simulationMutationCount.current += 1;
    try {
      return await operation();
    } finally {
      simulationMutationCount.current = Math.max(0, simulationMutationCount.current - 1);
      flushPendingRealtimeRefresh();
    }
  }

  const current = useMemo(
    () => story?.interactions.find((item) => item.id === currentId),
    [currentId, story],
  );
  const canUseReaderComments =
    authenticated && !isSimulationMode && story?.capabilities?.canComment === true;
  const comments = useStoryComments(storyId, canUseReaderComments);
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
  const ownedItemDefinitionIds = useMemo(
    () =>
      story
        ? ownedItemIds.flatMap((itemId) => {
            const definitionId = getItemDefinitionIdForInstance(story, itemId);
            return definitionId ? [definitionId] : [];
          })
        : [],
    [ownedItemIds, story],
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

  const choices = useMemo(
    () =>
      story
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
    ],
  );
  const availableChoiceIds = useMemo(() => new Set(choices.map((choice) => choice.id)), [choices]);
  const visibleChoices = useMemo(
    () =>
      isSimulationMode && story
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
            return [
              {
                interaction,
                available,
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
                    ),
              },
            ];
          })
        : choices.map((interaction) => ({
            interaction,
            available: true,
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
      t,
    ],
  );
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
    visited,
  ]);
  const outgoingInteractions = useMemo(
    () =>
      !story || !current
        ? []
        : story.interactions.filter((interaction) =>
            interaction.triggers.some((trigger) =>
              trigger.inputInteractionIds.includes(current.id),
            ),
          ),
    [current, story],
  );

  useEffect(() => {
    editingChoiceInputRef.current?.focus();
    editingChoiceInputRef.current?.select();
  }, [editingChoiceId]);

  function choose(interaction: Interaction) {
    if (!story) return;
    comments.cancelDraft();
    comments.selectThread(undefined);
    const nextSession = advanceSession(story, interaction);
    if (!isSimulationMode) saveProgress(nextSession);
  }

  function restart() {
    comments.cancelDraft();
    comments.selectThread(undefined);
    if (story) replaySession(story, startInteractionId ? [startInteractionId] : []);
    setPlayableCharacterId(undefined);
    setForceUnavailableOptions(false);
    if (!isSimulationMode) resetProgress();
  }

  function stepBack() {
    if (journey.length <= 1) return;
    const nextJourney = journey.slice(0, -1);
    if (story) replaySession(story, nextJourney);
  }

  async function saveCurrentInteraction(patch: Partial<Pick<Interaction, 'title' | 'body'>>) {
    if (!current) return;
    const result = await trackSimulationMutation(() =>
      api.updateInteraction(storyId, current.id, patch),
    );
    setStory((currentStory) =>
      currentStory ? applyInteractionResponse(currentStory, result) : currentStory,
    );
  }

  function patchInteraction(
    interactionId: string,
    patch: Partial<Pick<Interaction, 'title' | 'body'>>,
  ) {
    if (!story) return;
    setStory({
      ...story,
      interactions: story.interactions.map((interaction) =>
        interaction.id === interactionId ? { ...interaction, ...patch } : interaction,
      ),
    });
  }

  function patchCurrentInteraction(patch: Partial<Pick<Interaction, 'title' | 'body'>>) {
    if (!current) return;
    patchInteraction(current.id, patch);
  }

  async function addOption() {
    if (!story) return;
    const result = await trackSimulationMutation(() =>
      api.createInteraction(
        storyId,
        current
          ? {
              parentId: current.id,
              position: getStoryGraphClickCreationPosition(story, {
                kind: 'child',
                sourceId: current.id,
              }),
            }
          : {
              position: getStoryGraphClickCreationPosition(story, { kind: 'root' }),
            },
      ),
    );
    const created = findSavedInteraction(result, story);
    setStory((currentStory) =>
      currentStory ? applyInteractionResponse(currentStory, result) : currentStory,
    );
    setEditingChoiceId(created?.id);
  }

  function startReaderComment() {
    if (!canUseReaderComments || !current) return;
    comments.selectThread(undefined);
    comments.startThread({ kind: 'entity', targetType: 'interaction', targetId: current.id });
    setCommentsOpen(true);
  }

  async function saveChoiceTitle(interaction: Interaction, title: string) {
    setEditingChoiceId(undefined);
    const result = await trackSimulationMutation(() =>
      api.updateInteraction(storyId, interaction.id, { title }),
    );
    setStory((currentStory) =>
      currentStory ? applyInteractionResponse(currentStory, result) : currentStory,
    );
  }

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
                setLoadError(undefined);
                setLoadAttempt((attempt) => attempt + 1);
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
      <div className="player-top">
        <div className="player-context">
          <span className="player-mark" aria-hidden="true">
            P
          </span>
          <span>
            <small>{t(isSimulationMode ? 'player.preview' : 'player.reader')}</small>
            <b>{story.title}</b>
          </span>
        </div>
        {isSimulationMode ? <span className="mode-pill">{t('player.simulation')}</span> : null}
        {isSimulationMode ? (
          <span
            className={`story-realtime-status ${storyRealtimeStatus}`}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" />
            {t(`player.realtime.${storyRealtimeStatus}`)}
          </span>
        ) : null}
        {!isSimulationMode && authenticated ? (
          <span className={`save-status ${progressStatus}`} role="status" aria-live="polite">
            {progressStatus === 'saving'
              ? t('player.savingProgress')
              : progressStatus === 'saved'
                ? t('player.progressSaved')
                : progressStatus === 'error'
                  ? t('player.progressSaveFailed')
                  : ''}
          </span>
        ) : !isSimulationMode ? (
          <span className="save-status">{t('player.signInToSave')}</span>
        ) : null}
        {isSimulationMode ? (
          <button
            className="player-toolbar-button"
            disabled={journey.length <= 1}
            onClick={stepBack}
          >
            <span aria-hidden="true">←</span> {t('player.back')}
          </button>
        ) : null}
        <button className="player-toolbar-button" onClick={restart}>
          <span aria-hidden="true">↻</span> {t('player.restart')}
        </button>
        {canUseReaderComments ? (
          <button
            className={`player-toolbar-button comments-toolbar-button ${commentsOpen ? 'active' : ''}`}
            type="button"
            onClick={() => setCommentsOpen((open) => !open)}
          >
            {t('comments.title')}
            {readerCommentThreads.filter(({ status }) => status === 'open').length ? (
              <small>{readerCommentThreads.filter(({ status }) => status === 'open').length}</small>
            ) : null}
          </button>
        ) : null}
        {story.capabilities?.canEdit ? (
          <Link className="player-exit" to={`/stories/${story.id}/edit`}>
            {t(isSimulationMode ? 'player.exitSimulation' : 'player.backToEditor')}
          </Link>
        ) : null}
      </div>
      <article className="player-card">
        <div className={`player-scene-visual ${currentLocation?.imageUrl ? 'with-image' : ''}`}>
          {currentLocation?.imageUrl ? (
            <img src={currentLocation.imageUrl} alt={currentLocation.name} />
          ) : (
            <div className="player-scene-placeholder" aria-hidden="true">
              <span />
              <span />
              <i />
            </div>
          )}
          <div className="player-scene-meta">
            <span>
              <small>{t('player.location')}</small>
              <b>{currentLocation?.name ?? t('player.unknownLocation')}</b>
            </span>
            <time dateTime={currentDateTime}>{currentDateTime.replace('T', ' ')}</time>
            {presentCharacters.length > 0 ? (
              <span className="scene-character-list" aria-label={t('player.charactersPresent')}>
                {presentCharacters.map((character) =>
                  character.imageUrl ? (
                    <img key={character.id} src={character.imageUrl} alt={character.name} />
                  ) : (
                    <i key={character.id} title={character.name}>
                      {character.name.slice(0, 2).toUpperCase()}
                    </i>
                  ),
                )}
              </span>
            ) : null}
          </div>
        </div>
        <div className="player-story-content">
          <p className="eyebrow">{story.title}</p>
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
                    value={current.body}
                    onChange={(body) => patchCurrentInteraction({ body })}
                    onBlur={(body) => void saveCurrentInteraction({ body })}
                    conditionalTargets={outgoingInteractions}
                    conditionalTextState={conditionalTextState}
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
                    statValues={statValues}
                    itemStatValues={itemStatValues}
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
          {playableCharacters.length === 0 || playedCharacter ? (
            <div className="choices">
              {visibleChoices.map(({ interaction, available, unavailableReason }) => (
                <div className="choice-row" key={interaction.id}>
                  {editingChoiceId === interaction.id ? (
                    <input
                      ref={editingChoiceInputRef}
                      className="choice-title-input"
                      aria-label={t('player.newOptionTitle')}
                      value={interaction.title}
                      onChange={(event) =>
                        patchInteraction(interaction.id, { title: event.target.value })
                      }
                      onBlur={(event) => void saveChoiceTitle(interaction, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    <button
                      className={`choice ${available ? 'available' : 'unavailable'} ${isSimulationMode && !available && forceUnavailableOptions ? 'forced' : ''}`}
                      disabled={isSimulationMode && !available && !forceUnavailableOptions}
                      onClick={() => choose(interaction)}
                      title={
                        available
                          ? getConditionSummary(story, interaction, current?.id ?? null, t)
                          : (unavailableReason ?? t('player.unavailable'))
                      }
                    >
                      <span className="choice-copy">
                        <strong>{interaction.title}</strong>
                        {isSimulationMode && !available ? (
                          <small>
                            {unavailableReason ?? t('player.unavailable')}
                            {forceUnavailableOptions ? t('player.forced') : ''}
                          </small>
                        ) : null}
                      </span>
                      <span className="choice-arrow" aria-hidden="true">
                        →
                      </span>
                    </button>
                  )}
                </div>
              ))}
              {isSimulationMode ? (
                <button
                  className="choice add-option"
                  aria-label={t('player.addOption')}
                  onClick={() => void addOption()}
                >
                  <span className="choice-copy">
                    <strong>{t('player.addOption')}</strong>
                    <small>{t('player.addOptionHelp')}</small>
                  </span>
                  <span className="choice-arrow" aria-hidden="true">
                    ＋
                  </span>
                </button>
              ) : null}
              {choices.length === 0 && current && !isSimulationMode ? (
                <div className="ending">
                  <span aria-hidden="true">◇</span>
                  <div>
                    <b>{t('player.branchEnd')}</b>
                    <p>{t('player.branchEndHelp')}</p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>
      {playedCharacter || playableCharacters.length === 0 ? (
        <aside
          className="player-inventory"
          aria-label={t(playedCharacter ? 'player.playedCharacter' : 'player.inventory')}
        >
          {playedCharacter ? (
            <>
              <div className="player-character-profile">
                {playedCharacter.imageUrl ? (
                  <img
                    className="player-character-image"
                    src={playedCharacter.imageUrl}
                    alt={playedCharacter.name}
                  />
                ) : (
                  <span className="player-character-placeholder" aria-hidden="true">
                    {playedCharacter.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <h2>{playedCharacter.name}</h2>
                {playedCharacter.description ? <p>{playedCharacter.description}</p> : null}
              </div>
              <h3>{t('player.stats')}</h3>
              {(playedCharacter.stats ?? []).length === 0 ? (
                <p className="hint">{t('player.noStats')}</p>
              ) : (
                <ul className="player-stat-list">
                  {(playedCharacter.stats ?? []).map((stat) => (
                    <li key={stat.id}>
                      <span className="player-stat-icon" aria-hidden="true">
                        ◇
                      </span>
                      <span>
                        {story.statDefinitions?.find(({ id }) => id === stat.statDefinitionId)
                          ?.name ?? t('player.unknownStat')}
                      </span>
                      <strong>: {statValues[stat.id] ?? stat.initialValue}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
          {isSimulationMode ? (
            <section className="simulation-controls">
              <span className="product-eyebrow">{t('player.authorTools')}</span>
              <label>
                <input
                  type="checkbox"
                  checked={forceUnavailableOptions}
                  onChange={(event) => setForceUnavailableOptions(event.target.checked)}
                />
                <span>
                  <b>{t('player.forceUnavailable')}</b>
                  <small>{t('player.forceUnavailableHelp')}</small>
                </span>
              </label>
            </section>
          ) : null}
          <h2>{t('player.inventory')}</h2>
          {ownedItemIds.filter(
            (itemId) =>
              !playedCharacter || getItemOwnerIdForInstance(story, itemId) === playedCharacter.id,
          ).length === 0 ? (
            <p className="hint">{t('player.noItems')}</p>
          ) : (
            <ul className="player-item-list">
              {ownedItemIds
                .filter(
                  (itemId) =>
                    !playedCharacter ||
                    getItemOwnerIdForInstance(story, itemId) === playedCharacter.id,
                )
                .map((itemId) => {
                  const ownerId = getItemOwnerIdForInstance(story, itemId);
                  const owner = (story.characters ?? []).find(
                    (character) => character.id === ownerId,
                  );
                  const itemDefinitionId = getItemDefinitionIdForInstance(story, itemId);
                  const definition = story.itemDefinitions?.find(
                    ({ id }) => id === itemDefinitionId,
                  );
                  return (
                    <li key={itemId}>
                      {definition?.imageUrl ? (
                        <img className="context-picto" src={definition.imageUrl} alt="" />
                      ) : null}
                      {definition?.name ?? t('player.unknownItem')}
                      {(definition?.stats ?? []).length > 0 ? (
                        <ul className="item-stat-list">
                          {(definition?.stats ?? []).map((stat) => (
                            <li key={stat.statDefinitionId}>
                              {story.statDefinitions?.find(({ id }) => id === stat.statDefinitionId)
                                ?.name ?? t('player.unknownStat')}
                              : {itemStatValues[itemId]?.[stat.id] ?? stat.initialValue}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {owner ? <small> — {owner.name}</small> : null}
                    </li>
                  );
                })}
            </ul>
          )}
        </aside>
      ) : null}
      {playedCharacter &&
      current &&
      (current.characterIds ?? []).some((id) => id !== playedCharacter.id) ? (
        <aside className="encounter-panel" aria-label={t('player.encounteredCharacters')}>
          <span className="product-eyebrow">{t('player.currentScene')}</span>
          <h2>{t('player.encounter')}</h2>
          {(current.characterIds ?? [])
            .filter((id) => id !== playedCharacter?.id)
            .map((characterId) => {
              const character = story.characters?.find(({ id }) => id === characterId);
              return character ? (
                <section className="encounter-card" key={character.id}>
                  {character.imageUrl ? (
                    <img src={character.imageUrl} alt={character.name} />
                  ) : (
                    <span className="encounter-placeholder" aria-hidden="true">
                      {character.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <h3>{character.name}</h3>
                  {character.description ? <p>{character.description}</p> : null}
                </section>
              ) : null;
            })}
        </aside>
      ) : null}
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
      <StoryCommentsPanel
        open={commentsOpen && canUseReaderComments}
        loading={comments.loading}
        error={comments.error}
        threads={readerCommentThreads}
        selectedThread={selectedReaderCommentThread}
        draftAnchor={comments.draftAnchor}
        canComment={canUseReaderComments}
        canManageThread={canManageSelectedReaderThread}
        realtimeStatus={comments.realtimeStatus}
        onClose={() => setCommentsOpen(false)}
        onSelect={comments.selectThread}
        onCancelDraft={comments.cancelDraft}
        onCreate={comments.create}
        onReply={comments.reply}
        onStatus={comments.setStatus}
      />
    </main>
  );
}

function applyInteractionResponse(story: Story, result: InteractionMutationResult | Story) {
  if ('interactions' in result) return ensureStoryInteractionPositions(result);
  return ensureStoryInteractionPositions(applyInteractionMutationResult(story, result));
}
