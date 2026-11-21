import {
  inspectNativeStoryRichText,
  sanitizeAndRemapStoryRichText,
  sanitizeRichText,
} from './rich-text';
import { remapNativeStoryContent, type NativeStoryContent } from '@paralleax/shared';

describe('native Story rich text reference remapping', () => {
  it('rewrites structured references while retaining authored text and sanitizing HTML', () => {
    const body =
      '<div data-conditional-text-target="old">' +
      '<button data-conditional-text-link="old">old</button>' +
      '<span data-interaction-link-target="old">Go</span>' +
      '<span data-stat-value="stat" data-stat-item="item">stat</span>' +
      '<span data-conditional-text-block="block">text</span>' +
      '<img src="https://example.test/old" onerror="alert(1)">' +
      '</div>';
    const result = sanitizeAndRemapStoryRichText(body, {
      interaction: new Map([['old', 'new']]),
      statAssignment: new Map([['stat', 'new-stat']]),
      itemInstance: new Map([['item', 'new-item']]),
    });
    expect(result).toContain('data-conditional-text-target="new"');
    expect(result).toContain('data-conditional-text-link="new">old</button>');
    expect(result).toContain('data-interaction-link-target="new"');
    expect(result).toContain('data-stat-value="new-stat" data-stat-item="new-item"');
    expect(result).toContain('data-conditional-text-block="block"');
    expect(result).toContain('https://example.test/old');
    expect(result).not.toContain('onerror');
  });

  it('looks up decoded HTML attribute values', () => {
    expect(
      sanitizeAndRemapStoryRichText('<span data-interaction-link-target="a&amp;b">Go</span>', {
        interaction: new Map([['a&b', 'mapped']]),
      }),
    ).toContain('data-interaction-link-target="mapped"');
  });

  it('encodes replacement identifiers as attribute data', () => {
    const result = sanitizeAndRemapStoryRichText(
      '<span data-interaction-link-target="old">Go</span>',
      {
        interaction: new Map([['old', 'x" onmouseover="alert(1)']]),
      },
    );
    expect(result).toContain('data-interaction-link-target="x&quot; onmouseover=&quot;alert(1)"');
    expect(result).not.toContain('" onmouseover="');
  });

  it('preserves already sanitized content when no IDs change', () => {
    const body = sanitizeRichText(
      '<div data-conditional-text-target="next"><span data-stat-value="score">Score</span></div>',
    );
    expect(sanitizeAndRemapStoryRichText(body, {})).toBe(body);
  });
});

it('rewrites rich text and graph references together on the copied Story', () => {
  const story: NativeStoryContent = {
    title: 'Story',
    interactions: [
      {
        id: 'source',
        title: '',
        position: { x: 0, y: 0 },
        body: '<span data-interaction-link-target="source">Continue</span>',
        triggers: [{ id: 'trigger', inputInteractionIds: ['source'] }],
      },
    ],
  };
  const result = remapNativeStoryContent(
    story,
    {
      interaction: new Map([['source', 'new-source']]),
      trigger: new Map([['trigger', 'new-trigger']]),
    },
    sanitizeAndRemapStoryRichText,
  );
  expect(result.interactions[0]).toMatchObject({
    id: 'new-source',
    triggers: [
      { id: 'new-trigger', probabilityKey: 'trigger', inputInteractionIds: ['new-source'] },
    ],
  });
  expect(result.interactions[0].body).toContain('data-interaction-link-target="new-source"');
  expect(story.interactions[0].id).toBe('source');
});

it('collects decoded structured references using the sanitizer parser', () => {
  const body =
    '<div data-conditional-text-target="a&amp;b" data-conditional-text-block="block">' +
    '<span data-stat-value="score" data-stat-item="item">Score</span>' +
    '<span data-interaction-link-target="next">Go</span></div>';
  expect(inspectNativeStoryRichText(body).references).toEqual([
    { kind: 'block', id: 'block' },
    { kind: 'interaction', id: 'a&b' },
    { kind: 'stat', id: 'score', itemId: 'item' },
    { kind: 'interaction', id: 'next' },
  ]);
});
