import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Interaction, Story } from '@paralleax/shared';
import { getAvailableInteractions, getInputReachableInteractions } from '@paralleax/shared';
import { api } from '../api';

export function StoryPlayer() {
  const { storyId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const isSimulationMode = searchParams.get('mode') === 'simulation';
  const startInteractionId = searchParams.get('startInteractionId');
  const [story, setStory] = useState<Story>();
  const [currentId, setCurrentId] = useState<string | null>(startInteractionId);
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
          }))
        : choices.map((interaction) => ({ interaction, available: true })),
    [availableChoiceIds, choices, current, isSimulationMode, story],
  );

  function choose(interaction: Interaction) {
    setCurrentId(interaction.id);
    setVisited((ids) => (ids.includes(interaction.id) ? ids : [...ids, interaction.id]));
  }

  function restart() {
    setCurrentId(startInteractionId);
    setVisited(startInteractionId ? [startInteractionId] : []);
  }

  if (!story) return <main className="page">Loading...</main>;

  return (
    <main className="player-page">
      <div className="player-top">
        <Link to={`/stories/${story.id}/edit`}>Back to editor</Link>
        {isSimulationMode ? <span className="mode-pill">Simulation</span> : null}
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
          {visibleChoices.map(({ interaction, available }) => (
            <button
              className={`choice ${available ? 'available' : 'unavailable'}`}
              key={interaction.id}
              onClick={() => choose(interaction)}
              title={available ? 'Available' : 'Unavailable in the current simulation state'}
            >
              <span>{interaction.title}</span>
              {isSimulationMode && !available ? <small>Unavailable - force for test</small> : null}
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
