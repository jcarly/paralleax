import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  getAvailableInteractions,
  getJourneyStatValues,
  getTriggerConditionGroups,
} from '../packages/shared/dist/index.js';
import { readQsp } from '../packages/shared/dist/import-export/qsp/converter.js';
import { lexQspLines } from '../packages/shared/dist/import-export/qsp/lexer.js';
import { parseQspSource } from '../packages/shared/dist/import-export/qsp/parser.js';
import { mapQspLocationsToStory } from '../packages/shared/dist/import-export/qsp/mapping.js';
import { createQspImportReport } from '../packages/shared/dist/import-export/qsp/report.js';

// Local corpora stay outside version control. Build shared before running.
const path = resolve(process.argv[2]);
const buffer = readFileSync(path);
const content = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const locations = readQsp(content);
function countCalls(lines) {
  return lexQspLines(lines).reduce((sum, line) => {
    // Mask literals, including their separators, before counting command sites.
    const masked = line.replace(/'([^']|'')*'|"([^"]|"")*"/g, "''");
    return sum + [...masked.matchAll(/(?:^|[&:])\s*(?:gs|gosub)\b/gi)].length;
  }, 0);
}
const callCount = locations.reduce(
  (total, location) =>
    total +
    [location.code, ...location.actions.map((action) => action.code)].reduce(
      (count, lines) => count + countCalls(lines),
      0,
    ),
  0,
);
const issuesByCode = {};
const memoryBefore = process.memoryUsage();
const started = performance.now();
const options = {
  storyId: randomUUID(),
  timestamp: '2026-10-20T10:00:00.000Z',
  createId: randomUUID,
  maxPreviewIssues: 0,
  onIssue: (issue) => {
    issuesByCode[issue.code] = (issuesByCode[issue.code] ?? 0) + 1;
  },
};
// Inspect the same importer stages before its final error gate, so existing
// corpus errors do not hide generated graph sizes. Nothing is persisted.
const report = createQspImportReport(1, options);
const parsed = parseQspSource({ name: basename(path), format: 'binary', content }, report);
const story = mapQspLocationsToStory(parsed, basename(path), report, options);
const durationMs = Math.round(performance.now() - started);
const memoryAfter = process.memoryUsage();
const returnDefinitions = new Set(
  story.statDefinitions
    .filter((stat) => stat.name.startsWith('__qsp_return_'))
    .map((stat) => stat.id),
);
const returnStats = new Set(
  story.stats.filter((stat) => returnDefinitions.has(stat.statDefinitionId)).map((stat) => stat.id),
);
const callSites = new Map();
const destinations = new Map();
const continuations = new Map();
for (const node of story.interactions) {
  for (const effect of node.statEffects ?? []) {
    if (returnStats.has(effect.statId) && effect.operation === 'set' && effect.value) {
      const sites = callSites.get(effect.statId) ?? [];
      sites.push({ node, value: effect.value });
      callSites.set(effect.statId, sites);
    }
  }
  for (const trigger of node.triggers) {
    for (const group of getTriggerConditionGroups(trigger)) {
      if (!group.conditions.length)
        for (const input of trigger.inputInteractionIds) destinations.set(input, node);
      for (const condition of group.conditions) {
        if (
          'statId' in condition &&
          returnStats.has(condition.statId) &&
          condition.operator === 'eq'
        ) {
          continuations.set(`${condition.statId}\0${condition.value}`, node);
        }
      }
    }
  }
}
const examples = [];
let inspected = 0;
for (const [statId, sites] of callSites) {
  if (examples.length >= 3 || inspected >= 20) break;
  if (sites.length < 2) continue;
  const target = destinations.get(sites[0].node.id);
  if (!target) continue;
  inspected += 1;
  const checks = sites.slice(0, 2).map((site) => {
    const expected = continuations.get(`${statId}\0${site.value}`);
    const journey = [site.node.id, target.id];
    const available = () =>
      getAvailableInteractions(
        story,
        journey.at(-1),
        journey,
        null,
        [],
        getJourneyStatValues(story, journey),
      );
    const exit = available().find((node) => node.title.endsWith(' — Return'));
    if (exit) journey.push(exit.id);
    const eligibleIds = new Set(available().map((node) => node.id));
    return {
      caller: site.node.title,
      continuation: expected?.title,
      correctReturnEligible: eligibleIds.has(expected?.id),
      otherCallerReturnEligible: sites.some(
        (other) =>
          other.value !== site.value &&
          eligibleIds.has(continuations.get(`${statId}\0${other.value}`)?.id),
      ),
    };
  });
  if (checks.every((check) => check.correctReturnEligible && !check.otherCallerReturnEligible)) {
    examples.push({ subroutine: target.title, callers: sites.length, checks });
  }
}
console.log(
  JSON.stringify(
    {
      source: basename(path),
      sourceLocations: locations.length,
      detectedCalls: callCount,
      translatedCalls: issuesByCode.subroutine_requires_traversal ?? 0,
      interactions: story.interactions.length,
      triggers: story.interactions.reduce((sum, node) => sum + node.triggers.length, 0),
      storyAvailable: report.errorCount === 0,
      durationMs,
      memoryBefore,
      memoryAfter,
      examples,
      report,
      issuesByCode,
    },
    null,
    2,
  ),
);
