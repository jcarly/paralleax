import type {
  ChoiceScriptImportOptions,
  ChoiceScriptImportResult,
  ChoiceScriptSourceFile,
} from '@paralleax/shared';
import type { ImportWorkerMessage } from './abortable-import-worker.service.js';

export interface ChoiceScriptWorkerInput
  extends Pick<ChoiceScriptImportOptions, 'storyId' | 'timestamp'> {
  files: ChoiceScriptSourceFile[];
  reportPath: string;
}

export type ChoiceScriptWorkerMessage = ImportWorkerMessage<never, ChoiceScriptImportResult>;