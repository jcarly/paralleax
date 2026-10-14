import type { Story } from '../../model/stories.js';
import type {
  ImportDiagnostics,
  ImportIssue,
  ImportIssueSeverity,
  ImportReportCapture,
} from '../common/types.js';

export interface ChoiceScriptSourceFile {
  name: string;
  content: string;
}

export type ChoiceScriptImportIssueSeverity = ImportIssueSeverity;

export type ChoiceScriptImportIssue = ImportIssue;

export interface ChoiceScriptImportReport extends ImportDiagnostics {
  format: 'choicescript';
  sourceFileCount: number;
  sceneCount: number;
  interactionCount: number;
  convertedCommandCount: number;
  approximatedCommandCount: number;
  ignoredCommandCount: number;
}

export interface ChoiceScriptImportResult {
  story?: Story;
  report: ChoiceScriptImportReport;
}

export interface ChoiceScriptImportOptions extends ImportReportCapture {
  storyId: string;
  timestamp: string;
  createId: () => string;
}
