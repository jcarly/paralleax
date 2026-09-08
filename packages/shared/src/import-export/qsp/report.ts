import type { QspSourcePosition } from './models.js';
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
const MAX_DETAILED_WARNINGS = 2_000;
const detailedWarningCounts = new WeakMap<QspImportReport, number>();

export function createQspImportReport(sourceFileCount = 1): QspImportReport {
  const report: QspImportReport = {
    format: 'qsp',
    sourceFileCount,
    locationCount: 0,
    actionCount: 0,
    interactionCount: 0,
    convertedStatementCount: 0,
    approximatedStatementCount: 0,
    unsupportedStatementCount: 0,
    omittedWarningCount: 0,
    coverage: FEATURE_SUPPORT.map(([feature, support]) => ({ feature, support, occurrences: 0 })),
    issues: [],
  };
  detailedWarningCounts.set(report, 0);
  return report;
}

export function hasQspImportErrors(report: QspImportReport) {
  return report.issues.some(({ severity }) => severity === 'error');
}

export function touchQspFeature(report: QspImportReport, feature: QspFeatureId, count = 1) {
  const coverage = report.coverage.find((candidate) => candidate.feature === feature);
  if (coverage) coverage.occurrences += count;
}

export function addQspImportIssue(report: QspImportReport, issue: QspImportIssue) {
  if (issue.severity === 'warning') {
    const warningCount = detailedWarningCounts.get(report) ?? 0;
    if (warningCount >= MAX_DETAILED_WARNINGS) {
      report.omittedWarningCount = (report.omittedWarningCount ?? 0) + 1;
      return;
    }
    detailedWarningCounts.set(report, warningCount + 1);
  }
  report.issues.push(issue);
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
  });
}
