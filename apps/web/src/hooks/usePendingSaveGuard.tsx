import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useBlocker, type BlockerFunction, type Location } from 'react-router-dom';
import { PendingSaveDialog } from '../components/PendingSaveDialog';

type GuardedSurface = 'editor' | 'player';

function playerSessionKey(location: Pick<Location, 'pathname' | 'search'>) {
  const params = new URLSearchParams(location.search);
  const simulation = params.get('mode') === 'simulation';
  return `${simulation ? 'simulation' : 'reader'}:${simulation ? (params.get('startInteractionId') ?? '') : ''}`;
}

export function leavesPendingSaveSurface(
  currentLocation: Pick<Location, 'pathname' | 'search'>,
  nextLocation: Pick<Location, 'pathname' | 'search'>,
  surface: GuardedSurface,
) {
  if (currentLocation.pathname !== nextLocation.pathname) {
    return true;
  }
  return (
    surface === 'player' && playerSessionKey(currentLocation) !== playerSessionKey(nextLocation)
  );
}

export function usePendingSaveGuard(shouldBlock: boolean, surface: GuardedSurface) {
  const stayButton = useRef<HTMLButtonElement>(null);
  const shouldBlockRef = useRef(shouldBlock);
  // Keep React Router's registered callback stable and current before browser input.
  useLayoutEffect(() => {
    shouldBlockRef.current = shouldBlock;
  }, [shouldBlock]);

  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) =>
        shouldBlockRef.current && leavesPendingSaveSurface(currentLocation, nextLocation, surface),
      [surface],
    ),
  );
  useEffect(() => {
    if (blocker.state === 'blocked') {
      stayButton.current?.focus();
    }
  }, [blocker.state]);

  useLayoutEffect(() => {
    if (!shouldBlock) {
      return;
    }
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => {
      window.removeEventListener('beforeunload', preventUnload);
    };
  }, [shouldBlock]);

  if (blocker.state !== 'blocked') {
    return null;
  }
  return (
    <PendingSaveDialog stayButton={stayButton} onStay={blocker.reset} onLeave={blocker.proceed} />
  );
}
