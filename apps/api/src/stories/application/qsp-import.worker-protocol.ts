import type { QspImportProgress, QspImportResult, QspImportSource } from '@paralleax/shared';
import type { ImportWorkerMessage } from './abortable-import-worker.service.js';

export interface QspWorkerInput {
  source: QspImportSource;
  storyId: string;
  timestamp: string;
  reportPath: string;
}

export type QspWorkerMessage = ImportWorkerMessage<QspImportProgress, QspImportResult>;
