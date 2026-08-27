import type { Story } from '../../model/index.js';
import { buildDemoStory, buildDemoTrigger, demoEntityId } from '../builders.js';

export function createCharacterItemsDemoStory(storyId: string, timestamp: string): Story {
  const id = (localId: string) => demoEntityId(storyId, localId);
  const mara = id('mara');
  const courage = id('mara-courage');
  const injured = id('mara-injured');
  const lanternDefinition = id('lantern-definition');
  const mapDefinition = id('map-definition');

  return buildDemoStory(storyId, timestamp, {
    title: 'Demo 4: character stats and simple items',
    statDefinitions: [
      { id: id('courage-definition'), name: 'Courage', valueType: 'number' },
      { id: id('injured-definition'), name: 'Injured', valueType: 'boolean' },
    ],
    itemDefinitions: [
      {
        id: lanternDefinition,
        name: 'Explorer lantern',
        description: 'A reliable lantern with a protected flame.',
      },
      {
        id: mapDefinition,
        name: 'Ruins map',
        description: 'A hand-drawn plan of the upper galleries.',
      },
    ],
    characters: [
      {
        id: mara,
        name: 'Mara',
        description: 'An archaeologist preparing to enter the cliffside ruins.',
        isPlayable: true,
        stats: [
          { id: courage, statDefinitionId: id('courage-definition'), initialValue: 2 },
          { id: injured, statDefinitionId: id('injured-definition'), initialValue: false },
        ],
        items: [
          { id: id('mara-lantern'), itemDefinitionId: lanternDefinition },
          { id: id('mara-map'), itemDefinitionId: mapDefinition },
        ],
      },
    ],
    interactions: [
      {
        id: id('prepare'),
        title: 'Prepare the expedition',
        body: 'Mara can carry one tool into the unstable ruins.',
        position: { x: 600, y: 20 },
        characterIds: [mara],
        triggers: [buildDemoTrigger(storyId, 'prepare', [])],
      },
      {
        id: id('take-lantern'),
        title: 'Take the explorer lantern',
        body: 'The familiar light gives Mara confidence.',
        position: { x: 300, y: 270 },
        characterIds: [mara],
        statEffects: [{ statId: courage, operation: 'add', value: 2 }],
        itemEffects: [{ itemId: id('mara-lantern'), operation: 'obtain' }],
        triggers: [buildDemoTrigger(storyId, 'take-lantern', [id('prepare')])],
      },
      {
        id: id('take-map'),
        title: 'Take the ruins map',
        body: 'The map reveals a longer route through the upper galleries.',
        position: { x: 900, y: 270 },
        characterIds: [mara],
        itemEffects: [{ itemId: id('mara-map'), operation: 'obtain' }],
        triggers: [buildDemoTrigger(storyId, 'take-map', [id('prepare')])],
      },
      {
        id: id('entrance'),
        title: 'Enter the ruins',
        body: 'Dust drifts through the entrance chamber as the stone settles.',
        position: { x: 600, y: 510 },
        characterIds: [mara],
        triggers: [buildDemoTrigger(storyId, 'entrance', [id('take-lantern'), id('take-map')])],
      },
      {
        id: id('dark-gallery'),
        title: 'Cross the dark gallery',
        body: 'With enough courage and a lantern, Mara crosses before the ceiling shifts.',
        position: { x: 250, y: 760 },
        characterIds: [mara],
        statEffects: [{ statId: injured, operation: 'set', value: true }],
        triggers: [
          buildDemoTrigger(
            storyId,
            'dark-gallery',
            [id('entrance')],
            [
              { itemDefinitionId: lanternDefinition, isOwned: true },
              { statId: courage, operator: 'gte', value: 3 },
            ],
          ),
        ],
      },
      {
        id: id('mapped-route'),
        title: 'Follow the mapped route',
        body: 'The map leads Mara around the unstable gallery.',
        position: { x: 600, y: 760 },
        characterIds: [mara],
        statEffects: [{ statId: courage, operation: 'add', value: 1 }],
        triggers: [
          buildDemoTrigger(
            storyId,
            'mapped-route',
            [id('entrance')],
            [{ itemDefinitionId: mapDefinition, isOwned: true }],
          ),
        ],
      },
      {
        id: id('retreat'),
        title: 'Retreat from the ruins',
        body: 'Without enough confidence, Mara returns to camp.',
        position: { x: 950, y: 760 },
        characterIds: [mara],
        triggers: [
          buildDemoTrigger(
            storyId,
            'retreat',
            [id('entrance')],
            [{ statId: courage, operator: 'lt', value: 3 }],
          ),
        ],
      },
    ],
  });
}
