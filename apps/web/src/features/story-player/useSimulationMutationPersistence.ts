import { useCallback, useEffect, useRef, useState } from 'react';

export type SimulationMutationStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SimulationMutationOptions {
  retryable?: boolean;
}

export function useSimulationMutationPersistence({
  storyId,
  fallbackError,
}: {
  storyId: string;
  fallbackError: string;
}) {
  const [status, setStatus] = useState<SimulationMutationStatus>('idle');
  const [error, setError] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const activeCountRef = useRef(0);
  const latestAttemptRef = useRef(0);
  const latestOutcomeRef = useRef<SimulationMutationStatus>('idle');
  const retryRef = useRef<(() => void) | undefined>(undefined);

  const run = useCallback(
    async function persist<T>(
      operation: () => Promise<T>,
      applyResult: (result: T) => void,
      options: SimulationMutationOptions = {},
    ): Promise<void> {
      const attempt = ++latestAttemptRef.current;
      activeCountRef.current += 1;
      latestOutcomeRef.current = 'saving';
      retryRef.current = undefined;
      setCanRetry(false);
      setError('');
      setStatus('saving');
      try {
        const result = await operation();
        applyResult(result);
        if (attempt === latestAttemptRef.current) {
          latestOutcomeRef.current = 'saved';
          retryRef.current = undefined;
          setCanRetry(false);
        }
      } catch (caught: unknown) {
        if (attempt === latestAttemptRef.current) {
          latestOutcomeRef.current = 'error';
          setError(caught instanceof Error ? caught.message : fallbackError);
          if (options.retryable !== false) {
            retryRef.current = () => void persist(operation, applyResult, options);
            setCanRetry(true);
          }
        }
      } finally {
        activeCountRef.current = Math.max(0, activeCountRef.current - 1);
        if (activeCountRef.current === 0) setStatus(latestOutcomeRef.current);
      }
    },
    [fallbackError],
  );

  const retry = useCallback(() => {
    retryRef.current?.();
  }, []);

  const hasActiveMutations = useCallback(() => activeCountRef.current > 0, []);

  const clear = useCallback(() => {
    latestAttemptRef.current += 1;
    latestOutcomeRef.current = 'idle';
    retryRef.current = undefined;
    setCanRetry(false);
    setError('');
    setStatus('idle');
  }, []);

  useEffect(() => {
    clear();
  }, [clear, storyId]);

  return { status, error, canRetry, hasActiveMutations, run, retry, clear };
}
