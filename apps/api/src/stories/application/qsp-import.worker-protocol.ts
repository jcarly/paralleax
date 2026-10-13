import type { QspImportProgress, QspImportResult, QspImportSource } from '@paralleax/shared';

export interface QspWorkerInput {
  source: QspImportSource;
  storyId: string;
  timestamp: string;
}

export type QspWorkerMessage =
  | {
      type: 'progress';
      progress: QspImportProgress;
    }
  | {
      type: 'result';
      result: QspImportResult;
    }
  | {
      type: 'error';
      message: string;
    };
