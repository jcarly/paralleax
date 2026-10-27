import { flushSync } from 'react-dom';

export function transitionPlayerInteraction(update: () => void): void {
  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (!document.startViewTransition || prefersReducedMotion) {
    update();
    return;
  }

  document.startViewTransition(() => flushSync(update));
}
