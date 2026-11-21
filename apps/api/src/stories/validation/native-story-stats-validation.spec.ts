import type { Story } from '@paralleax/shared';
import { validateNativeStoryStats } from './native-story-stats-validation';

function story(): Story {
  return {
    id: 'story',
    title: 'Story',
    createdAt: '',
    updatedAt: '',
    interactions: [],
    statDefinitions: [{ id: 'definition', name: 'Score', valueType: 'number' }],
    stats: [{ id: 'score', statDefinitionId: 'definition', initialValue: 1 }],
    characters: [
      {
        id: 'person',
        name: 'Person',
        description: '',
        stats: [{ id: 'person-score', statDefinitionId: 'definition', initialValue: 2 }],
      },
    ],
  };
}

it('reuses stat operations without modifying the source', () => {
  const source = story();
  const before = structuredClone(source);
  expect(validateNativeStoryStats(source)).toBeUndefined();
  expect(source).toEqual(before);
});

it('rejects a value that does not match the stat type', () => {
  const source = story();
  if (!source.stats) {
    throw new Error('Missing fixture stats');
  }
  source.stats[0].initialValue = 'not numeric';
  expect(validateNativeStoryStats(source)).toMatchObject({ path: '$.story.stats[0]' });
});

it('rejects foreign definitions and duplicate owner assignments', () => {
  const source = story();
  const assignments = source.characters?.[0].stats;
  if (!assignments) {
    throw new Error('Missing fixture stats');
  }
  assignments[0].statDefinitionId = 'missing';
  expect(validateNativeStoryStats(source)).toMatchObject({
    path: '$.story.characters[0].stats[0]',
  });
  assignments[0].statDefinitionId = 'definition';
  assignments.push({ id: 'another', statDefinitionId: 'definition', initialValue: 3 });
  expect(validateNativeStoryStats(source)).toMatchObject({
    path: '$.story.characters[0].stats[1]',
  });
});
