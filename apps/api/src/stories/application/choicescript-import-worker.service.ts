import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { resolve } from 'node:path';

import type {
  ChoiceScriptImportOptions,
  ChoiceScriptImportResult,
  ChoiceScriptSourceFile,
} from '@paralleax/shared';

import type { ChoiceScriptWorkerInput } from './choicescript-import.worker-protocol.js';
import { AbortableImportWorkerService } from './abortable-import-worker.service.js';

@Injectable()
export class ChoiceScriptImportWorkerService extends AbortableImportWorkerService {
  private activeImports = 0;

  async run(
    files: ChoiceScriptSourceFile[],
    options: Pick<ChoiceScriptImportOptions, 'storyId' | 'timestamp'>,
    abortSignal?: AbortSignal,
    reportPath?: string,
  ): Promise<ChoiceScriptImportResult> {
    if (this.activeImports >= 1) {
      throw new ServiceUnavailableException('Another ChoiceScript import is already running.');
    }
    if (!reportPath)
      throw new Error('A report path is required for ChoiceScript import execution.');

    this.activeImports += 1;
    try {
      const input: ChoiceScriptWorkerInput = {
        files,
        storyId: options.storyId,
        timestamp: options.timestamp,
        reportPath,
      };
      return await this.executeWorker(resolve(__dirname, 'choicescript-import.worker.js'), input, {
        name: 'ChoiceScript import',
        abortSignal,
      });
    } finally {
      this.activeImports -= 1;
    }
  }
}
