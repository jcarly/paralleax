import assert from 'node:assert/strict';
import test from 'node:test';
import { batches, category, markdown, summarize } from './quality/report.mjs';

test('groups diagnostics without equating counts with difficulty', () => {
  const findings = [
    {
      tool: 'eslint',
      rule: 'complexity',
      file: 'apps/a/a.js',
      workspace: 'apps/a',
      category: category('eslint', 'complexity'),
      fixable: false,
    },
    {
      tool: 'eslint',
      rule: 'curly',
      file: 'apps/a/a.js',
      workspace: 'apps/a',
      category: category('eslint', 'curly'),
      fixable: true,
    },
  ];
  const groups = summarize(findings);
  assert.equal(groups.file['apps/a/a.js'], 2);
  assert.equal(groups.rule.complexity, 1);
  assert.equal(groups.category.refactoring, 1);
  assert.equal(batches(findings)[0].fixable, 1);
  assert.match(
    markdown({ revision: 'abc', groups, batches: batches(findings) }),
    /not estimates of difficulty/,
  );
});

test('linked files are assigned to the same batch transitively', () => {
  const findings = [
    { file: 'a', files: ['a', 'b'], category: 'duplication' },
    { file: 'b', files: ['b', 'c'], category: 'architecture' },
    { file: 'c', category: 'styles' },
    { file: 'd', category: 'styles' },
  ];
  const result = batches(findings);
  const linked = result.find((batch) => batch.files.includes('a'));
  assert.deepEqual(linked.files, ['a', 'b', 'c']);
  assert.equal(linked.count, 3);
  assert.deepEqual(result.find((batch) => batch.files.includes('d')).files, ['d']);
});

test('compares native counts without inventing individual identities', async () => {
  const { compareBaseline } = await import('./quality/report.mjs');
  const findings = [
    { tool: 'eslint', file: 'a', rule: 'r' },
    { tool: 'eslint', file: 'a', rule: 'r' },
    { tool: 'stylelint', file: 'a', rule: 'r' },
  ];
  const result = compareBaseline(findings, 'eslint', {
    a: { r: { count: 1 } },
    b: { r: { count: 1 } },
  });
  assert.equal(result.accepted, 2);
  assert.deepEqual(result.growth, ['a / r: 1 → 2']);
  assert.deepEqual(result.stale, ['b / r: 1 → 0']);
});
