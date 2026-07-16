import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Interaction, Story } from '@paralleax/shared';
import {
  getAvailableInteractions,
  getInputReachableInteractions,
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
) {
  const failures = getTriggerConditionFailures(interaction, currentId, visited);
  if (failures.length === 0) return undefined;

  const firstFailure = failures[0].condition;
  const title = getInteractionTitle(story, firstFailure.interactionId);
  return firstFailure.hasBeenVisited
    ? `Requires "${title}" to be visited.`
    : `Requires "${title}" not to be visited.`;
}

function uniqueJourneyIds(journey: string[]) {
  return journey.filter((id, index) => journey.indexOf(id) === index);
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

  useEffect(() => {
    void api.getStory(storyId).then(setStory);
  }, [storyId]);

  const current = useMemo(
    () => story?.interactions.find((item) => item.id === currentId),
    [currentId, story],
  );

  const choices = useMemo(
    () => (story ? getAvailableInteractions(story, current?.id ?? null, visited) : []),
    [story, current, visited],
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
              : getUnavailableReason(story, interaction, current?.id ?? null, visited),
          }))
        : choices.map((interaction) => ({
            interaction,
            available: true,
            unavailableReason: undefined,
          })),
    [availableChoiceIds, choices, current, isSimulationMode, story, visited],
  );

  function choose(interaction: Interaction) {
    setCurrentId(interaction.id);
    setJourney((ids) => [...ids, interaction.id]);
    setVisited((ids) => (ids.includes(interaction.id) ? ids : [...ids, interaction.id]));
  }

  function restart() {
    setCurrentId(startInteractionId);
    setJourney(startInteractionId ? [startInteractionId] : []);
    setVisited(startInteractionId ? [startInteractionId] : []);
  }

  function stepBack() {
    if (journey.length <= 1) return;
    const nextJourney = journey.slice(0, -1);
    setJourney(nextJourney);
    setCurrentId(nextJourney.at(-1) ?? startInteractionId);
    setVisited(uniqueJourneyIds(nextJourney));
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
            <h1>{current.title}</h1>
            <div className="story-body">{current.body}</div>
          </>
        ) : (
          <>
            <h1>Start the story</h1>
            <p>Choose a starting interaction.</p>
          </>
        )}
        <div className="choices">
          {visibleChoices.map(({ interaction, available, unavailableReason }) => (
            <button
              className={`choice ${available ? 'available' : 'unavailable'}`}
              key={interaction.id}
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
          ))}
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
