import { describe, expect, it, vi } from 'vitest';
import { addImportIssue, configureImportReport, hasImportErrors } from './report.js';
import type { ImportDiagnostics, ImportIssue } from './types.js';

function createReport(): ImportDiagnostics {
  return { warningCount: 0, errorCount: 0, issues: [] };
}

describe('common import report', () => {
  it('counts and captures every issue while limiting the in-memory preview', () => {
    const report = createReport();
    const capture = vi.fn();
    configureImportReport(report, { onIssue: capture, maxPreviewIssues: 1 });
    const warning: ImportIssue = {
      severity: 'warning',
      code: 'warning',
      message: 'A warning',
    };
    const error: ImportIssue = {
      severity: 'error',
      code: 'error',
      message: 'An error',
    };

    addImportIssue(report, warning);
    addImportIssue(report, error);

    expect(report).toEqual({ warningCount: 1, errorCount: 1, issues: [warning] });
    expect(capture).toHaveBeenNthCalledWith(1, warning);
    expect(capture).toHaveBeenNthCalledWith(2, error);
    expect(hasImportErrors(report)).toBe(true);
  });

  it('keeps every diagnostic by default and supports an empty preview', () => {
    const report = createReport();
    const issue: ImportIssue = {
      severity: 'warning',
      code: 'warning',
      message: 'A warning',
    };
    addImportIssue(report, issue);
    expect(report.issues).toEqual([issue]);
    expect(hasImportErrors(report)).toBe(false);

    const emptyPreview = configureImportReport(createReport(), { maxPreviewIssues: 0 });
    addImportIssue(emptyPreview, issue);
    expect(emptyPreview).toMatchObject({ warningCount: 1, errorCount: 0, issues: [] });
  });
});
