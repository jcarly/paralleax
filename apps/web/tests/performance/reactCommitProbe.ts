import type { Page } from '@playwright/test';

export interface ReactCommitSnapshot {
  commits: number;
  renderedFibers: number;
}

export async function installReactCommitProbe(page: Page) {
  await page.addInitScript(() => {
    interface FiberNode {
      alternate: FiberNode | null;
      child: FiberNode | null;
      sibling: FiberNode | null;
      memoizedProps: unknown;
      memoizedState: unknown;
    }

    interface FiberRoot {
      current?: FiberNode;
    }

    const metrics: ReactCommitSnapshot = { commits: 0, renderedFibers: 0 };
    const renderers = new Map<number, unknown>();
    let nextRendererId = 0;
    const hook = {
      renderers,
      supportsFiber: true,
      inject: (renderer: unknown) => {
        const rendererId = nextRendererId;
        nextRendererId += 1;
        renderers.set(rendererId, renderer);
        return rendererId;
      },
      onScheduleFiberRoot: () => undefined,
      onCommitFiberRoot: (_rendererId: number, root: FiberRoot) => {
        metrics.commits += 1;
        if (!root.current) return;

        // A changed memoized props/state identity is the same test React DevTools
        // uses to distinguish work rendered in the current commit from bailed-out work.
        const pending = [root.current];
        while (pending.length > 0) {
          const fiber = pending.pop()!;
          const previous = fiber.alternate;
          if (
            previous === null ||
            fiber.memoizedProps !== previous.memoizedProps ||
            fiber.memoizedState !== previous.memoizedState
          ) {
            metrics.renderedFibers += 1;
          }
          if (fiber.sibling) pending.push(fiber.sibling);
          if (fiber.child) pending.push(fiber.child);
        }
      },
      onCommitFiberUnmount: () => undefined,
    };
    Object.defineProperty(window, '__PARALLEAX_REACT_COMMIT_METRICS__', { value: metrics });
    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', { value: hook });
  });
}

export async function readReactCommitSnapshot(page: Page): Promise<ReactCommitSnapshot> {
  return page.evaluate(() => {
    const metrics = (
      window as typeof window & {
        __PARALLEAX_REACT_COMMIT_METRICS__?: ReactCommitSnapshot;
      }
    ).__PARALLEAX_REACT_COMMIT_METRICS__;
    if (!metrics)
      throw new Error('The React commit probe was not installed before application load.');
    return { ...metrics };
  });
}

export function reactCommitDifference(
  after: ReactCommitSnapshot,
  before: ReactCommitSnapshot,
): ReactCommitSnapshot {
  return {
    commits: after.commits - before.commits,
    renderedFibers: after.renderedFibers - before.renderedFibers,
  };
}
