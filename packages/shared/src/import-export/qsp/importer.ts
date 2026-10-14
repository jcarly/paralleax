import { mapQspLocationsToStory } from './mapping.js';
import { parseQspSource } from './parser.js';
import { addQspImportIssue, createQspImportReport, hasQspImportErrors } from './report.js';
import type { QspImportOptions, QspImportResult, QspImportSource } from './types.js';

/**
 * Preserves the normal QSP report contract when an execution boundary cannot
 * complete the import. Source-specific parsing failures are reported by
 * `importQsp`; this fallback is for infrastructure failures such as a worker
 * process exiting unexpectedly.
 */
export function createQspImportFailureResult(source: QspImportSource): QspImportResult {
  const report = createQspImportReport(source.format === 'locations' ? source.content.length : 1);
  addQspImportIssue(report, {
    severity: 'error',
    code: 'import_execution_failed',
    message: 'The QSP import could not complete its source analysis.',
    fileName: source.name,
  });
  return { report };
}

export function importQsp(source: QspImportSource, options: QspImportOptions): QspImportResult {
  const report = createQspImportReport(source.format === 'locations' ? source.content.length : 1);

  options.onProgress?.({
    phase: 'decoding',
    completed: 0,
    total: source.format === 'locations' ? source.content.length : 1,
  });

  const locations = parseQspSource(source, report, options.onProgress);

  if (locations.length === 0 || hasQspImportErrors(report)) {
    return { report };
  }

  // Phase 3 : mapping
  options.onProgress?.({
    phase: 'mapping',
    completed: 0,
    total: locations.length,
  });

  const story = mapQspLocationsToStory(locations, source.name, report, options);

  options.onProgress?.({
    phase: 'mapping',
    completed: locations.length,
    total: locations.length,
  });

  return hasQspImportErrors(report) ? { report } : { story, report };
}
