import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  type QspImportProgress,
  type QspImportResult,
  type QspImportSource,
} from '@paralleax/shared';

import type { QspWorkerInput } from './qsp-import.worker-protocol.js';
import { AbortableImportWorkerService } from './abortable-import-worker.service.js';

@Injectable()
export class QspImportWorkerService extends AbortableImportWorkerService {
  private activeImports = 0;

  async run(
    source: QspImportSource,
    onProgress?: (progress: QspImportProgress) => void,
    abortSignal?: AbortSignal,
    reportPath?: string,
  ): Promise<QspImportResult> {
    if (this.activeImports >= 1) {
      throw new ServiceUnavailableException('Another QSP import is already running.');
    }
    if (!reportPath) throw new Error('A report path is required for QSP import execution.');

    this.activeImports += 1;

    try {
      const input: QspWorkerInput = {
        source,
        storyId: randomUUID(),
        timestamp: new Date().toISOString(),
        reportPath,
      };
      return await this.executeWorker(
        resolve(__dirname, 'qsp-import.worker.js'),
        input,
        {
          name: 'QSP import',
          onProgress,
          abortSignal,
          transferList: input.source.format === 'binary' ? [input.source.content] : [],
        },
      );
    } finally {
      this.activeImports -= 1;
    }
  }
}
