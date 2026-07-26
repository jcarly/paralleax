import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Interaction, InteractionMutationResult, Story } from '@paralleax/shared';
import {
  applyInteractionStatEffects,
  ensureStoryInteractionPositions,
  getAvailableInteractions,
  getInitialStatValues,
  getInputReachableInteractions,
  getJourneyStatValues,
  getNextChildPosition,
  getNextRootPosition,
  getTriggerConditionFailures,
} from '@paralleax/shared';
import { api } from '../api';

function getInteractionTitle(story: Story, interactionId: string) {
  return (
    story.interactions.find((interaction) => interaction.id === interactionId)?.title ??
    interactionId
  );
}

function getUnavailableReason(
  story: Story,
  interaction: Interaction,
  currentId: string | null,
  visited: string[],
  currentLocationId: string | null,
  currentCharacterIds: string[],
  statValues: Readonly<Record<string, number>>,
) {
  const failures = getTriggerConditionFailures(
    interaction,
    currentId,
    visited,
    currentLocationId,
    currentCharacterIds,
    statValues,
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
          label: `${character.name} — ${item.name}`,
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
  const [editingChoiceId, setEditingChoiceId] = useState<string>();
  const editingChoiceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api.getStory(storyId).then((nextStory) => {
      const positioned = ensureStoryInteractionPositions(nextStory);
      setStory(positioned);
      setCurrentLocationId(
        positioned.interactions.find(({ id }) => id === startInteractionId)?.locationId ?? null,
      );
      setStatValues(
        startInteractionId
          ? getJourneyStatValues(positioned, [startInteractionId])
          : getInitialStatValues(positioned),
      );
    });
  }, [startInteractionId, storyId]);

  const current = useMemo(
    () => story?.interactions.find((item) => item.id === currentId),
    [currentId, story],
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
          )
        : [],
    [story, current, visited, currentLocationId, statValues],
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
      isSimulationMode,
      statValues,
      story,
      visited,
    ],
  );

  useEffect(() => {
    editingChoiceInputRef.current?.focus();
    editingChoiceInputRef.current?.select();
  }, [editingChoiceId]);

  function choose(interaction: Interaction) {
    setCurrentId(interaction.id);
    setJourney((ids) => [...ids, interaction.id]);
    setVisited((ids) => (ids.includes(interaction.id) ? ids : [...ids, interaction.id]));
    if (interaction.locationId) setCurrentLocationId(interaction.locationId);
    setStatValues((values) => applyInteractionStatEffects(values, interaction));
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
  }

  function stepBack() {
    if (journey.length <= 1) return;
    const nextJourney = journey.slice(0, -1);
    setJourney(nextJourney);
    setCurrentId(nextJourney.at(-1) ?? startInteractionId);
    setVisited(uniqueJourneyIds(nextJourney));
    setCurrentLocationId(getJourneyLocation(story, nextJourney));
    if (story) setStatValues(getJourneyStatValues(story, nextJourney));
  }

  async function saveCurrentInteraction(patch: Partial<Pick<Interaction, 'title' | 'body'>>) {
    if (!current) return;
    const result = await api.updateInteraction(storyId, current.id, patch);
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
                <textarea
                  className="simulation-body-input"
                  aria-label="Current interaction content"
                  value={current.body}
                  rows={6}
                  onChange={(event) => patchCurrentInteraction({ body: event.target.value })}
                  onBlur={(event) => void saveCurrentInteraction({ body: event.target.value })}
                />
              </>
            ) : (
              <>
                <h1>{current.title}</h1>
                <div className="story-body">{current.body}</div>
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
                      ? 'Available'
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
