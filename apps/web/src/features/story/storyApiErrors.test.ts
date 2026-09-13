import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api';
import { hasApiStatus, isStoryRouteInaccessibleError } from './storyApiErrors';

describe('Story API error helpers', () => {
  it('recognizes only Error instances carrying one of the requested statuses', () => {
    expect(hasApiStatus(new ApiError('Missing', 404), 404)).toBe(true);
    expect(hasApiStatus(new ApiError('Forbidden', 403), 403, 404)).toBe(true);
    expect(hasApiStatus(new ApiError('Failure', 500), 403, 404)).toBe(false);
    expect(hasApiStatus(new Error('Missing'), 404)).toBe(false);
    expect(hasApiStatus({ status: 404 }, 404)).toBe(false);
  });

  it('treats forbidden and hidden Story routes as inaccessible without swallowing failures', () => {
    expect(isStoryRouteInaccessibleError(new ApiError('Forbidden', 403))).toBe(true);
    expect(isStoryRouteInaccessibleError(new ApiError('Story not found', 404))).toBe(true);
    expect(isStoryRouteInaccessibleError(new ApiError('API unavailable', 503))).toBe(false);
  });
});
