export const prototypeRoutes = {
  editor: '/prototype/paralleax',
  login: '/prototype/paralleax/login',
  register: '/prototype/paralleax/register',
  stories: '/prototype/paralleax/stories',
  designSystem: '/prototype/paralleax/design-system',
} as const;

export type PrototypeRoute = (typeof prototypeRoutes)[keyof typeof prototypeRoutes];
