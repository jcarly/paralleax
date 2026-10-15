import type { ImportDiagnostics, ImportIssue, ImportReportCapture } from './types.js';

const captures = new WeakMap<ImportDiagnostics, ImportReportCapture>();

export function configureImportReport<T extends ImportDiagnostics>(
  report: T,
  capture: ImportReportCapture = {},
): T {
  captures.set(report, capture);
  return report;
}

export function addImportIssue(report: ImportDiagnostics, issue: ImportIssue): void {
  if (issue.severity === 'error') {
    report.errorCount += 1;
  } else {
    report.warningCount += 1;
  }

  const capture = captures.get(report);
  capture?.onIssue?.(issue);

  const previewLimit = capture?.maxPreviewIssues ?? Number.POSITIVE_INFINITY;
  if (report.issues.length < previewLimit) {
    report.issues.push(issue);
  }
}

export function hasImportErrors(report: ImportDiagnostics): boolean {
  return report.errorCount > 0;
}
