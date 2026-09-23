import { isApiErrorLike } from '../../apiErrorMessages';

export function hasApiStatus(caught: unknown, ...statuses: number[]): boolean {
  return isApiErrorLike(caught) && statuses.includes(caught.status);
}

export function isStoryRouteInaccessibleError(caught: unknown): boolean {
  return hasApiStatus(caught, 403, 404);
}
