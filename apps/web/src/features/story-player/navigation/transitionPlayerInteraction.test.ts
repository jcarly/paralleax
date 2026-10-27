import { afterEach, describe, expect, it, vi } from 'vitest';
import { transitionPlayerInteraction } from './transitionPlayerInteraction';

const startTransitionDescriptor = Object.getOwnPropertyDescriptor(document, 'startViewTransition');
const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');

describe('transitionPlayerInteraction', () => {
  afterEach(() => {
    restoreDescriptor(document, 'startViewTransition', startTransitionDescriptor);
    restoreDescriptor(window, 'matchMedia', matchMediaDescriptor);
  });

  it('updates immediately when the browser does not support view transitions', () => {
    const update = vi.fn();
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: undefined,
    });

    transitionPlayerInteraction(update);

    expect(update).toHaveBeenCalledOnce();
  });

  it('runs the update inside a supported view transition', () => {
    const update = vi.fn();
    const startViewTransition = vi.fn((callback: () => void) => {
      callback();
      return {};
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    });

    transitionPlayerInteraction(update);

    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it('updates immediately when reduced motion is preferred', () => {
    const update = vi.fn();
    const startViewTransition = vi.fn();
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });

    transitionPlayerInteraction(update);

    expect(update).toHaveBeenCalledOnce();
    expect(startViewTransition).not.toHaveBeenCalled();
  });
});

function restoreDescriptor(
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
  } else {
    Reflect.deleteProperty(target, key);
  }
}
