import { paralleaxVersion } from './feedbackConfig';

export type FeedbackSurface =
  | 'administration'
  | 'authentication'
  | 'editor'
  | 'other'
  | 'player'
  | 'story-access'
  | 'story-library';

interface ViewportSize {
  height: number;
  width: number;
}

export function describeFeedbackRoute(pathname: string): {
  route: string;
  surface: FeedbackSurface;
} {
  const storyRoute = pathname.match(/^\/stories\/[^/]+\/(edit|play|access)\/?$/);
  if (storyRoute) {
    const section = storyRoute[1];
    return {
      route: `/stories/:storyId/${section}`,
      surface: section === 'edit' ? 'editor' : section === 'play' ? 'player' : 'story-access',
    };
  }

  if (pathname === '/' || pathname === '/stories') {
    return { route: pathname, surface: 'story-library' };
  }
  if (pathname === '/login' || pathname === '/register') {
    return { route: pathname, surface: 'authentication' };
  }
  if (pathname.startsWith('/admin/')) {
    return { route: '/admin/*', surface: 'administration' };
  }
  return { route: pathname, surface: 'other' };
}

export function buildFeedbackHiddenFields(
  pathname: string,
  language: string,
  viewport: ViewportSize = { width: window.innerWidth, height: window.innerHeight },
): Record<string, string> {
  const { route, surface } = describeFeedbackRoute(pathname);
  return {
    paralleax_route: route,
    paralleax_surface: surface,
    paralleax_version: paralleaxVersion,
    paralleax_viewport: `${viewport.width}x${viewport.height}`,
    paralleax_language: language,
  };
}
