import type { Story } from '../../model/index.js';
import { buildDemoStory, buildDemoTrigger, demoEntityId } from '../builders.js';

export function createVisitedConditionsDemoStory(storyId: string, timestamp: string): Story {
  const id = (localId: string) => demoEntityId(storyId, localId);

  return buildDemoStory(storyId, timestamp, {
    title: 'Demo 2: visited interaction conditions',
    interactions: [
      {
        id: id('briefing'),
        title: 'Receive the manor briefing',
        body: 'A stolen portrait and two unexplored wings await your investigation.',
        position: { x: 600, y: 20 },
        triggers: [buildDemoTrigger(storyId, 'briefing', [])],
      },
      {
        id: id('hall'),
        title: 'Return to the entrance hall',
        body: 'The entrance hall connects the archive and the winter garden.',
        position: { x: 600, y: 250 },
        triggers: [
          buildDemoTrigger(storyId, 'hall', [id('briefing'), id('archive'), id('garden')]),
        ],
      },
      {
        id: id('archive'),
        title: 'Search the family archive',
        body: 'A restoration invoice mentions a concealed passage behind the portrait.',
        position: { x: 250, y: 500 },
        triggers: [
          buildDemoTrigger(
            storyId,
            'archive',
            [id('hall')],
            [{ interactionId: id('archive'), hasBeenVisited: false }],
          ),
        ],
      },
      {
        id: id('garden'),
        title: 'Inspect the winter garden',
        body: 'Fresh mud beneath a statue reveals the passage exit.',
        position: { x: 950, y: 500 },
        triggers: [
          buildDemoTrigger(
            storyId,
            'garden',
            [id('hall')],
            [{ interactionId: id('garden'), hasBeenVisited: false }],
          ),
        ],
      },
      {
        id: id('confrontation'),
        title: 'Confront the art thief',
        body: 'With both clues in hand, you intercept the thief inside the concealed passage.',
        position: { x: 430, y: 780 },
        triggers: [
          buildDemoTrigger(
            storyId,
            'confrontation',
            [id('hall')],
            [
              { interactionId: id('archive'), hasBeenVisited: true },
              { interactionId: id('garden'), hasBeenVisited: true },
            ],
          ),
        ],
      },
      {
        id: id('leave-early'),
        title: 'Close the case early',
        body: 'You leave with an incomplete theory and one wing still unexplored.',
        position: { x: 780, y: 780 },
        triggers: [
          buildDemoTrigger(
            storyId,
            'leave-without-archive',
            [id('hall')],
            [{ interactionId: id('archive'), hasBeenVisited: false }],
          ),
          buildDemoTrigger(
            storyId,
            'leave-without-garden',
            [id('hall')],
            [{ interactionId: id('garden'), hasBeenVisited: false }],
          ),
        ],
      },
    ],
  });
}
