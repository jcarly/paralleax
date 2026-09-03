import type { Story } from '../../model/stories.js';

export type QspSourceFormat = 'binary' | 'text';

export interface QspImportSource {
  name: string;
  format: QspSourceFormat;
  content: ArrayBuffer | string;
}

export type QspImportIssueSeverity = 'warning' | 'error';

export interface QspImportIssue {
  severity: QspImportIssueSeverity;
  code: string;
  message: string;
  fileName?: string;
  locationName?: string;
  line?: number;
}

export type QspFeatureId =
  | 'locations'
  | 'text_output'
  | 'actions'
  | 'navigation'
  | 'variables'
  | 'conditions'
  | 'subroutines'
  | 'local_jumps'
  | 'loops'
  | 'dynamic_code'
  | 'inventory'
  | 'media_and_ui'
  | 'runtime_events'
  | 'saves_and_input'
  | 'libraries';

export type QspFeatureSupport = 'supported' | 'partial' | 'unsupported';

export interface QspFeatureCoverage {
  feature: QspFeatureId;
  support: QspFeatureSupport;
  occurrences: number;
}

export interface QspImportReport {
  format: 'qsp';
  sourceFileCount: 1;
  locationCount: number;
  actionCount: number;
  interactionCount: number;
  convertedStatementCount: number;
  approximatedStatementCount: number;
  unsupportedStatementCount: number;
  coverage: QspFeatureCoverage[];
  issues: QspImportIssue[];
}

export interface QspImportResult {
  story?: Story;
  report: QspImportReport;
}

export interface QspImportOptions {
  storyId: string;
  timestamp: string;
  createId: () => string;
}
