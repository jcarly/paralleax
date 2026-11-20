import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { batches, runEslint, runStylelint, summarize, writeReport } from './quality/report.mjs';

const baselineFiles = [
  'eslint-suppressions.json',
  'stylelint-suppressions.json',
  '.dependency-cruiser-known-violations.json',
  '.duplication-baseline.json',
];

test('collects suppressed lint diagnostics and writes reports without changing baselines', async () => {
  const before = baselineFiles.map((file) => readFileSync(file));
  const eslintFile = 'apps/api/src/auth/auth-testing.controller.spec.ts';
  const cssFile = 'apps/web/src/components/formFields.css';
  const eslint = runEslint([[eslintFile]]);
  const css = await runStylelint([cssFile]);
  assert.ok(
    eslint.some(
      (item) =>
        item.file === eslintFile &&
        item.rule === '@typescript-eslint/no-unsafe-type-assertion' &&
        item.line > 0,
    ),
  );
  assert.ok(
    css.some(
      (item) => item.file === cssFile && item.rule === 'no-descending-specificity' && item.line > 0,
    ),
  );
  assert.ok(css.every((item) => item.fixable === null));
  const diagnostics = [...eslint, ...css];
  const report = {
    revision: 'fixture',
    diagnostics,
    groups: summarize(diagnostics),
    batches: batches(diagnostics),
  };
  const directory = mkdtempSync(path.join(os.tmpdir(), 'paralleax-inventory-test-'));
  try {
    writeReport(report, directory);
    const json = JSON.parse(readFileSync(path.join(directory, 'quality-report.json'), 'utf8'));
    const md = readFileSync(path.join(directory, 'quality-report.md'), 'utf8');
    assert.equal(json.revision, 'fixture');
    assert.equal(json.diagnostics.length, diagnostics.length);
    assert.match(md, /^# Quality debt inventory/m);
    assert.match(md, /not evaluated/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  assert.deepEqual(
    baselineFiles.map((file) => readFileSync(file)),
    before,
  );
});
