import { describe, expect, it } from 'vitest';
import { buildFeedbackHiddenFields, describeFeedbackRoute } from './feedbackContext';

describe('feedback context', () => {
  it.each([
    ['/stories/story-secret/edit', '/stories/:storyId/edit', 'editor'],
    ['/stories/story-secret/play', '/stories/:storyId/play', 'player'],
    ['/stories/story-secret/access/', '/stories/:storyId/access', 'story-access'],
    ['/', '/', 'story-library'],
    ['/stories', '/stories', 'story-library'],
    ['/login', '/login', 'authentication'],
    ['/admin/users', '/admin/*', 'administration'],
    ['/unexpected', '/unexpected', 'other'],
  ])('normalizes %s without exposing a story id', (pathname, route, surface) => {
    expect(describeFeedbackRoute(pathname)).toEqual({ route, surface });
  });

  it('builds only the documented non-content hidden fields', () => {
    expect(
      buildFeedbackHiddenFields('/stories/story-1/edit', 'fr', { width: 1440, height: 900 }),
    ).toEqual({
      paralleax_route: '/stories/:storyId/edit',
      paralleax_surface: 'editor',
      paralleax_version: '0.1.0',
      paralleax_viewport: '1440x900',
      paralleax_language: 'fr',
    });
  });
});
