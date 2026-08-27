import type { Story } from '../../model/index.js';
import { buildDemoStory, buildDemoTrigger, demoEntityId } from '../builders.js';

export function createPathsOnlyDemoStory(storyId: string, timestamp: string): Story {
  const id = (localId: string) => demoEntityId(storyId, localId);

  return buildDemoStory(storyId, timestamp, {
    title: 'Demo 1: paths only',
    interactions: [
      {
        id: id('crossroads'),
        title: 'Reach the crossroads',
        body: 'At dawn, four distant landmarks emerge around a quiet crossroads.',
        position: { x: 600, y: 40 },
        triggers: [buildDemoTrigger(storyId, 'crossroads', [])],
      },
      {
        id: id('forest-road'),
        title: 'Take the forest road',
        body: 'The western road disappears beneath tall pines.',
        position: { x: 300, y: 260 },
        triggers: [buildDemoTrigger(storyId, 'forest-road', [id('crossroads')])],
      },
      {
        id: id('coastal-road'),
        title: 'Take the coastal road',
        body: 'The eastern road follows the cliffs above a bright sea.',
        position: { x: 900, y: 260 },
        triggers: [buildDemoTrigger(storyId, 'coastal-road', [id('crossroads')])],
      },
      {
        id: id('old-oak'),
        title: 'Rest beneath the old oak',
        body: 'A vast oak marks a peaceful clearing deep in the forest.',
        position: { x: 80, y: 500 },
        triggers: [buildDemoTrigger(storyId, 'old-oak', [id('forest-road')])],
      },
      {
        id: id('river-bridge'),
        title: 'Cross the river bridge',
        body: 'A narrow wooden bridge sways above the river.',
        position: { x: 380, y: 500 },
        triggers: [buildDemoTrigger(storyId, 'river-bridge', [id('forest-road')])],
      },
      {
        id: id('fishing-village'),
        title: 'Visit the fishing village',
        body: 'Small boats return to a village built along the sheltered bay.',
        position: { x: 820, y: 500 },
        triggers: [buildDemoTrigger(storyId, 'fishing-village', [id('coastal-road')])],
      },
      {
        id: id('lighthouse'),
        title: 'Climb to the lighthouse',
        body: 'The lighthouse balcony offers a view across the entire coast.',
        position: { x: 1120, y: 500 },
        triggers: [buildDemoTrigger(storyId, 'lighthouse', [id('coastal-road')])],
      },
      {
        id: id('sunset'),
        title: 'Watch the sunset',
        body: 'Every route ends beneath the same copper-colored sky.',
        position: { x: 600, y: 760 },
        triggers: [
          buildDemoTrigger(storyId, 'sunset', [
            id('old-oak'),
            id('river-bridge'),
            id('fishing-village'),
            id('lighthouse'),
          ]),
        ],
      },
    ],
  });
}
