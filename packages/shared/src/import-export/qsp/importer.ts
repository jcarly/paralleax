import { mapQspLocationsToStory } from './mapping.js';
import { parseQspSource } from './parser.js';
import { createQspImportReport, hasQspImportErrors } from './report.js';
import type { QspImportOptions, QspImportResult, QspImportSource } from './types.js';

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
