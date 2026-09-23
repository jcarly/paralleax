import {
  canDeleteCommentThread,
  canManageCommentThread,
  commentAnchorBelongsToStory,
  commentAnchorLabel,
  isCommentAnchor,
  isCommentAnchorDetached,
  locateCommentQuote,
  type CommentTextSelector,
  type Story,
} from './index.js';
import { describe, expect, it } from 'vitest';

const story: Story = {
  id: 'story-1',
  title: 'Story',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  interactions: [
    {
      id: 'interaction-1',
      title: 'Arrival',
      body: 'The old harbor is quiet tonight.',
      position: { x: 10, y: 20 },
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    },
  ],
  characters: [{ id: 'character-1', name: 'Mira', description: 'An investigator.' }],
};

describe('comment anchors', () => {
  const selector: CommentTextSelector = {
    exact: 'harbor',
    prefix: 'The old ',
    suffix: ' is quiet',
    start: 8,
    end: 14,
    sourceHash: 'source-1',
  };

  it('validates same-story entity and text anchors', () => {
    expect(isCommentAnchor({ kind: 'canvas', position: { x: 1, y: 2 } })).toBe(true);
    expect(
      isCommentAnchor({ kind: 'entity', targetType: 'character', targetId: 'character-1' }),
    ).toBe(true);
    expect(
      isCommentAnchor({
        kind: 'text',
        targetType: 'interaction',
        targetId: 'interaction-1',
        field: 'body',
        selector,
      }),
    ).toBe(true);
    expect(isCommentAnchor(null)).toBe(false);
    expect(isCommentAnchor({ kind: 'canvas', position: { x: Number.NaN, y: 2 } })).toBe(false);
    expect(isCommentAnchor({ kind: 'entity', targetType: 'unknown', targetId: 'id' })).toBe(false);
    expect(isCommentAnchor({ kind: 'entity', targetType: 'character', targetId: '' })).toBe(false);
    expect(isCommentAnchor({ kind: 'text', targetType: 'interaction', targetId: 'id' })).toBe(
      false,
    );
    expect(
      isCommentAnchor({
        kind: 'text',
        targetType: 'interaction',
        targetId: 'id',
        field: 'unknown',
        selector,
      }),
    ).toBe(false);
    expect(
      commentAnchorBelongsToStory(story, {
        kind: 'entity',
        targetType: 'trigger',
        targetId: 'trigger-1',
      }),
    ).toBe(true);
    expect(
      commentAnchorBelongsToStory(story, {
        kind: 'entity',
        targetType: 'location',
        targetId: 'other-story-location',
      }),
    ).toBe(false);
    expect(
      commentAnchorBelongsToStory(story, {
        kind: 'text',
        targetType: 'interaction',
        targetId: 'interaction-1',
        field: 'body',
        selector,
      }),
    ).toBe(true);
  });

  it('rejects malformed text selectors at every public boundary', () => {
    const anchor = (selectorOverride: Record<string, unknown>) => ({
      kind: 'text',
      targetType: 'interaction',
      targetId: 'interaction-1',
      field: 'body',
      selector: { ...selector, ...selectorOverride },
    });

    expect(isCommentAnchor(anchor({ exact: '' }))).toBe(false);
    expect(isCommentAnchor(anchor({ exact: 'x'.repeat(1_001) }))).toBe(false);
    expect(isCommentAnchor(anchor({ prefix: 1 }))).toBe(false);
    expect(isCommentAnchor(anchor({ prefix: 'x'.repeat(129) }))).toBe(false);
    expect(isCommentAnchor(anchor({ suffix: 1 }))).toBe(false);
    expect(isCommentAnchor(anchor({ suffix: 'x'.repeat(129) }))).toBe(false);
    expect(isCommentAnchor(anchor({ start: 0.5 }))).toBe(false);
    expect(isCommentAnchor(anchor({ end: 1.5 }))).toBe(false);
    expect(isCommentAnchor(anchor({ start: -1 }))).toBe(false);
    expect(isCommentAnchor(anchor({ end: 0 }))).toBe(false);
    expect(isCommentAnchor(anchor({ sourceHash: 1 }))).toBe(false);
    expect(isCommentAnchor(anchor({ sourceHash: 'x'.repeat(129) }))).toBe(false);
  });

  it('reattaches a quote through its surrounding context after text moves', () => {
    expect(locateCommentQuote('Later, The old harbor is quiet tonight.', selector)).toEqual({
      start: 15,
      end: 21,
    });
  });

  it('reattaches an unambiguous quote when its immediate context changes', () => {
    expect(locateCommentQuote('A weathered harbor remains.', selector)).toEqual({
      start: 12,
      end: 18,
    });
  });

  it('marks missing or ambiguous text anchors as detached', () => {
    const moved = structuredClone(story);
    moved.interactions[0].body = 'The harbor and another harbor are busy.';
    expect(
      isCommentAnchorDetached(moved, {
        kind: 'text',
        targetType: 'interaction',
        targetId: 'interaction-1',
        field: 'body',
        selector: { ...selector, prefix: '', suffix: '' },
      }),
    ).toBe(true);
    expect(isCommentAnchorDetached(story, { kind: 'canvas', position: { x: 0, y: 0 } })).toBe(
      false,
    );
    expect(
      isCommentAnchorDetached(story, {
        kind: 'entity',
        targetType: 'character',
        targetId: 'character-1',
      }),
    ).toBe(false);
    expect(
      isCommentAnchorDetached(story, {
        kind: 'entity',
        targetType: 'character',
        targetId: 'missing',
      }),
    ).toBe(true);
  });

  it('produces stable labels for canvas, entity, text, and missing targets', () => {
    expect(commentAnchorLabel(story, { kind: 'canvas', position: { x: 0, y: 0 } })).toBe(
      'Story graph',
    );
    expect(
      commentAnchorLabel(story, {
        kind: 'entity',
        targetType: 'interaction',
        targetId: 'interaction-1',
      }),
    ).toBe('Arrival');
    expect(
      commentAnchorLabel(story, {
        kind: 'entity',
        targetType: 'character',
        targetId: 'character-1',
      }),
    ).toBe('Mira');
    expect(
      commentAnchorLabel(story, {
        kind: 'entity',
        targetType: 'location',
        targetId: 'missing',
      }),
    ).toBe('missing');
    expect(
      commentAnchorLabel(story, {
        kind: 'text',
        targetType: 'interaction',
        targetId: 'interaction-1',
        field: 'body',
        selector,
      }),
    ).toContain('Arrival:');
  });

  it('does not attach text fields that the target type does not own', () => {
    expect(
      commentAnchorBelongsToStory(story, {
        kind: 'text',
        targetType: 'character',
        targetId: 'character-1',
        field: 'body',
        selector,
      }),
    ).toBe(false);
    expect(
      commentAnchorBelongsToStory(story, {
        kind: 'text',
        targetType: 'interaction',
        targetId: 'interaction-1',
        field: 'name',
        selector,
      }),
    ).toBe(false);
    expect(
      isCommentAnchorDetached(story, {
        kind: 'text',
        targetType: 'character',
        targetId: 'character-1',
        field: 'title',
        selector,
      }),
    ).toBe(true);
  });

  it('does not guess between repeated quotes without unique context', () => {
    expect(locateCommentQuote('harbor then harbor', { ...selector, prefix: '', suffix: '' })).toBe(
      undefined,
    );
    expect(locateCommentQuote('nothing here', selector)).toBe(undefined);
  });

  it('matches text anchors against the visible text of rich interaction bodies', () => {
    const richStory = structuredClone(story);
    richStory.interactions[0].body = '<p>visible &amp; selected</p>';

    expect(
      isCommentAnchorDetached(richStory, {
        kind: 'text',
        targetType: 'interaction',
        targetId: 'interaction-1',
        field: 'body',
        selector: {
          exact: 'visible & selected',
          prefix: '',
          suffix: '',
          start: 0,
          end: 18,
          sourceHash: 'source-2',
        },
      }),
    ).toBe(false);
  });

  it('decodes supported HTML entities without accepting invalid numeric code points', () => {
    const richStory = structuredClone(story);
    richStory.interactions[0].body =
      '<p>A&nbsp;&amp;&lt;&gt;&quot;&#39;&apos;&#65;&#x42;&#99999999;</p>';

    expect(
      isCommentAnchorDetached(richStory, {
        kind: 'text',
        targetType: 'interaction',
        targetId: 'interaction-1',
        field: 'body',
        selector: {
          exact: "A &<>\"''AB&#99999999;",
          prefix: '',
          suffix: '',
          start: 0,
          end: 21,
          sourceHash: 'source-3',
        },
      }),
    ).toBe(false);
  });

  it('lets story managers, editors, and the creator manage a comment thread', () => {
    const thread = { createdBy: { id: 'creator-1', displayName: 'Creator' } };

    expect(canManageCommentThread({ canManage: true, canEdit: false }, 'manager-1', thread)).toBe(
      true,
    );
    expect(canManageCommentThread({ canManage: false, canEdit: true }, 'editor-1', thread)).toBe(
      true,
    );
    expect(canManageCommentThread({ canManage: false, canEdit: false }, 'creator-1', thread)).toBe(
      true,
    );
    expect(canManageCommentThread({ canManage: false, canEdit: false }, 'reader-1', thread)).toBe(
      false,
    );
    expect(canManageCommentThread(undefined, undefined, thread)).toBe(false);
  });

  it('limits thread deletion and restoration to the author or a Story manager', () => {
    const thread = { createdBy: { id: 'creator-1', displayName: 'Creator' } };

    expect(canDeleteCommentThread({ canManage: true }, 'manager-1', thread)).toBe(true);
    expect(canDeleteCommentThread({ canManage: false }, 'creator-1', thread)).toBe(true);
    expect(canDeleteCommentThread({ canManage: false }, 'editor-1', thread)).toBe(false);
    expect(canDeleteCommentThread(undefined, undefined, thread)).toBe(false);
  });
});
