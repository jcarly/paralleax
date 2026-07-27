import { useEffect, useMemo, useRef, useState } from 'react';
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

function describeCondition(story: Story, condition: TriggerCondition) {
  if ('locationId' in condition) {
    const name =
      story.locations?.find((location) => location.id === condition.locationId)?.name ??
      condition.locationId;
    return condition.isCurrentLocation
      ? `Current location is "${name}"`
      : `Current location is not "${name}"`;
  }
  if ('interactionId' in condition) {
    const title = getInteractionTitle(story, condition.interactionId);
    return condition.hasBeenVisited
      ? `"${title}" has been visited`
      : `"${title}" has not been visited`;
  }
  if ('statId' in condition) {
    const stat = (story.characters ?? [])
      .flatMap((character) =>
        (character.stats ?? []).map((item) => ({
          ...item,
          label: `${character.name} â€” ${
            story.statDefinitions?.find(({ id }) => id === item.statDefinitionId)?.name ??
            'Unknown stat'
          }`,
        })),
      )
      .find(({ id }) => id === condition.statId);
    const operatorLabels = {
      eq: 'equals',
      lt: 'is less than',
      lte: 'is at most',
      gt: 'is greater than',
      gte: 'is at least',
    };
    return `"${stat?.label ?? condition.statId}" ${operatorLabels[condition.operator]} ${condition.value}`;
  }
  if ('itemDefinitionId' in condition) {
    const name =
      story.itemDefinitions?.find(({ id }) => id === condition.itemDefinitionId)?.name ??
      condition.itemDefinitionId;
    return condition.isOwned ? `Owns "${name}"` : `Does not own "${name}"`;
  }
  if ('temporal' in condition) return 'Story date and time match the configured schedule';
  const name =
    story.characters?.find((character) => character.id === condition.characterId)?.name ??
    condition.characterId;
  return condition.isPresent ? `"${name}" is present` : `"${name}" is absent`;
}

function getConditionSummary(story: Story, interaction: Interaction, currentId: string | null) {
  const triggers = interaction.triggers.filter((trigger) =>
    currentId
      ? trigger.inputInteractionIds.includes(currentId) ||
        (trigger.inputInteractionIds.length === 0 && trigger.conditions.length > 0)
      : trigger.inputInteractionIds.length === 0,
  );
  const variants = triggers.map((trigger) =>
    trigger.conditions.length === 0
      ? 'No conditions'
      : trigger.conditions.map((condition) => describeCondition(story, condition)).join(' and '),
  );
  return variants.length > 1
    ? variants.join(' or ')
    : (variants[0] ?? 'No matching outgoing trigger');
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
    return firstFailure.isCurrentLocation
      ? `Requires the current location to be "${name}".`
      : `Requires the current location not to be "${name}".`;
  }
  if ('interactionId' in firstFailure) {
    const title = getInteractionTitle(story, firstFailure.interactionId);
    return firstFailure.hasBeenVisited
      ? `Requires "${title}" to be visited.`
      : `Requires "${title}" not to be visited.`;
  }
  if ('statId' in firstFailure) {
    const stat = (story.characters ?? [])
      .flatMap((character) =>
        (character.stats ?? []).map((item) => ({
          ...item,
          label: `${character.name} — ${
            story.statDefinitions?.find(({ id }) => id === item.statDefinitionId)?.name ??
            'Unknown stat'
          }`,
        })),
      )
      .find(({ id }) => id === firstFailure.statId);
    const operatorLabels = {
      eq: 'equal to',
      lt: 'less than',
      lte: 'at most',
      gt: 'greater than',
      gte: 'at least',
    };
    return `Requires "${stat?.label ?? firstFailure.statId}" to be ${operatorLabels[firstFailure.operator]} ${firstFailure.value}.`;
  }
  if ('itemDefinitionId' in firstFailure) {
    const name =
      story.itemDefinitions?.find(({ id }) => id === firstFailure.itemDefinitionId)?.name ??
      firstFailure.itemDefinitionId;
    return firstFailure.isOwned ? `Requires owning "${name}".` : `Requires not owning "${name}".`;
  }
  if ('temporal' in firstFailure) {
    return `Requires a different story date or time. Current time: ${currentDateTime.replace('T', ' ')}.`;
  }
  const name =
    story.characters?.find((character) => character.id === firstFailure.characterId)?.name ??
    firstFailure.characterId;
  return firstFailure.isPresent
    ? `Requires "${name}" to be present.`
    : `Requires "${name}" to be absent.`;
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

export function StoryPlayer() {
  const { storyId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const isSimulationMode = searchParams.get('mode') === 'simulation';
  const startInteractionId = searchParams.get('startInteractionId');
  const [story, setStory] = useState<Story>();
  const [currentId, setCurrentId] = useState<string | null>(startInteractionId);
  const [journey, setJourney] = useState<string[]>(startInteractionId ? [startInteractionId] : []);
  const [visited, setVisited] = useState<string[]>(startInteractionId ? [startInteractionId] : []);
  const [currentLocationId, setCurrentLocationId] = useState<string | null>(null);
  const [statValues, setStatValues] = useState<Record<string, number>>({});
  const [ownedItemIds, setOwnedItemIds] = useState<string[]>([]);
  const [itemStatValues, setItemStatValues] = useState<Record<string, Record<string, number>>>({});
  const [progressStatus, setProgressStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [editingChoiceId, setEditingChoiceId] = useState<string>();
  const editingChoiceInputRef = useRef<HTMLInputElement>(null);
  const progressSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const progressAttempt = useRef(0);

  useEffect(() => {
    void Promise.all([
      api.getStory(storyId),
      isSimulationMode || startInteractionId
        ? Promise.resolve(null)
        : api.getReaderProgress(storyId),
    ]).then(([nextStory, progress]) => {
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
      setJourney(nextJourney);
      setVisited(uniqueJourneyIds(nextJourney));
      setCurrentId(nextJourney.at(-1) ?? null);
      setCurrentLocationId(getJourneyLocation(positioned, nextJourney));
      setStatValues(getJourneyStatValues(positioned, nextJourney));
      setOwnedItemIds(reconciledProgress?.ownedItemIds ?? []);
      setItemStatValues(
        reconciledProgress?.itemStatValues ?? getJourneyItemStatValues(positioned, nextJourney),
      );
      setProgressStatus(progress ? 'saved' : 'idle');
    });
  }, [isSimulationMode, startInteractionId, storyId]);

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
        ? getInputReachableInteractions(story, current?.id ?? null).map((interaction) => ({
            interaction,
            available: availableChoiceIds.has(interaction.id),
            unavailableReason: availableChoiceIds.has(interaction.id)
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
                ),
          }))
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
          ? 'The target interaction is no longer connected by an outgoing trigger.'
          : available
            ? getConditionSummary(story, interaction, current.id)
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
    setOwnedItemIds([]);
    setItemStatValues(
      story
        ? startInteractionId
          ? getJourneyItemStatValues(story, [startInteractionId])
          : getInitialItemStatValues(story)
        : {},
    );
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

  if (!story) return <main className="page">Loading...</main>;

  return (
    <main className="player-page">
      <div className="player-top">
        <Link to={`/stories/${story.id}/edit`}>Back to editor</Link>
        {isSimulationMode ? <span className="mode-pill">Simulation</span> : null}
        {!isSimulationMode ? (
          <span className={`save-status ${progressStatus}`} role="status" aria-live="polite">
            {progressStatus === 'saving'
              ? 'Saving progress…'
              : progressStatus === 'saved'
                ? 'Progress saved'
                : progressStatus === 'error'
                  ? 'Progress save failed'
                  : ''}
          </span>
        ) : null}
        {isSimulationMode ? (
          <button className="secondary" disabled={journey.length <= 1} onClick={stepBack}>
            Back
          </button>
        ) : null}
        <button className="secondary" onClick={restart}>
          Restart
        </button>
      </div>
      <article className="player-card">
        <p className="eyebrow">{story.title}</p>
        <time className="story-clock" dateTime={currentDateTime}>
          {currentDateTime.replace('T', ' ')}
        </time>
        {current ? (
          <>
            {isSimulationMode ? (
              <>
                <input
                  className="simulation-title-input"
                  aria-label="Current interaction title"
                  value={current.title}
                  onChange={(event) => patchCurrentInteraction({ title: event.target.value })}
                  onBlur={(event) => void saveCurrentInteraction({ title: event.target.value })}
                />
                <RichTextEditor
                  ariaLabel="Current interaction content"
                  value={current.body}
                  onChange={(body) => patchCurrentInteraction({ body })}
                  onBlur={(body) => void saveCurrentInteraction({ body })}
                  conditionalTargets={outgoingInteractions}
                  conditionalTextState={conditionalTextState}
                  onConditionalTargetClick={(interactionId) => {
                    const target = story.interactions.find(({ id }) => id === interactionId);
                    if (target) choose(target);
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
            <h1>Start the story</h1>
            <p>Choose a starting interaction.</p>
          </>
        )}
        <div className="choices">
          {visibleChoices.map(({ interaction, available, unavailableReason }) => (
            <div className="choice-row" key={interaction.id}>
              {editingChoiceId === interaction.id ? (
                <input
                  ref={editingChoiceInputRef}
                  className="choice-title-input"
                  aria-label="New option title"
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
                  className={`choice ${available ? 'available' : 'unavailable'}`}
                  onClick={() => choose(interaction)}
                  title={
                    available
                      ? getConditionSummary(story, interaction, current?.id ?? null)
                      : (unavailableReason ?? 'Unavailable in the current simulation state')
                  }
                >
                  <span>{interaction.title}</span>
                  {isSimulationMode && !available ? (
                    <small>{unavailableReason ?? 'Unavailable - force for test'}</small>
                  ) : null}
                </button>
              )}
            </div>
          ))}
          {isSimulationMode ? (
            <button className="choice add-option" onClick={() => void addOption()}>
              Add option
            </button>
          ) : null}
          {choices.length === 0 && current && !isSimulationMode ? (
            <p className="ending">End of this branch.</p>
          ) : null}
        </div>
      </article>
      <aside className="player-inventory" aria-label="Inventory">
        <h2>Inventory</h2>
        {ownedItemIds.length === 0 ? (
          <p className="hint">No items.</p>
        ) : (
          <ul>
            {ownedItemIds.map((itemId) => {
              const owner = (story.characters ?? []).find((character) =>
                (character.items ?? []).some(({ id }) => id === itemId),
              );
              const itemDefinitionId = getItemDefinitionIdForInstance(story, itemId);
              const definition = story.itemDefinitions?.find(({ id }) => id === itemDefinitionId);
              return (
                <li key={itemId}>
                  {definition?.imageUrl ? (
                    <img className="context-picto" src={definition.imageUrl} alt="" />
                  ) : null}
                  {definition?.name ?? 'Unknown item'}
                  {(definition?.stats ?? []).length > 0 ? (
                    <ul className="item-stat-list">
                      {(definition?.stats ?? []).map((stat) => (
                        <li key={stat.statDefinitionId}>
                          {story.statDefinitions?.find(({ id }) => id === stat.statDefinitionId)
                            ?.name ?? 'Unknown stat'}
                          : {itemStatValues[itemId]?.[stat.statDefinitionId] ?? stat.initialValue}
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
      <details className="debug">
        <summary>{isSimulationMode ? 'Simulation history' : 'Reading history'}</summary>
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
