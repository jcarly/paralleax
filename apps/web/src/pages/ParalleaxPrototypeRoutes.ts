export const prototypeRoutes = {
  editor: '/prototype/paralleax',
  login: '/prototype/paralleax/login',
  register: '/prototype/paralleax/register',
  stories: '/prototype/paralleax/stories',
  designSystem: '/prototype/paralleax/design-system',
} as const;

export function prototypeStoryRoute(storyId: string) {
  return `${prototypeRoutes.editor}?story=${encodeURIComponent(storyId)}`;
}

export type PrototypeRoute =
  (typeof prototypeRoutes)[keyof typeof prototypeRoutes] | ReturnType<typeof prototypeStoryRoute>;
