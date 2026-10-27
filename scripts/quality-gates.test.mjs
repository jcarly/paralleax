import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';
import { checkTransition } from './quality/baseline-policy.mjs';
import { assertNoGrowth, compareCounts, digest, flattenCounts } from './quality/counts.mjs';

const fixturePath = path.resolve('apps/web/src/__architecture_guard_fixture__.ts');
const branchCode = Array.from({ length: 11 }, (_, i) => `if (n === ${i}) { return ${i}; }`).join(
  '\n',
);
const longCode = Array.from({ length: 52 }, () => 'console.log(n);').join('\n');
const guards = [
  ['complexity', `export function sample(n: number) { ${branchCode} return -1; }`],
  [
    'sonarjs/cognitive-complexity',
    `export function sample(n: number) { ${branchCode} return -1; }`,
  ],
  [
    'max-depth',
    'export function sample(n: number) { if(n){if(n){if(n){if(n){return 1;}}}} return 0; }',
  ],
  ['max-params', 'export function sample(a,b,c,d,e) { return a+b+c+d+e; }'],
  ['max-lines-per-function', `export function sample(n: number) {\n${longCode}\n}`],
  ['eqeqeq', 'export function sample(n: number) { return n == 1; }'],
  ['curly', 'export function sample(n: number) { if(n) return true; return false; }'],
  ['@typescript-eslint/no-shadow', 'const n=1; export function sample(n: number) { return n; }'],
];

test('strict configuration rejects complexity, size, nesting, parameters and unsafe syntax', async () => {
  const eslint = new ESLint();
  for (const [rule, code] of guards) {
    const [result] = await eslint.lintText(code, { filePath: fixturePath });
    assert.ok(
      result.messages.some((message) => message.ruleId === rule),
      rule,
    );
  }
});

test('exact thresholds cover production, tests and Node scripts', async () => {
  const eslint = new ESLint();
  for (const file of [
    'apps/web/src/App.tsx',
    'packages/shared/src/story-operations.test.ts',
    'apps/api/src/stories/stories.service.spec.ts',
    'scripts/quality/counts.mjs',
  ]) {
    const config = await eslint.calculateConfigForFile(path.resolve(file));
    for (const [rule, threshold] of [
      ['complexity', 10],
      ['sonarjs/cognitive-complexity', 10],
      ['max-depth', 3],
      ['max-params', 4],
    ]) {
      assert.deepEqual(config.rules[rule], [2, threshold], `${file}: ${rule}`);
    }
    assert.equal(config.rules['max-lines-per-function'][1].max, 50);
    assert.equal(config.rules['@typescript-eslint/no-explicit-any'][0], 2);
  }
});

test('generated output and local third-party corpora remain globally ignored', async () => {
  const eslint = new ESLint();
  for (const file of [
    'apps/api/dist/main.js',
    'apps/web/coverage/fixture.js',
    'test-data/local/source.mjs',
    'quality-reports/fixture.mjs',
  ]) {
    assert.equal(await eslint.isPathIgnored(path.resolve(file)), true, file);
  }
  assert.equal(await eslint.isPathIgnored(path.resolve('scripts/quality/counts.mjs')), false);
});

test('real test files receive typed promise and exhaustive-switch checks', async (t) => {
  const file = path.resolve('packages/shared/src/__quality_typed_fixture__.test.ts');
  t.after(() => rmSync(file, { force: true }));
  writeFileSync(
    file,
    `export function selected(mode: 'a'|'b') { switch(mode){case 'a': return true;} }
export function floating() { Promise.resolve(); }
export function narrowed(value: unknown) { return value as string; }
export function rejected() { return Promise.reject('failure'); }`,
  );
  const [result] = await new ESLint().lintFiles([file]);
  assert.equal(result.fatalErrorCount, 0);
  for (const rule of [
    '@typescript-eslint/no-floating-promises',
    '@typescript-eslint/switch-exhaustiveness-check',
    '@typescript-eslint/no-unsafe-type-assertion',
    '@typescript-eslint/prefer-promise-reject-errors',
  ]) {
    assert.ok(
      result.messages.some((message) => message.ruleId === rule),
      rule,
    );
  }
});

function baseline(count = 1) {
  return { 'file.ts': { complexity: { count } } };
}

test('baseline growth, new files and stale counts are distinguished without netting decreases', () => {
  const accepted = flattenCounts(baseline());
  assert.deepEqual(compareCounts(accepted, accepted), { growth: [], stale: [] });
  assert.throws(
    () => assertNoGrowth(compareCounts(flattenCounts(baseline(2)), accepted)),
    /New violations/,
  );
  const replacement = flattenCounts({ 'new.ts': { complexity: { count: 1 } } });
  const comparison = compareCounts(replacement, accepted);
  assert.equal(comparison.growth.length, 1);
  assert.equal(comparison.stale.length, 1);
  assert.equal(compareCounts(new Map(), accepted).stale.length, 1);
  assert.throws(() => flattenCounts(baseline(0)), /Invalid baseline/);
});

test('growth requires a reasoned exception bound to both exact baseline contents', () => {
  const previous = baseline();
  const current = baseline(2);
  const file = 'eslint-suppressions.json';
  assert.throws(() => checkTransition({ file, previous, current, transitions: [] }), /Unapproved/);
  const transitions = [
    {
      file,
      before: digest(previous),
      after: digest(current),
      reason: 'Explicit initial quality migration requested and reviewed by the project author.',
    },
  ];
  checkTransition({ file, previous, current, transitions });
  assert.throws(
    () => checkTransition({ file, previous, current: baseline(3), transitions }),
    /Unapproved/,
  );
});

test('baseline reductions need no exception', () => {
  checkTransition({
    file: 'eslint-suppressions.json',
    previous: baseline(2),
    current: baseline(),
    transitions: [],
  });
});
