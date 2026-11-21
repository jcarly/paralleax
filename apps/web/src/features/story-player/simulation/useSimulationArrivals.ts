import { useCallback, useState } from 'react';

/**
 * How the Simulation reached an Interaction: as its starting point, or as one of
 * `count` options. The Simulation loads only a slice of the graph, so it records
 * this when the author chooses instead of deriving it from the whole Story.
 */
export type SimulationArrival = 'start' | { optionCount: number };

export interface SimulationArrivals {
  get: (interactionId: string, journeyIndex: number) => SimulationArrival | undefined;
  record: (interactionId: string, arrival: SimulationArrival) => void;
}

/** Session memory only: nothing is stored, and a reload falls back to neutral labels. */
export function useSimulationArrivals(): SimulationArrivals {
  const [arrivals, setArrivals] = useState<ReadonlyMap<string, SimulationArrival>>(() => new Map());
  const record = useCallback((interactionId: string, arrival: SimulationArrival) => {
    setArrivals((previous) => new Map(previous).set(interactionId, arrival));
  }, []);
  const get = useCallback(
    (interactionId: string, journeyIndex: number) =>
      arrivals.get(interactionId) ?? (journeyIndex === 0 ? 'start' : undefined),
    [arrivals],
  );
  return { get, record };
}
