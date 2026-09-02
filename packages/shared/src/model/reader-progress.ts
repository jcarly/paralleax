import type { StatValue } from './stats.js';

export const READER_AUTOSAVE_ID = 'reader-autosave';
export const SIMULATION_AUTOSAVE_ID = 'simulation-autosave';
export const MAX_MANUAL_READER_SAVES = 20;
export const MAX_READER_SAVE_NAME_LENGTH = 100;

export type ReaderAutosaveMode = 'reader' | 'simulation';
export type ReaderSaveKind = 'reader-autosave' | 'simulation-autosave' | 'manual';

export interface ReaderProgressState {
  version: 1 | 2 | 3 | 4;
  /** Missing only on progress created before seeded Trigger probabilities existed. */
  randomSeed?: string;
  /**
   * One wall-clock timestamp before the first choice, then one after each journey
   * interaction. Missing only on progress created before Trigger timers existed.
   */
  stepStartedAt?: string[];
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

export interface ReaderSave extends ReaderProgress {
  id: string;
  kind: ReaderSaveKind;
  name?: string;
  createdAt: string;
}

export interface ReaderSaveSummary {
  id: string;
  kind: ReaderSaveKind;
  name?: string;
  currentInteractionId: string | null;
  journeyLength: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveReaderProgressInput {
  journeyInteractionIds: string[];
  ownedItemIds?: string[];
  randomSeed?: string;
  stepStartedAt?: string[];
}

export interface CreateReaderSaveInput extends SaveReaderProgressInput {
  name: string;
}

export type UpdateReaderSaveInput = CreateReaderSaveInput;

export function autosaveId(mode: ReaderAutosaveMode): string {
  return mode === 'simulation' ? SIMULATION_AUTOSAVE_ID : READER_AUTOSAVE_ID;
}

export function readerSaveKind(id: string): ReaderSaveKind {
  if (id === READER_AUTOSAVE_ID) return 'reader-autosave';
  if (id === SIMULATION_AUTOSAVE_ID) return 'simulation-autosave';
  return 'manual';
}
