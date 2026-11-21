import { describe, expect, it } from 'vitest';
import { checkNativeStoryEnvelope, NATIVE_STORY_FORMAT } from './native-story.js';

describe('native Story envelope', () => {
  it('identifies the supported envelope without claiming its content is valid', () => {
    const story = { arbitrary: 'content still needs validation' };
    expect(checkNativeStoryEnvelope({ format: NATIVE_STORY_FORMAT, version: 1, story })).toEqual({
      status: 'supported',
      story,
    });
  });

  it('distinguishes unsupported versions from malformed envelopes', () => {
    expect(checkNativeStoryEnvelope({ format: NATIVE_STORY_FORMAT, version: 2 })).toEqual({
      status: 'unsupported_version',
      version: 2,
    });
    for (const value of [
      null,
      [],
      {},
      { format: NATIVE_STORY_FORMAT, version: '1' },
      { format: NATIVE_STORY_FORMAT, version: 1, story: [] },
    ]) {
      expect(checkNativeStoryEnvelope(value)).toEqual({ status: 'invalid' });
    }
  });
});
