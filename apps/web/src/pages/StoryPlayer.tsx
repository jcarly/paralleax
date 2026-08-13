import { useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type {
  Interaction,
  InteractionMutationResult,
  Story,
  TriggerCondition,
} from '@paralleax/shared';
import {
  applyInteractionStatChanges,
  applyInteractionItemEffects,
  applyInteractionItemStatChanges,
  buildReaderProgressState,
  ensureStoryInteractionPositions,
  getAvailableInteractions,
  getInitialStatValues,
  getInitialItemStatValues,
  getInputReachableInteractions,
  getJourneyStatValues,
  getJourneyOwnedItemIds,
  getItemDefinitionIdForInstance,
  getItemOwnerIdForInstance,
  getJourneyItemStatValues,
  getJourneyDateTime,
  getNextChildPosition,
  getNextRootPosition,
  getTriggerConditionFailures,
} from '@paralleax/shared';
import { api } from '../api';
import { RichTextContent } from '../components/RichTextContent';
import { RichTextEditor } from '../components/RichTextEditor';

function getInteractionTitle(story: Story, interactionId: string) {
  return (
    story.interactions.find((interaction) => interaction.id === interactionId)?.title ??
    interactionId
  );
}

function describeCondition(story: Story, condition: TriggerCondition, t: TFunction) {
  if ('locationId' in condition) {
    const name =
      story.locations?.find((location) => location.id === condition.locationId)?.name ??
      condition.locationId;
    return t(
      condition.isCurrentLocation
        ? 'player.condition.locationIs'
        : 'player.condition.locationIsNot',
      { name },
    );
  }
  if ('interactionId' in condition) {
    const title = getInteractionTitle(story, condition.interactionId);
    return t(
      condition.hasBeenVisited ? 'player.condition.visited' : 'player.condition.notVisited',
      {
        title,
      },
    );
  }
  if ('statId' in condition) {
    const stat = (story.characters ?? [])
      .flatMap((character) =>
        (character.stats ?? []).map((item) => ({
          ...item,
          label: `${character.name} — ${
            story.statDefinitions?.find(({ id }) => id === item.statDefinitionId)?.name ??
            t('player.unknownStat')
          }`,
        })),
      )
      .find(({ id }) => id === condition.statId);
    return t('player.condition.stat', {
      label: stat?.label ?? condition.statId,
      operator: t(`player.condition.operator.${condition.operator}`),
      value: condition.value,
    });
  }
  if ('itemDefinitionId' in condition) {
    const name =
      story.itemDefinitions?.find(({ id }) => id === condition.itemDefinitionId)?.name ??
      condition.itemDefinitionId;
    return t(condition.isOwned ? 'player.condition.owns' : 'player.condition.doesNotOwn', {
      name,
    });
  }
  if ('temporal' in condition) return t('player.condition.temporal');
  const name =
    story.characters?.find((character) => character.id === condition.characterId)?.name ??
    condition.characterId;
  return t(condition.isPresent ? 'player.condition.present' : 'player.condition.absent', {
    name,
  });
}

function getConditionSummary(
  story: Story,
  interaction: Interaction,
  currentId: string | null,
  t: TFunction,
) {
  const triggers = interaction.triggers.filter((trigger) =>
    currentId
      ? trigger.inputInteractionIds.includes(currentId) ||
        (trigger.inputInteractionIds.length === 0 && trigger.conditions.length > 0)
      : trigger.inputInteractionIds.length === 0,
  );
  const variants = triggers.map((trigger) =>
    trigger.conditions.length === 0
      ? t('player.condition.noConditions')
      : trigger.conditions
          .map((condition) => describeCondition(story, condition, t))
          .join(` ${t('player.condition.and')} `),
  );
  return variants.length > 1
    ? variants.join(` ${t('player.condition.or')} `)
    : (variants[0] ?? t('player.condition.noMatching'));
}

function getUnavailableReason(
  story: Story,
  interaction: Interaction,
  currentId: string | null,
  visited: string[],
  currentLocationId: string | null,
  currentCharacterIds: string[],
  statValues: Readonly<Record<string, number>>,
  currentDateTime: string,
  ownedItemDefinitionIds: readonly string[],
  t: TFunction,
) {
  const failures = getTriggerConditionFailures(
    interaction,
    currentId,
    visited,
    currentLocationId,
    currentCharacterIds,
    statValues,
    currentDateTime,
    ownedItemDefinitionIds,
  );
  if (failures.length === 0) return undefined;

  const firstFailure = failures[0].condition;
  if ('locationId' in firstFailure) {
    const name =
      story.locations?.find((location) => location.id === firstFailure.locationId)?.name ??
      firstFailure.locationId;
    return t(
      firstFailure.isCurrentLocation
        ? 'player.requirement.locationIs'
        : 'player.requirement.locationIsNot',
      { name },
    );
  }
  if ('interactionId' in firstFailure) {
    const title = getInteractionTitle(story, firstFailure.interactionId);
    return t(
      firstFailure.hasBeenVisited ? 'player.requirement.visited' : 'player.requirement.notVisited',
      { title },
    );
  }
  if ('statId' in firstFailure) {
    const stat = (story.characters ?? [])
      .flatMap((character) =>
        (character.stats ?? []).map((item) => ({
          ...item,
          label: `${character.name} — ${
            story.statDefinitions?.find(({ id }) => id === item.statDefinitionId)?.name ??
            t('player.unknownStat')
          }`,
        })),
      )
      .find(({ id }) => id === firstFailure.statId);
    return t('player.requirement.stat', {
      label: stat?.label ?? firstFailure.statId,
      operator: t(`player.requirement.operator.${firstFailure.operator}`),
      value: firstFailure.value,
    });
  }
  if ('itemDefinitionId' in firstFailure) {
    const name =
      story.itemDefinitions?.find(({ id }) => id === firstFailure.itemDefinitionId)?.name ??
      firstFailure.itemDefinitionId;
    return t(firstFailure.isOwned ? 'player.requirement.owns' : 'player.requirement.doesNotOwn', {
      name,
    });
  }
  if ('temporal' in firstFailure) {
    return t('player.requirement.temporal', { time: currentDateTime.replace('T', ' ') });
  }
  const name =
    story.characters?.find((character) => character.id === firstFailure.characterId)?.name ??
    firstFailure.characterId;
  return t(firstFailure.isPresent ? 'player.requirement.present' : 'player.requirement.absent', {
    name,
  });
}

function uniqueJourneyIds(journey: string[]) {
  return journey.filter((id, index) => journey.indexOf(id) === index);
}

function getJourneyLocation(story: Story | undefined, journey: string[]) {
  if (!story) return null;
  for (let index = journey.length - 1; index >= 0; index -= 1) {
    const locationId = story.interactions.find(({ id }) => id === journey[index])?.locationId;
    if (locationId) return locationId;
  }
  return null;
}

export function StoryPlayer({ authenticated = true }: { authenticated?: boolean }) {
  const { t } = useTranslation();
  const { storyId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const simulationRequested = authenticated && searchParams.get('mode') === 'simulation';
  const startInteractionId = authenticated ? searchParams.get('startInteractionId') : null;
  const [story, setStory] = useState<Story>();
  const isSimulationMode = simulationRequested && story?.capabilities?.canEdit !== false;
  const loadKey = `${storyId}:${isSimulationMode ? 'simulation' : 'reader'}:${startInteractionId ?? ''}`;
  const [loadedKey, setLoadedKey] = useState('');
  const [loadError, setLoadError] = useState<{ key: string; message: string }>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(startInteractionId);
  const [journey, setJourney] = useState<string[]>(startInteractionId ? [startInteractionId] : []);
  const [visited, setVisited] = useState<string[]>(startInteractionId ? [startInteractionId] : []);
  const [currentLocationId, setCurrentLocationId] = useState<string | null>(null);
  const [statValues, setStatValues] = useState<Record<string, number>>({});
  const [ownedItemIds, setOwnedItemIds] = useState<string[]>([]);
  const [itemStatValues, setItemStatValues] = useState<Record<string, Record<string, number>>>({});
  const [playableCharacterId, setPlayableCharacterId] = useState<string>();
  const [progressStatus, setProgressStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [forceUnavailableOptions, setForceUnavailableOptions] = useState(false);
  const [editingChoiceId, setEditingChoiceId] = useState<string>();
  const editingChoiceInputRef = useRef<HTMLInputElement>(null);
  const progressSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const progressAttempt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.getStory(storyId),
      !authenticated || isSimulationMode || startInteractionId
        ? Promise.resolve(null)
        : api.getReaderProgress(storyId),
    ])
      .then(([nextStory, progress]) => {
        if (cancelled) return;
        const positioned = ensureStoryInteractionPositions(nextStory);
        const reconciledProgress = progress
          ? buildReaderProgressState(
              positioned,
              progress.state.journeyInteractionIds,
              progress.state.ownedItemIds,
            )
          : undefined;
        const nextJourney =
          reconciledProgress?.journeyInteractionIds ??
          (startInteractionId ? [startInteractionId] : []);
        setStory(positioned);
        setLoadedKey(loadKey);
        setJourney(nextJourney);
        setVisited(uniqueJourneyIds(nextJourney));
        setCurrentId(nextJourney.at(-1) ?? null);
        setCurrentLocationId(getJourneyLocation(positioned, nextJourney));
        setStatValues(getJourneyStatValues(positioned, nextJourney));
        setOwnedItemIds(
          reconciledProgress?.ownedItemIds ?? getJourneyOwnedItemIds(positioned, nextJourney),
        );
        setItemStatValues(
          reconciledProgress?.itemStatValues ?? getJourneyItemStatValues(positioned, nextJourney),
        );
        if (nextJourney.length > 0) {
          setPlayableCharacterId(positioned.characters?.find(({ isPlayable }) => isPlayable)?.id);
        }
        setProgressStatus(progress ? 'saved' : 'idle');
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
  }, [authenticated, isSimulationMode, loadAttempt, loadKey, startInteractionId, storyId, t]);

  const current = useMemo(
    () => story?.interactions.find((item) => item.id === currentId),
    [currentId, story],
  );
  const currentDateTime = useMemo(
    () => (story ? getJourneyDateTime(story, journey) : '2000-01-03T08:00'),
    [journey, story],
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
    const nextJourney = [...journey, interaction.id];
    const nextOwnedItemIds = applyInteractionItemEffects(
      story,
      ownedItemIds,
      interaction,
      journey.length,
    );
    setCurrentId(interaction.id);
    setJourney(nextJourney);
    setVisited((ids) => (ids.includes(interaction.id) ? ids : [...ids, interaction.id]));
    if (interaction.locationId) setCurrentLocationId(interaction.locationId);
    setStatValues((values) => applyInteractionStatChanges(story, values, interaction));
    setItemStatValues((values) =>
      applyInteractionItemStatChanges(story, values, interaction, nextOwnedItemIds),
    );
    setOwnedItemIds(nextOwnedItemIds);
    if (!isSimulationMode) queueProgressSave(nextJourney, nextOwnedItemIds);
  }

  function restart() {
    setCurrentId(startInteractionId);
    setJourney(startInteractionId ? [startInteractionId] : []);
    setVisited(startInteractionId ? [startInteractionId] : []);
    setCurrentLocationId(
      story?.interactions.find(({ id }) => id === startInteractionId)?.locationId ?? null,
    );
    setStatValues(
      story
        ? startInteractionId
          ? getJourneyStatValues(story, [startInteractionId])
          : getInitialStatValues(story)
        : {},
    );
    setOwnedItemIds(
      story && startInteractionId ? getJourneyOwnedItemIds(story, [startInteractionId]) : [],
    );
    setItemStatValues(
      story
        ? startInteractionId
          ? getJourneyItemStatValues(story, [startInteractionId])
          : getInitialItemStatValues(story)
        : {},
    );
    setPlayableCharacterId(undefined);
    setForceUnavailableOptions(false);
    if (!isSimulationMode) queueProgressReset();
  }

  function stepBack() {
    if (journey.length <= 1) return;
    const nextJourney = journey.slice(0, -1);
    setJourney(nextJourney);
    setCurrentId(nextJourney.at(-1) ?? startInteractionId);
    setVisited(uniqueJourneyIds(nextJourney));
    setCurrentLocationId(getJourneyLocation(story, nextJourney));
    if (story) setStatValues(getJourneyStatValues(story, nextJourney));
    if (story) setOwnedItemIds(getJourneyOwnedItemIds(story, nextJourney));
    if (story) setItemStatValues(getJourneyItemStatValues(story, nextJourney));
  }

  async function saveCurrentInteraction(patch: Partial<Pick<Interaction, 'title' | 'body'>>) {
    if (!current) return;
    const result = await api.updateInteraction(storyId, current.id, patch);
    setStory((currentStory) =>
      currentStory ? applyInteractionResponse(currentStory, result) : currentStory,
    );
  }

  function queueProgressSave(nextJourney: string[], nextOwnedItemIds: string[]) {
    if (!authenticated) return;
    const attempt = ++progressAttempt.current;
    setProgressStatus('saving');
    const operation = progressSaveQueue.current
      .then(() =>
        api.saveReaderProgress(storyId, {
          journeyInteractionIds: nextJourney,
          ownedItemIds: nextOwnedItemIds,
        }),
      )
      .then(() => {
        if (attempt === progressAttempt.current) setProgressStatus('saved');
      })
      .catch(() => {
        if (attempt === progressAttempt.current) setProgressStatus('error');
      });
    progressSaveQueue.current = operation.then(() => undefined);
  }

  function queueProgressReset() {
    if (!authenticated) return;
    const attempt = ++progressAttempt.current;
    setProgressStatus('saving');
    const operation = progressSaveQueue.current
      .then(() => api.deleteReaderProgress(storyId))
      .then(() => {
        if (attempt === progressAttempt.current) setProgressStatus('idle');
      })
      .catch(() => {
        if (attempt === progressAttempt.current) setProgressStatus('error');
      });
    progressSaveQueue.current = operation.then(() => undefined);
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
    const result = await api.createInteraction(
      storyId,
      current
        ? {
            parentId: current.id,
            position: getNextChildPosition(story, current),
          }
        : {
            position: getNextRootPosition(story),
          },
    );
    const created = interactionFromResponse(result, story);
    setStory((currentStory) =>
      currentStory ? applyInteractionResponse(currentStory, result) : currentStory,
    );
    setEditingChoiceId(created?.id);
  }

  async function saveChoiceTitle(interaction: Interaction, title: string) {
    setEditingChoiceId(undefined);
    const result = await api.updateInteraction(storyId, interaction.id, { title });
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
    <main className={`player-page ${isSimulationMode ? 'simulation-mode' : 'reader-mode'}`}>
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
        {authenticated ? (
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
                  />
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
                              :{' '}
                              {itemStatValues[itemId]?.[stat.statDefinitionId] ?? stat.initialValue}
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
    </main>
  );
}

function applyInteractionResponse(story: Story, result: InteractionMutationResult | Story) {
  if ('interactions' in result) return ensureStoryInteractionPositions(result);
  const interaction = result.interaction;
  const exists = story.interactions.some(({ id }) => id === interaction.id);
  return ensureStoryInteractionPositions({
    ...story,
    revision: result.revision,
    updatedAt: result.updatedAt,
    interactions: exists
      ? story.interactions.map((item) => (item.id === interaction.id ? interaction : item))
      : [...story.interactions, interaction],
  });
}

function interactionFromResponse(result: InteractionMutationResult | Story, current: Story) {
  if (!('interactions' in result)) return result.interaction;
  const currentIds = new Set(current.interactions.map(({ id }) => id));
  return result.interactions.find(({ id }) => !currentIds.has(id));
}
