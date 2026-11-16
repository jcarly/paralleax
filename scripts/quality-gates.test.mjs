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

test('complexity and file-size thresholds cover production, tests and Node scripts', async () => {
  const eslint = new ESLint();
  for (const [file, lineLimit] of [
    ['apps/web/src/App.tsx', 400],
    ['packages/shared/src/story-operations.test.ts', 600],
    ['apps/api/src/stories/stories.service.spec.ts', 600],
    ['scripts/quality/counts.mjs', 400],
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
    assert.deepEqual(config.rules['max-lines'], [
      2,
      { max: lineLimit, skipBlankLines: true, skipComments: true },
    ]);
    assert.equal(config.rules['no-duplicate-imports'][0], 2);
    assert.equal(config.rules['@typescript-eslint/no-explicit-any'][0], 2);
  }
  const jsxConfig = await eslint.calculateConfigForFile(
    path.resolve('apps/web/src/QualityExample.jsx'),
  );
  assert.equal(jsxConfig.rules['max-lines'][1].max, 400);
  assert.equal(jsxConfig.rules['no-duplicate-imports'][0], 2);
});

test('React and accessibility checks apply to the web workspace', async () => {
  const eslint = new ESLint();
  const config = await eslint.calculateConfigForFile(path.resolve('apps/web/src/App.tsx'));
  for (const rule of [
    '@eslint-react/no-missing-key',
    '@eslint-react/no-array-index-key',
    '@eslint-react/no-nested-component-definitions',
    '@eslint-react/no-leaked-conditional-rendering',
    '@eslint-react/no-unstable-context-value',
    '@eslint-react/no-context-provider',
    '@eslint-react/no-use-context',
    'jsx-a11y-x/alt-text',
    'jsx-a11y-x/click-events-have-key-events',
    'jsx-a11y-x/label-has-associated-control',
    'jsx-a11y-x/role-has-required-aria-props',
  ]) {
    assert.equal(config.rules[rule][0], 2, `${rule} must be an error`);
  }
  for (const rule of [
    '@eslint-react/naming-convention-ref-name',
    '@eslint-react/naming-convention-id-name',
    '@eslint-react/rsc-function-definition',
  ]) {
    assert.equal(config.rules[rule][0], 0, `${rule} is outside this project's rules`);
  }
  const jsxConfig = await eslint.calculateConfigForFile(
    path.resolve('apps/web/src/QualityExample.jsx'),
  );
  assert.equal(jsxConfig.rules['@eslint-react/no-missing-key'][0], 2);
  assert.equal(jsxConfig.rules['jsx-a11y-x/alt-text'][0], 2);
});

test('new TypeScript correctness rules catch historical patterns in a typed fixture', async (t) => {
  const file = path.resolve('apps/web/src/__quality_strict_fixture__.ts');
  t.after(() => rmSync(file, { force: true }));
  writeFileSync(
    file,
    `export function unnecessary(value: string) {
  if (value === null) return true;
  if (value) return true;
  return false;
}
export function coalesce(value: string | null) {
  return value || 'fallback';
}
export function chain(value: { child?: { name?: string } } | null) {
  return value && value.child && value.child.name;
}
export function voidReturn(run: () => void) {
  return run();
}`,
  );
  const [result] = await new ESLint().lintFiles([file]);
  assert.equal(result.fatalErrorCount, 0);
  for (const rule of [
    '@typescript-eslint/no-unnecessary-condition',
    '@typescript-eslint/strict-boolean-expressions',
    '@typescript-eslint/prefer-nullish-coalescing',
    '@typescript-eslint/prefer-optional-chain',
    '@typescript-eslint/no-confusing-void-expression',
  ]) {
    assert.ok(
      result.messages.some((message) => message.ruleId === rule),
      rule,
    );
  }
});

test('React and accessibility plugins report new JSX defects', async () => {
  const file = path.resolve('apps/web/src/__quality_react_a11y_fixture__.tsx');
  const source = `export function BadList({ items }: { items: string[] }) {
  return <div>{items.map((item) => <span>{item}</span>)}</div>;
}
export function BadImage() {
  return <img src="image.png" />;
}`;
  const [result] = await new ESLint().lintText(source, { filePath: file });
  assert.equal(result.fatalErrorCount, 0);
  assert.ok(result.messages.some(({ ruleId }) => ruleId === '@eslint-react/no-missing-key'));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === 'jsx-a11y-x/alt-text'));
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
