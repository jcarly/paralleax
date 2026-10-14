export type ImportFormat = 'choicescript' | 'qsp';

export type ImportIssueSeverity = 'warning' | 'error';

export interface ImportIssue {
  severity: ImportIssueSeverity;
  code: string;
  message: string;
  fileName?: string;
  locationName?: string;
  line?: number;
  /** Whether `line` is a physical text-file line or a decoded location-code offset. */
  lineKind?: 'text' | 'location-code';
}

export interface ImportDiagnostics {
  warningCount: number;
  errorCount: number;
  issues: ImportIssue[];
}

export interface ImportReportCapture {
  onIssue?: (issue: ImportIssue) => void;
  maxPreviewIssues?: number;
}

export type ImportPhase =
  'uploading' | 'decoding' | 'parsing' | 'mapping' | 'saving' | 'finalizing';

export interface ImportProgress {
  phase: ImportPhase;
  completed?: number;
  total?: number;
  currentFile?: string;
}
