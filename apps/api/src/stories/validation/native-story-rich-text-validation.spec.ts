import type { Story } from '@paralleax/shared';
import { validateNativeStoryRichText } from './native-story-rich-text-validation';

function story(body: string): Story {
  return {
    id: 'story',
    title: 'Story',
    createdAt: '',
    updatedAt: '',
    statDefinitions: [{ id: 'definition', name: 'Energy', valueType: 'number' }],
    itemDefinitions: [
      {
        id: 'battery-def',
        name: 'Battery',
        description: '',
        stats: [{ id: 'charge', statDefinitionId: 'definition', initialValue: 1 }],
      },
    ],
    characters: [
      {
        id: 'person',
        name: 'Person',
        description: '',
        items: [{ id: 'battery', itemDefinitionId: 'battery-def' }],
      },
    ],
    interactions: [
      {
        id: 'scene',
        title: '',
        body,
        position: { x: 0, y: 0 },
        conditionalTextBlocks: [
          { id: 'block', conditions: [{ interactionId: 'scene', hasBeenVisited: true }] },
        ],
        triggers: [],
      },
    ],
  };
}

it('accepts safe references and harmless sanitizer additions used by existing imports', () => {
  const source = story(
    '<div data-conditional-text-block="block"><span data-stat-value="charge" data-stat-item="battery"></span><span data-interaction-link-target="scene">Go</span></div>',
  );
  expect(validateNativeStoryRichText(source)).toBeUndefined();
});

it('rejects unsafe tags, attributes and URL schemes before importing', () => {
  for (const body of [
    '<script>alert(1)</script>',
    '<p onclick="alert(1)">text</p>',
    '<a href="javascript:alert(1)">link</a>',
    '<!--comment--><p>text</p>',
  ]) {
    expect(validateNativeStoryRichText(story(body))).toMatchObject({
      code: 'UNSUPPORTED_CONTENT',
      path: '$.story.interactions[0].body',
    });
  }
});

it('rejects missing links, conditional blocks and stat targets', () => {
  for (const body of [
    '<span data-interaction-link-target="missing">Go</span>',
    '<div data-conditional-text-block="missing">text</div>',
    '<span data-stat-value="missing">text</span>',
    '<span data-stat-value="charge" data-stat-item="missing">text</span>',
    '<span data-stat-item="battery">text</span>',
  ]) {
    expect(validateNativeStoryRichText(story(body))).toMatchObject({
      code: 'MISSING_REFERENCE',
      path: '$.story.interactions[0].body',
    });
  }
});
