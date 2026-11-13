import type { Story } from '@paralleax/shared';
import { UnprocessableEntityException } from '@nestjs/common';
import {
  assertStoryWithinQuotas,
  DEFAULT_STORY_QUOTAS,
  measureStoryQuotaUsage,
  storyQuotasFromEnvironment,
  type StoryQuotaResource,
} from './story-quotas';

const baseStory = (): Story => ({
  id: 'story',
  title: 'Story',
  interactions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const interaction = (id: string) => ({
  id,
  title: id,
  body: '',
  position: { x: 0, y: 0 },
  triggers: [],
});

const item = (id: string) => ({ id, itemDefinitionId: 'definition' });
const stat = (id: string) => ({ id, statDefinitionId: 'stat', initialValue: 0 });

const resources: Record<Exclude<StoryQuotaResource, 'serializedBytes'>, () => Story> = {
  interactions: () => ({ ...baseStory(), interactions: [interaction('a'), interaction('b')] }),
  triggers: () => ({
    ...baseStory(),
    interactions: [
      {
        ...interaction('a'),
        triggers: [
          { id: 'a', inputInteractionIds: [] },
          { id: 'b', inputInteractionIds: [] },
        ],
      },
    ],
  }),
  characters: () => ({
    ...baseStory(),
    characters: [
      { id: 'a', name: 'A', description: '' },
      { id: 'b', name: 'B', description: '' },
    ],
  }),
  locations: () => ({
    ...baseStory(),
    locations: [
      { id: 'a', name: 'A', description: '' },
      { id: 'b', name: 'B', description: '' },
    ],
  }),
  statDefinitions: () => ({
    ...baseStory(),
    statDefinitions: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
  }),
  statAssignments: () => ({
    ...baseStory(),
    stats: [stat('a')],
    characters: [{ id: 'character', name: 'Character', description: '', stats: [stat('b')] }],
  }),
  itemDefinitions: () => ({
    ...baseStory(),
    itemDefinitions: [
      { id: 'a', name: 'A', description: '' },
      { id: 'b', name: 'B', description: '' },
    ],
  }),
  itemInstances: () => ({
    ...baseStory(),
    characters: [{ id: 'character', name: 'Character', description: '', items: [item('a')] }],
    locations: [{ id: 'location', name: 'Location', description: '', items: [item('b')] }],
  }),
  groups: () => ({
    ...baseStory(),
    groups: [
      { id: 'a', title: 'A', interactionIds: [] },
      { id: 'b', title: 'B', interactionIds: [] },
    ],
  }),
  graphDecorations: () => ({
    ...baseStory(),
    graphDecorations: [
      { id: 'a', kind: 'frame', position: { x: 0, y: 0 }, color: '#000', width: 120, height: 80 },
      { id: 'b', kind: 'frame', position: { x: 0, y: 0 }, color: '#000', width: 120, height: 80 },
    ],
  }),
};

const quotaResourceCases = [
  ['interactions', resources.interactions],
  ['triggers', resources.triggers],
  ['characters', resources.characters],
  ['locations', resources.locations],
  ['statDefinitions', resources.statDefinitions],
  ['statAssignments', resources.statAssignments],
  ['itemDefinitions', resources.itemDefinitions],
  ['itemInstances', resources.itemInstances],
  ['groups', resources.groups],
  ['graphDecorations', resources.graphDecorations],
] as const satisfies readonly (readonly [
  Exclude<StoryQuotaResource, 'serializedBytes'>,
  () => Story,
])[];

it('uses the documented default ceilings', () => {
  expect(DEFAULT_STORY_QUOTAS).toEqual({
    interactions: 2_000,
    triggers: 8_000,
    characters: 1_000,
    locations: 1_000,
    statDefinitions: 2_000,
    statAssignments: 8_000,
    itemDefinitions: 2_000,
    itemInstances: 10_000,
    groups: 1_000,
    graphDecorations: 2_000,
    serializedBytes: 32 * 1024 * 1024,
  });
});

it('accepts 2,000 Interactions and rejects the 2,001st', () => {
  const story = {
    ...baseStory(),
    interactions: Array.from({ length: 2_000 }, (_, index) => interaction(String(index))),
  };
  expect(() => assertStoryWithinQuotas(story)).not.toThrow();
  story.interactions.push(interaction('extra'));
  expectQuotaExceeded(() => assertStoryWithinQuotas(story), {
    resource: 'interactions',
    limit: 2_000,
    current: 0,
    attempted: 2_001,
  });
});

it.each(quotaResourceCases)(
  'allows the exact %s ceiling and rejects the next entity',
  (resource, makeStory) => expectQuotaResourceBoundary(resource, makeStory),
);

it('counts UTF-8 bytes exactly and excludes response-only projections', () => {
  const story = { ...baseStory(), title: 'é', owner: { id: 'owner', displayName: 'X' } };
  const bytes =
    Buffer.byteLength(JSON.stringify(baseStory()), 'utf8') -
    Buffer.byteLength('Story', 'utf8') +
    Buffer.byteLength('é', 'utf8');
  expect(measureStoryQuotaUsage(story).serializedBytes).toBe(bytes);
  expect(() =>
    assertStoryWithinQuotas(story, undefined, {
      ...DEFAULT_STORY_QUOTAS,
      serializedBytes: bytes,
    }),
  ).not.toThrow();
  expect(() =>
    assertStoryWithinQuotas(story, undefined, {
      ...DEFAULT_STORY_QUOTAS,
      serializedBytes: bytes - 1,
    }),
  ).toThrow();
});

it('allows an existing over-limit Story to remain stable or shrink, but not grow', () => {
  const current = resources.interactions();
  const quotas = { ...DEFAULT_STORY_QUOTAS, interactions: 1 };
  expect(() =>
    assertStoryWithinQuotas({ ...current, title: 'New title' }, current, quotas),
  ).not.toThrow();
  expect(() =>
    assertStoryWithinQuotas(
      { ...current, interactions: [current.interactions[0]] },
      current,
      quotas,
    ),
  ).not.toThrow();
  expect(() =>
    assertStoryWithinQuotas(
      { ...current, interactions: [...current.interactions, interaction('c')] },
      current,
      quotas,
    ),
  ).toThrow();
});

it('accepts valid environment overrides and rejects invalid limits', () => {
  expect(
    storyQuotasFromEnvironment({ PARALLEAX_STORY_QUOTA_ITEM_INSTANCES: '12' }).itemInstances,
  ).toBe(12);
  expect(() => storyQuotasFromEnvironment({ PARALLEAX_STORY_QUOTA_INTERACTIONS: '0' })).toThrow();
});

function expectQuotaResourceBoundary(
  resource: Exclude<StoryQuotaResource, 'serializedBytes'>,
  makeStory: () => Story,
) {
  const story = makeStory();
  const quotas = { ...DEFAULT_STORY_QUOTAS, [resource]: 2 };
  expect(measureStoryQuotaUsage(story)[resource]).toBe(2);
  expect(() => assertStoryWithinQuotas(story, undefined, quotas)).not.toThrow();
  const exceeded = { ...quotas, [resource]: 1 };
  expectQuotaExceeded(() => assertStoryWithinQuotas(story, undefined, exceeded), {
    resource,
    limit: 1,
    current: 0,
    attempted: 2,
  });
}

function expectQuotaExceeded(
  attempt: () => void,
  details: { resource: StoryQuotaResource; limit: number; current: number; attempted: number },
) {
  const thrown = captureError(attempt);
  expect(thrown).toBeInstanceOf(UnprocessableEntityException);
  if (!(thrown instanceof UnprocessableEntityException)) {
    return;
  }
  expect(thrown.getResponse()).toEqual(
    expect.objectContaining({ code: 'STORY_QUOTA_EXCEEDED', details }),
  );
}

function captureError(attempt: () => void): unknown {
  try {
    attempt();
  } catch (error: unknown) {
    return error;
  }
}
