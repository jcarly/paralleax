import type { SourceLine } from './models.js';
import { addImportIssue, configureImportReport, hasImportErrors } from '../common/report.js';
import type { ImportReportCapture } from '../common/types.js';
import type { ChoiceScriptImportIssue, ChoiceScriptImportReport } from './types.js';

export function createChoiceScriptImportReport(
  sourceFileCount: number,
  capture: ImportReportCapture = {},
): ChoiceScriptImportReport {
  return configureImportReport(
    {
      format: 'choicescript',
      sourceFileCount,
      sceneCount: 0,
      interactionCount: 0,
      convertedCommandCount: 0,
      approximatedCommandCount: 0,
      ignoredCommandCount: 0,
      warningCount: 0,
      errorCount: 0,
      issues: [],
    },
    capture,
  );
}

export function hasChoiceScriptImportErrors(report: ChoiceScriptImportReport): boolean {
  return hasImportErrors(report);
}

export function addChoiceScriptImportIssue(
  report: ChoiceScriptImportReport,
  issue: ChoiceScriptImportIssue,
) {
  addImportIssue(report, issue);
}

export function addChoiceScriptSourceIssue(
  report: ChoiceScriptImportReport,
  source: SourceLine,
  code: string,
  message: string,
  severity: ChoiceScriptImportIssue['severity'] = 'warning',
) {
  addChoiceScriptImportIssue(report, {
    severity,
    code,
    message,
    fileName: source.fileName,
    line: source.number,
  });
}
