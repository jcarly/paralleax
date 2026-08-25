import {
  canManageCommentThread,
  commentAnchorBelongsToStory,
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

  it('lets story managers, editors, and the creator manage a comment thread', () => {
    const thread = { createdBy: { id: 'creator-1', email: 'creator@example.com' } };

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
});
