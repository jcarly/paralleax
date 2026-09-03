import { mapQspLocationsToStory } from './mapping.js';
import { parseQspSource } from './parser.js';
import { createQspImportReport, hasQspImportErrors } from './report.js';
import type { QspImportOptions, QspImportResult, QspImportSource } from './types.js';

export function importQsp(source: QspImportSource, options: QspImportOptions): QspImportResult {
  const report = createQspImportReport();
  const locations = parseQspSource(source, report);
  if (locations.length === 0 || hasQspImportErrors(report)) return { report };
  const story = mapQspLocationsToStory(locations, source.name, report, options);
  return hasQspImportErrors(report) ? { report } : { story, report };
}
