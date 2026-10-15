import type { Story } from '../../model/stories.js';
import type {
  ImportDiagnostics,
  ImportIssue,
  ImportIssueSeverity,
  ImportProgress,
  ImportReportCapture,
} from '../common/types.js';

export type QspSourceFormat = 'binary' | 'text' | 'locations';

export interface QspLocationSourceFile {
  name: string;
  content: string;
}

interface QspBinaryImportSource {
  name: string;
  format: 'binary';
  content: ArrayBuffer;
}

interface QspTextImportSource {
  name: string;
  format: 'text';
  content: string;
}

interface QspLocationsImportSource {
  name: string;
  format: 'locations';
  content: QspLocationSourceFile[];
}

export type QspImportSource =
  QspBinaryImportSource | QspTextImportSource | QspLocationsImportSource;

export type QspImportIssueSeverity = ImportIssueSeverity;

export type QspImportIssue = ImportIssue;

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

export interface QspImportReport extends ImportDiagnostics {
  format: 'qsp';
  sourceFileCount: number;
  locationCount: number;
  actionCount: number;
  interactionCount: number;
  convertedStatementCount: number;
  approximatedStatementCount: number;
  unsupportedStatementCount: number;
  coverage: QspFeatureCoverage[];
}

export interface QspImportResult {
  story?: Story;
  report: QspImportReport;
}

export type QspImportPhase = Exclude<ImportProgress['phase'], 'uploading' | 'finalizing'>;

export interface QspImportProgress extends Omit<ImportProgress, 'phase' | 'completed'> {
  phase: QspImportPhase;
  completed: number;
}

export interface QspImportOptions extends ImportReportCapture {
  storyId: string;
  timestamp: string;
  createId: () => string;

  onProgress?: (progress: QspImportProgress) => void;
}
