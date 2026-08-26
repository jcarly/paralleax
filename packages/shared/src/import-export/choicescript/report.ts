import type { SourceLine } from './models.js';
import type { ChoiceScriptImportIssue, ChoiceScriptImportReport } from './types.js';

export function createChoiceScriptImportReport(sourceFileCount: number): ChoiceScriptImportReport {
  return {
    format: 'choicescript',
    sourceFileCount,
    sceneCount: 0,
    interactionCount: 0,
    convertedCommandCount: 0,
    approximatedCommandCount: 0,
    ignoredCommandCount: 0,
    issues: [],
  };
}

export function hasChoiceScriptImportErrors(report: ChoiceScriptImportReport) {
  return report.issues.some(({ severity }) => severity === 'error');
}

export function addChoiceScriptImportIssue(
  report: ChoiceScriptImportReport,
  issue: ChoiceScriptImportIssue,
) {
  report.issues.push(issue);
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
