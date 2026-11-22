import { expect, it } from 'vitest';
import { analyzeQspCode } from './analyzer.js';
import { parseQspSource } from './parser.js';
import { createQspImportReport } from './report.js';

it('keeps empty action names, images, and targets explicit', () => {
  const report = createQspImportReport();
  const locations = parseQspSource(
    {
      name: 'empty-values.qsps',
      format: 'text',
      content: [
        '# Start',
        "act '':",
        "  'Unnamed action text'",
        'end',
        "act 'Named', '':",
        "  'Named action text'",
        'end',
        '--- Start ---',
      ].join('\n'),
    },
    report,
  );
  const actions = locations.flatMap(({ actions: parsedActions }) => parsedActions);
  const analysis = analyzeQspCode(
    ["gs ''", "goto ''"],
    { fileName: 'empty-values.qsps', locationName: 'Start', line: 9 },
    report,
  );
  const issueCodes = report.issues.map(({ code }) => code);

  expect(issueCodes).toContain('dynamic_action_name');
  expect(issueCodes).toContain('dynamic_subroutine_target');
  expect(issueCodes).toContain('dynamic_navigation_target');
  expect(issueCodes).not.toContain('missing_location_target');
  expect(actions.map(({ name }) => name)).toEqual(['Named']);
  expect(actions[0]?.image).toBeUndefined();
  expect(analysis.navigationTargets).toEqual([]);
});
