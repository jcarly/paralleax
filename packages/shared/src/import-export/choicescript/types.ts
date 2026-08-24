import type { Story } from '../../model/stories.js';

export interface ChoiceScriptSourceFile {
  name: string;
  content: string;
}

export type ChoiceScriptImportIssueSeverity = 'warning' | 'error';

export interface ChoiceScriptImportIssue {
  severity: ChoiceScriptImportIssueSeverity;
  code: string;
  message: string;
  fileName?: string;
  line?: number;
}

export interface ChoiceScriptImportReport {
  format: 'choicescript';
  sourceFileCount: number;
  sceneCount: number;
  interactionCount: number;
  convertedCommandCount: number;
  approximatedCommandCount: number;
  ignoredCommandCount: number;
  issues: ChoiceScriptImportIssue[];
}

export interface ChoiceScriptImportResult {
  story?: Story;
  report: ChoiceScriptImportReport;
}

export interface ChoiceScriptImportOptions {
  storyId: string;
  timestamp: string;
  createId: () => string;
}
