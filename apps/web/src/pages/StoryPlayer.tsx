import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Interaction, Story } from '@paralleax/shared';
import { getAvailableInteractions } from '@paralleax/shared';
import { api } from '../api';
export function StoryPlayer() {
  const { storyId = '' } = useParams(); const [story, setStory] = useState<Story>(); const [current, setCurrent] = useState<Interaction>(); const [visited, setVisited] = useState<string[]>([]);
  useEffect(() => { void api.getStory(storyId).then(setStory); }, [storyId]);
  const choices = useMemo(() => story ? getAvailableInteractions(story, current?.id ?? null, visited) : [], [story, current, visited]);
  function choose(interaction: Interaction) { setCurrent(interaction); setVisited((ids) => ids.includes(interaction.id) ? ids : [...ids, interaction.id]); }
  function restart() { setCurrent(undefined); setVisited([]); }
  if (!story) return <main className="page">Chargement…</main>;
  return <main className="player-page"><div className="player-top"><Link to={`/stories/${story.id}/edit`}>← Retour à l’éditeur</Link><button className="secondary" onClick={restart}>Recommencer</button></div><article className="player-card"><p className="eyebrow">{story.title}</p>{current ? <><h1>{current.title}</h1><div className="story-body">{current.body}</div></> : <><h1>Commencer l’histoire</h1><p>Choisissez une interaction de départ.</p></>}<div className="choices">{choices.map((choice) => <button key={choice.id} onClick={() => choose(choice)}>{choice.title}</button>)}{choices.length === 0 && current && <p className="ending">Fin de cette branche.</p>}</div></article><details className="debug"><summary>Historique de lecture</summary><ol>{visited.map((id) => <li key={id}>{story.interactions.find((item) => item.id === id)?.title ?? id}</li>)}</ol></details></main>;
}
