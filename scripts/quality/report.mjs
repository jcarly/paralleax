import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import stylelint from 'stylelint';
import { cloneCounts, scanDuplicates } from './duplicates.mjs';
import { addCount, compareCounts, flattenCounts } from './counts.mjs';

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const relative = (file) =>
  path.relative(process.cwd(), path.resolve(file)).split(path.sep).join('/');
const workspace = (file) => /^(apps|packages)\/[^/]+/.exec(file)?.[0] ?? 'root';

export function category(tool, rule) {
  if (tool === 'dependency-cruiser') {
    return 'architecture';
  }
  if (tool === 'jscpd') {
    return 'duplication';
  }
  if (/complexity|cognitive|nested|max-lines|max-params|function-length/.test(rule)) {
    return 'refactoring';
  }
  const ruleName = rule.replace(/^@typescript-eslint\//, '');
  if (
    /^(no-unsafe-|no-unnecessary-type-|no-unnecessary-condition$|no-non-null-assertion$|strict-boolean-expressions$|restrict-template-expressions$|restrict-plus-operands$|no-floating-promises$|no-misused-promises$)/.test(
      ruleName,
    )
  ) {
    return 'type-safety';
  }
  if (tool === 'stylelint') {
    return 'styles';
  }
  return 'correctness-and-maintainability';
}

export function summarize(diagnostics) {
  const groups = {};
  for (const field of ['tool', 'rule', 'file', 'workspace', 'category']) {
    groups[field] = {};
    for (const item of diagnostics) {
      const key = item[field];
      groups[field][key] = (groups[field][key] ?? 0) + 1;
    }
  }
  return groups;
}

export function fileKind(file) {
  if (/(^|\/)(__tests__|tests?|e2e)(\/|$)|\.(spec|test)\.[^/]+$/.test(file)) {
    return 'test';
  }
  if (/prototype/i.test(file)) {
    return 'prototype';
  }
  return /^(apps|packages)\/[^/]+\/src\//.test(file) ? 'production' : 'tooling';
}

// Union linked files so no two proposed batches claim the same file.
function findRoot(parent, file) {
  if (!parent.has(file)) {
    parent.set(file, file);
  }
  if (parent.get(file) !== file) {
    parent.set(file, findRoot(parent, parent.get(file)));
  }
  return parent.get(file);
}

function linkFiles(diagnostics) {
  const parent = new Map();
  const root = (file) => findRoot(parent, file);
  for (const item of diagnostics) {
    for (const file of item.files ?? [item.file]) {
      const a = root(item.file);
      const b = root(file);
      if (a !== b) {
        parent.set(b, a);
      }
    }
  }
  return root;
}

export function batches(diagnostics) {
  const root = linkFiles(diagnostics);
  const sets = new Map();
  for (const item of diagnostics) {
    const key = root(item.file);
    if (!sets.has(key)) {
      sets.set(key, { files: new Set(), diagnostics: [], categories: new Set() });
    }
    const group = sets.get(key);
    for (const file of item.files ?? [item.file]) {
      group.files.add(file);
    }
    group.diagnostics.push(item);
    group.categories.add(item.category);
  }
  return [...sets.values()]
    .map((group) => {
      const structural =
        group.categories.has('architecture') ||
        group.categories.has('duplication') ||
        group.categories.has('refactoring');
      return {
        files: [...group.files].sort(),
        count: group.diagnostics.length,
        categories: [...group.categories].sort(),
        fileKinds: [...new Set([...group.files].map(fileKind))].sort(),
        potential: group.diagnostics.length,
        risk: structural ? 'higher: structural change' : 'moderate: behavior review',
        cost: structural ? 'higher: structural review' : 'lower: provisional',
        structural,
        fixable: group.diagnostics.some(
          (item) => item.fixable !== null && item.fixable !== undefined,
        )
          ? group.diagnostics.filter((item) => item.fixable === true).length
          : null,
        fixabilityNotEvaluated: group.diagnostics.filter(
          (item) => typeof item.fixable !== 'boolean',
        ).length,
      };
    })
    .sort(
      (a, b) =>
        Number(a.structural) - Number(b.structural) ||
        (b.fixable ?? 0) - (a.fixable ?? 0) ||
        b.potential - a.potential ||
        a.files[0].localeCompare(b.files[0]),
    );
}

function lintGroups(groups, empty) {
  return groups.flatMap((group) => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/eslint/bin/eslint.js',
        ...group,
        '--format',
        'json',
        '--suppressions-location',
        empty,
      ],
      { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
    );
    if (result.error || ![0, 1].includes(result.status)) {
      throw result.error ?? new Error(result.stderr || `ESLint exited ${result.status}`);
    }
    return JSON.parse(result.stdout).flatMap((file) =>
      file.messages.map((message) => {
        if (!message.ruleId) {
          throw new Error(`ESLint failed to parse ${file.filePath}: ${message.message}`);
        }
        return diagnostic('eslint', relative(file.filePath), message.ruleId, {
          line: message.line,
          column: message.column,
          message: message.message,
          fixable: Boolean(message.fix),
          severity: message.severity,
        });
      }),
    );
  });
}

export function runEslint(groups = eslintGroups()) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'paralleax-report-'));
  try {
    const empty = path.join(dir, 'suppressions.json');
    writeFileSync(empty, '{}');
    return lintGroups(groups, empty);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function eslintGroups() {
  return [
    ['apps/api'],
    ['apps/web'],
    ['apps/mcp'],
    ['packages/shared'],
    [
      '.',
      '--ignore-pattern',
      'apps/api/**',
      '--ignore-pattern',
      'apps/web/**',
      '--ignore-pattern',
      'apps/mcp/**',
      '--ignore-pattern',
      'packages/shared/**',
    ],
  ];
}

function diagnostic(tool, file, rule, details) {
  return {
    tool,
    file,
    workspace: workspace(file),
    rule,
    category: category(tool, rule),
    ...details,
  };
}

export async function runStylelint(files = glob('apps/web/src/**/*.css')) {
  const diagnostics = [];
  for await (const file of files) {
    const result = await stylelint.lint({
      code: readFileSync(file, 'utf8'),
      codeFilename: path.resolve(file),
      configFile: path.resolve('stylelint.config.mjs'),
    });
    const output = result.results[0];
    if (output.parseErrors.length) {
      throw new Error(`Stylelint failed to parse ${file}`);
    }
    for (const warning of output.warnings) {
      diagnostics.push(
        diagnostic('stylelint', file, warning.rule, {
          line: warning.line,
          column: warning.column,
          message: warning.text,
          fixable: null,
          severity: warning.severity,
        }),
      );
    }
  }
  return diagnostics;
}

export function compareBaseline(diagnostics, tool, baseline) {
  const actual = {};
  for (const item of diagnostics.filter((entry) => entry.tool === tool)) {
    addCount(actual, item.file, item.rule);
  }
  const accepted = flattenCounts(baseline);
  return {
    accepted: [...accepted.values()].reduce((sum, count) => sum + count, 0),
    ...compareCounts(flattenCounts(actual), accepted),
  };
}

function baselineSummary(diagnostics, clones) {
  return {
    eslint: compareBaseline(diagnostics, 'eslint', read('eslint-suppressions.json')),
    stylelint: compareBaseline(diagnostics, 'stylelint', read('stylelint-suppressions.json')),
    dependencyCruiser: { accepted: read('.dependency-cruiser-known-violations.json').length },
    jscpd: {
      ...compareCounts(
        flattenCounts(cloneCounts(clones)),
        flattenCounts(read('.duplication-baseline.json')),
      ),
      accepted: [...flattenCounts(read('.duplication-baseline.json')).values()].reduce(
        (sum, count) => sum + count,
        0,
      ),
    },
  };
}

export async function collect() {
  const diagnostics = [...runEslint(), ...(await runStylelint())];
  for (const entry of read('.dependency-cruiser-known-violations.json')) {
    const files = [
      ...new Set([entry.from, entry.to, ...(entry.cycle ?? []).map((item) => item.name)]),
    ].sort();
    diagnostics.push({
      ...diagnostic('dependency-cruiser', entry.from, entry.rule.name, {
        message: entry.type,
        fixable: false,
        severity: entry.rule.severity,
      }),
      files,
    });
  }
  const clones = scanDuplicates();
  for (const clone of clones.duplicates) {
    const files = [
      ...new Set([relative(clone.firstFile.name), relative(clone.secondFile.name)]),
    ].sort();
    diagnostics.push({
      ...diagnostic('jscpd', files[0], 'clone', {
        message: `${clone.tokens} tokens`,
        fixable: false,
      }),
      files,
      locations: [clone.firstFile, clone.secondFile].map((f) => ({
        file: relative(f.name),
        start: f.start,
        end: f.end,
      })),
    });
  }
  diagnostics.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule),
  );
  return {
    baselines: baselineSummary(diagnostics, clones),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    diagnostics,
    groups: summarize(diagnostics),
    batches: batches(diagnostics),
  };
}

function groupSections(report) {
  return [
    '## Workspaces',
    '',
    ...Object.entries(report.groups.workspace)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## Most frequent rules',
    '',
    ...Object.entries(report.groups.rule)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## Categories',
    '',
    ...Object.entries(report.groups.category)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => `- ${key}: ${value}`),
    '',
  ];
}

export function markdown(report) {
  const lines = [
    '# Quality debt inventory',
    '',
    `Revision: ${report.revision}`,
    '',
    'Generated by `npm run quality:report`. Counts are opportunities, not estimates of difficulty. Lint diagnostics include unsuppressed findings; baseline counts do not identify individual historical findings. Dependency entries come from the baseline; clones come from the current scanner.',
    '',
    '## Baselines',
    '',
    ...Object.entries(report.baselines ?? {}).map(
      ([name, info]) =>
        `- ${name}: ${info.accepted} accepted; ${info.growth?.length ?? 'not checked'} growing and ${info.stale?.length ?? 'not checked'} stale file/rule or clone keys`,
    ),
    '',
    '## By tool',
    '',
    ...Object.entries(report.groups.tool).map(([key, value]) => `- ${key}: ${value}`),
    '',
    ...groupSections(report),
    '## Candidate file-disjoint batches',
    '',
    'Ranked provisionally by structural risk and cost, then automatic-fix opportunities and finding count as potential. These are heuristics, not effort estimates; inspect before assignment. Different files can still share semantic dependencies; coordinate shared interfaces and tests. Codex and Claude Code can each take one independent batch after review.',
    '',
    '| Rank | Files | Kinds | Findings | Categories | Fixable | Risk | Cost |',
    '| --- | --- | --- | ---: | --- | --- | --- | --- |',
  ];
  report.batches
    .slice(0, 20)
    .forEach((batch, index) =>
      lines.push(
        `| ${index + 1} | ${batch.files.map((file) => `\`${file}\``).join('<br>')} | ${batch.fileKinds.join(', ')} | ${batch.count} | ${batch.categories.join(', ')} | ${batch.fixable ?? 'not evaluated'}${batch.fixable !== null && batch.fixabilityNotEvaluated ? ` (${batch.fixabilityNotEvaluated} not evaluated)` : ''} | ${batch.risk} | ${batch.cost} |`,
      ),
    );
  lines.push('', 'The JSON contains all candidate batches and per-file findings.');
  return `${lines.join('\n')}\n`;
}

export function writeReport(report, directory = 'quality-reports') {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, 'quality-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  writeFileSync(path.join(directory, 'quality-report.md'), markdown(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  writeReport(await collect());
  console.log('Wrote quality-reports/quality-report.md and quality-reports/quality-report.json');
}
