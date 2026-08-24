import type { StatValue } from './stats.js';

export interface ReaderProgressState {
  version: 1 | 2;
  journeyInteractionIds: string[];
  currentInteractionId: string | null;
  visitedInteractionIds: string[];
  currentDateTime: string;
  currentLocationId: string | null;
  statValues: Record<string, StatValue>;
  ownedItemIds: string[];
  itemStatValues?: Record<string, Record<string, StatValue>>;
}

export interface ReaderProgress {
  state: ReaderProgressState;
  updatedAt: string;
}

export interface SaveReaderProgressInput {
  journeyInteractionIds: string[];
  ownedItemIds?: string[];
}
