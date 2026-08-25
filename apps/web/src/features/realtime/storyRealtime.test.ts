import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api';
import {
  isApiNotFound,
  isRealtimeEditableTarget,
  prioritizeStoryRealtimeInvalidation,
  type StoryRealtimeInvalidation,
} from './storyRealtime';

describe('story realtime helpers', () => {
  it.each<{
    current: StoryRealtimeInvalidation | undefined;
    incoming: StoryRealtimeInvalidation;
    expected: StoryRealtimeInvalidation;
  }>([
    { current: undefined, incoming: 'ready', expected: 'ready' },
    { current: 'ready', incoming: 'changed', expected: 'changed' },
    { current: 'changed', incoming: 'ready', expected: 'changed' },
    { current: 'changed', incoming: 'deleted', expected: 'deleted' },
    { current: 'deleted', incoming: 'ready', expected: 'deleted' },
  ])('prioritizes $expected over $current and $incoming', ({ current, incoming, expected }) => {
    expect(prioritizeStoryRealtimeInvalidation(current, incoming)).toBe(expected);
  });

  it('recognizes only API-style 404 errors as not found', () => {
    expect(isApiNotFound(new ApiError('Missing', 404))).toBe(true);
    expect(isApiNotFound(new ApiError('Failure', 500))).toBe(false);
    expect(isApiNotFound(new Error('Missing'))).toBe(false);
    expect(isApiNotFound({ status: 404 })).toBe(false);
  });

  it('recognizes controls and editable content without matching ordinary elements', () => {
    const input = document.createElement('input');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const plain = document.createElement('div');

    expect(isRealtimeEditableTarget(input)).toBe(true);
    expect(isRealtimeEditableTarget(editable)).toBe(true);
    expect(isRealtimeEditableTarget(plain)).toBe(false);
    expect(isRealtimeEditableTarget(null)).toBe(false);
  });
});
