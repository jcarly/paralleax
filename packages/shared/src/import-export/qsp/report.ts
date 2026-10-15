import type { QspSourcePosition } from './models.js';
import { addImportIssue, configureImportReport, hasImportErrors } from '../common/report.js';
import type { ImportReportCapture } from '../common/types.js';
import type { QspFeatureId, QspFeatureSupport, QspImportIssue, QspImportReport } from './types.js';

const FEATURE_SUPPORT: ReadonlyArray<[QspFeatureId, QspFeatureSupport]> = [
  ['locations', 'supported'],
  ['text_output', 'partial'],
  ['actions', 'partial'],
  ['navigation', 'partial'],
  ['variables', 'partial'],
  ['conditions', 'partial'],
  ['subroutines', 'unsupported'],
  ['local_jumps', 'unsupported'],
  ['loops', 'unsupported'],
  ['dynamic_code', 'unsupported'],
  ['inventory', 'unsupported'],
  ['media_and_ui', 'unsupported'],
  ['runtime_events', 'unsupported'],
  ['saves_and_input', 'unsupported'],
  ['libraries', 'unsupported'],
];

export function createQspImportReport(
  sourceFileCount = 1,
  capture: ImportReportCapture = {},
): QspImportReport {
  return configureImportReport(
    {
      format: 'qsp',
      sourceFileCount,
      locationCount: 0,
      actionCount: 0,
      interactionCount: 0,
      convertedStatementCount: 0,
      approximatedStatementCount: 0,
      unsupportedStatementCount: 0,
      coverage: FEATURE_SUPPORT.map(([feature, support]) => ({ feature, support, occurrences: 0 })),
      warningCount: 0,
      errorCount: 0,
      issues: [],
    },
    capture,
  );
}

export function hasQspImportErrors(report: QspImportReport): boolean {
  return hasImportErrors(report);
}

export function touchQspFeature(report: QspImportReport, feature: QspFeatureId, count = 1) {
  const coverage = report.coverage.find((candidate) => candidate.feature === feature);
  if (coverage) coverage.occurrences += count;
}

export function addQspImportIssue(report: QspImportReport, issue: QspImportIssue) {
  addImportIssue(report, issue);
}

export function addQspSourceIssue(
  report: QspImportReport,
  source: QspSourcePosition,
  code: string,
  message: string,
  severity: QspImportIssue['severity'] = 'warning',
) {
  addQspImportIssue(report, {
    severity,
    code,
    message,
    fileName: source.fileName,
    locationName: source.locationName,
    line: source.line,
    ...(source.lineKind ? { lineKind: source.lineKind } : {}),
  });
}
