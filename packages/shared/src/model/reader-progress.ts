export interface ReaderProgressState {
  version: 1;
  journeyInteractionIds: string[];
  currentInteractionId: string | null;
  visitedInteractionIds: string[];
  currentDateTime: string;
  currentLocationId: string | null;
  statValues: Record<string, number>;
  ownedItemIds: string[];
  itemStatValues?: Record<string, Record<string, number>>;
}

export interface ReaderProgress {
  state: ReaderProgressState;
  updatedAt: string;
}

export interface SaveReaderProgressInput {
  journeyInteractionIds: string[];
  ownedItemIds?: string[];
}
