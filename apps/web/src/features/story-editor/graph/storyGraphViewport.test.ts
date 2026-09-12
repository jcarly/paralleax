import { describe, expect, it } from 'vitest';
import { createLargeEditorStoryFixture } from '../../../test/largeEditorStoryFixture';
import { getInitialStoryFitViewOptions } from './storyGraphViewport';

describe('large Story initial viewport', () => {
  it('fits the complete graph while the Story remains reasonably sized', () => {
    expect(getInitialStoryFitViewOptions(createLargeEditorStoryFixture(250))).toEqual({
      padding: 0.18,
      maxZoom: 1,
    });
  });

  it('opens a large Story around its entry interactions', () => {
    const story = createLargeEditorStoryFixture(600);
    story.interactions[1].triggers = [
      { id: 'second-root', inputInteractionIds: [], conditions: [] },
    ];

    expect(getInitialStoryFitViewOptions(story)).toEqual({
      padding: 0.7,
      maxZoom: 1,
      nodes: [{ id: 'interaction-0' }, { id: 'interaction-1' }],
    });
  });

  it('falls back to the first interaction when a large Story has no root trigger', () => {
    const story = createLargeEditorStoryFixture(600);
    story.interactions[0].triggers = [];

    expect(getInitialStoryFitViewOptions(story).nodes).toEqual([{ id: 'interaction-0' }]);
  });
});
