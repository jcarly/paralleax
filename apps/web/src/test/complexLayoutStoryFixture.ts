import type { Story, Trigger } from '@paralleax/shared';
import { createLargeEditorStoryFixture } from './largeEditorStoryFixture';

const interactionId = (index: number) => `interaction-${index}`;
const stageCount = 12;
const stageSize = 8;
const longRangeLinks = [
  { source: 6, target: 8 },
  { source: 20, target: 25 },
  { source: 10, target: 27 },
  { source: 18, target: 58 },
];
const cycles = [
  [16, 17, 20, 22, 23, 16],
  [40, 41, 44, 46, 47, 48, 49, 52, 54, 55, 40],
  [80, 81, 84, 86, 87, 80],
];

/** Stable motif identities let tests and saved diagnostics explain the topology. */
export const complexLayoutStoryMotifs = {
  interactionCount: 100,
  stages: Array.from({ length: stageCount }, (_, index) => {
    const base = index * stageSize;
    return {
      entryId: interactionId(base),
      childIds: [1, 2, 3].map((offset) => interactionId(base + offset)),
      multiInput: {
        targetId: interactionId(base + 5),
        triggerId: `trigger-${base + 5}`,
        sourceIds: [interactionId(base + 2), interactionId(base + 3)],
      },
      alternativeTriggers: {
        targetId: interactionId(base + 6),
        triggerIds: [`trigger-${base + 6}-left`, `trigger-${base + 6}-right`],
      },
    };
  }),
  longRangeLinks: longRangeLinks.map(({ source, target }) => ({
    sourceId: interactionId(source),
    targetId: interactionId(target),
    triggerId: `trigger-skip-${source}-${target}`,
    indexDistance: target - source,
  })),
  cycles: cycles.map((path) => path.map(interactionId)),
  selfLoop: {
    interactionId: interactionId(72),
    triggerId: 'trigger-self-72',
  },
  sameInputVariants: {
    sourceId: interactionId(12),
    targetId: interactionId(14),
    triggerIds: ['trigger-14-left', 'trigger-14-alternative'],
  },
  disconnectedInteractionIds: [96, 97, 98, 99].map(interactionId),
};

/**
 * A reproducible layout stress story, not a production demo or a planar fixture.
 * Twelve branching stages reconnect through both multi-input and independent
 * Triggers. Sparse shortcuts, return paths, a self-loop, and a disconnected
 * island exercise routing without turning the fixture into an all-to-all graph.
 * Content and context vary so browser checks use different measured card sizes.
 */
export function createComplexLayoutStoryFixture(): Story {
  const story = createLargeEditorStoryFixture(100, { contextCount: 4 });
  story.title = 'Complex automatic layout benchmark';
  story.startDateTime = '2026-09-24T08:00';
  const sceneTitles = [
    'Arrival',
    'Follow the signal through the abandoned observatory',
    'Take the lower path',
    'Inspect the sealed archive before the next meeting',
    'A clue',
    'Compare the accounts collected along the two routes',
    'The routes converge',
    'Return to the checkpoint and choose the next destination',
  ];
  const bodies = [
    '',
    '<p>A short pause.</p>',
    '<p>The next passage is open. Record what changed before continuing.</p>',
    '<p>The station clock has stopped. A distant signal repeats while the crew compares the notes recovered along separate paths.</p><p>Choose which lead to follow next.</p>',
  ];
  for (const [index, interaction] of story.interactions.entries()) {
    interaction.title = `${index + 1}. ${sceneTitles[index % sceneTitles.length]}`;
    interaction.body = bodies[index % bodies.length]!;
    // Twenty tightly packed slots intentionally overlap and ignore story order.
    interaction.position = scrambledPosition(index);
    interaction.locationId = index % 3 === 0 ? null : `location-${index % 4}`;
    interaction.characterIds = Array.from(
      { length: index % 5 },
      (_, offset) => `character-${(index + offset) % 4}`,
    );
    interaction.triggers = [];
  }

  let triggerIndex = 0;
  const addTrigger = (target: number, sources: number[], id: string): Trigger => {
    const trigger: Trigger = {
      id,
      inputInteractionIds: sources.map(interactionId),
      conditionGroups: [{ id: `${id}-group`, conditions: [] }],
      appearanceProbability: 100,
      timerSeconds: null,
      ...(sources.length > 0 ? { position: scrambledPosition(triggerIndex + 7) } : {}),
    };
    triggerIndex += 1;
    story.interactions[target]!.triggers.push(trigger);
    return trigger;
  };

  for (let stage = 0; stage < stageCount; stage += 1) {
    const base = stage * stageSize;
    addTrigger(base, stage === 0 ? [] : [base - 1], `trigger-${base}`);
    for (const offset of [1, 2, 3]) {
      addTrigger(base + offset, [base], `trigger-${base + offset}`);
    }
    addTrigger(base + 4, [base + 1], `trigger-${base + 4}`);
    addTrigger(base + 5, [base + 2, base + 3], `trigger-${base + 5}`);
    addTrigger(base + 6, [base + 4], `trigger-${base + 6}-left`);
    addTrigger(base + 6, [base + 5], `trigger-${base + 6}-right`);
    addTrigger(base + 7, [base + 6], `trigger-${base + 7}`);
  }
  addTrigger(96, [], 'trigger-96');
  addTrigger(97, [96], 'trigger-97');
  addTrigger(98, [96], 'trigger-98');
  addTrigger(99, [97, 98], 'trigger-99');

  for (const { source, target } of longRangeLinks) {
    addTrigger(target, [source], `trigger-skip-${source}-${target}`);
  }
  for (const path of cycles) {
    const source = path[path.length - 2]!;
    const target = path[0]!;
    addTrigger(target, [source], `trigger-return-${source}-${target}`);
  }
  addTrigger(72, [72], complexLayoutStoryMotifs.selfLoop.triggerId);
  const alternative = addTrigger(14, [12], 'trigger-14-alternative');
  alternative.appearanceProbability = 65;
  alternative.conditionGroups![0]!.conditions.push({
    interactionId: interactionId(5),
    hasBeenVisited: true,
  });
  return story;
}

function scrambledPosition(index: number) {
  const slot = (index * 37) % 20;
  return { x: 100 + (slot % 5) * 58, y: 80 + Math.floor(slot / 5) * 45 };
}
