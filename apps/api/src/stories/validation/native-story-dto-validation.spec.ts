import 'reflect-metadata';
import type { NativeStoryContent } from '@paralleax/shared';
import { validateNativeStoryDtoConstraints } from './native-story-dto-validation';

function fixture(): NativeStoryContent {
  return {
    title: 'Story',
    startDateTime: '2026-11-20T12:30',
    interactions: [
      {
        id: 'scene',
        title: 'Scene',
        body: '<p>Hello</p>',
        position: { x: 0, y: 1 },
        triggers: [{ id: 'trigger', inputInteractionIds: [], appearanceProbability: 50 }],
      },
    ],
  };
}

it('accepts valid native content without mutating it', () => {
  const story = fixture();
  const original = structuredClone(story);
  expect(validateNativeStoryDtoConstraints(story)).toBeUndefined();
  expect(story).toEqual(original);
});

it('returns the nested path for an invalid editor constraint', () => {
  const story = fixture();
  story.interactions[0].triggers[0].appearanceProbability = 101;
  expect(validateNativeStoryDtoConstraints(story)).toMatchObject({
    path: '$.story.interactions[0].triggers[0].appearanceProbability',
  });
});

it('checks the existing Story date rule', () => {
  const story = fixture();
  story.startDateTime = '2026-02-30T12:00';
  expect(validateNativeStoryDtoConstraints(story)).toMatchObject({
    path: '$.story.startDateTime',
  });
});

it('checks the existing body length limit', () => {
  const story = fixture();
  story.interactions[0].body = 'x'.repeat(64_001);
  expect(validateNativeStoryDtoConstraints(story)).toMatchObject({
    path: '$.story.interactions[0].body',
  });
});
