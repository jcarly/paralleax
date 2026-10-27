import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ESLint } from 'eslint';
import stylelint from 'stylelint';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylelintConfigPath = path.join(repositoryRoot, 'stylelint.config.mjs');
const stylelintFixturePath = path.join(repositoryRoot, 'apps/web/src/__stylelint_fixture__.css');

async function lintCss(code, codeFilename = stylelintFixturePath, options = {}) {
  const result = await stylelint.lint({
    code,
    codeFilename,
    configFile: stylelintConfigPath,
    ...options,
  });

  return {
    errored: result.errored,
    rules: result.results.flatMap((entry) => entry.warnings.map(({ rule }) => rule)),
  };
}

const invalidCssCases = [
  {
    name: 'rejects descending specificity in override order',
    code: '.scope .button { color: red; }\n.button { color: blue; }',
    rule: 'no-descending-specificity',
  },
  {
    name: 'rejects duplicate selectors',
    code: '.button { color: red; }\n.button { color: blue; }',
    rule: 'no-duplicate-selectors',
  },
  {
    name: 'rejects important declarations',
    code: '.button { color: red !important; }',
    rule: 'declaration-no-important',
  },
  {
    name: 'rejects an unknown custom property',
    code: '.fixture { color: var(--paralleax-undefined-token); }',
    rule: 'no-unknown-custom-properties',
  },
  {
    name: 'rejects an unknown CSS property',
    code: '.fixture { colro: red; }',
    rule: 'property-no-unknown',
  },
  {
    name: 'rejects an invalid property value',
    code: '.fixture { width: definitely-not-a-length; }',
    rule: 'declaration-property-value-no-unknown',
  },
  {
    name: 'rejects an invalid media query',
    code: '@media not(min-width: 300px) { .fixture { display: block; } }',
    rule: 'media-query-no-invalid',
  },
  {
    name: 'rejects an invalid media-feature value',
    code: '@media (width: auto) { .fixture { display: block; } }',
    rule: 'media-feature-name-value-no-unknown',
  },
  {
    name: 'rejects a hex color in a component declaration',
    code: '.fixture { color: #123456; }',
    rule: 'color-no-hex',
  },
  {
    name: 'rejects a named color in a component declaration',
    code: '.fixture { color: white; }',
    rule: 'color-named',
  },
  {
    name: 'rejects RGB and HSL color functions',
    code: '.fixture { color: rgb(10 20 30); background: hsl(20 30% 40%); }',
    rule: 'function-disallowed-list',
  },
];

for (const { name, code, rule } of invalidCssCases) {
  test(name, async () => {
    const result = await lintCss(code);

    assert.equal(result.errored, true);
    assert.ok(result.rules.includes(rule));
  });
}

test('accepts a shared token from styles.css', async () => {
  const result = await lintCss('.fixture { color: var(--color-primary); }');

  assert.equal(result.errored, false);
  assert.ok(!result.rules.includes('no-unknown-custom-properties'));
});

test('does not treat a prototype-only token as a global token', async () => {
  const result = await lintCss('.fixture { color: var(--muted); }');

  assert.equal(result.errored, true);
  assert.ok(result.rules.includes('no-unknown-custom-properties'));
});

test('accepts a declared timer property supplied dynamically by React', async () => {
  const result = await lintCss(`
    .fixture {
      --choice-timer-duration: 0ms;
      --choice-timer-ratio: 1;
      animation-duration: var(--choice-timer-duration);
      transform: scaleX(var(--choice-timer-ratio));
    }
  `);

  assert.equal(result.errored, false);
  assert.ok(!result.rules.includes('no-unknown-custom-properties'));
});

test('accepts a custom property with a literal fallback', async () => {
  const result = await lintCss('.fixture { color: var(--optional-token, #123456); }');

  assert.equal(result.errored, false);
  assert.ok(!result.rules.includes('no-unknown-custom-properties'));
});

test('allows an explained one-line color exception', async () => {
  const result = await lintCss(
    '/* stylelint-disable-next-line color-no-hex -- external control requires this color */\n.fixture { color: #123456; }',
  );

  assert.equal(result.errored, false);
  assert.ok(!result.rules.includes('color-no-hex'));
});

test('keeps Prototype CSS outside production color-token enforcement', async () => {
  const prototypePath = path.join(repositoryRoot, 'apps/web/src/pages/ParalleaxPrototype.css');
  const result = await lintCss('.fixture { color: #123456; }', prototypePath);

  assert.equal(result.errored, false);
  assert.ok(!result.rules.includes('color-no-hex'));
});

test('allows color literals in the canonical token block but rejects them in base UI rules', async () => {
  const tokens = await lintCss(
    `
    /* stylelint-disable color-no-hex, color-named, function-disallowed-list -- canonical tokens */
    :root { --color-example: #123456; }
    /* stylelint-enable color-no-hex, color-named, function-disallowed-list */
    .button { color: #123456; }
  `,
    path.join(repositoryRoot, 'apps/web/src/styles.css'),
  );

  assert.equal(tokens.errored, true);
  assert.ok(tokens.rules.includes('color-no-hex'));
});

test('native Stylelint suppressions baseline existing diagnostics and expose added ones', async (t) => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'paralleax-stylelint-baseline-'));
  const fixturePath = path.join(repositoryRoot, 'apps/web/src/__stylelint_baseline_fixture__.css');
  const suppressionsPath = path.join(temporaryDirectory, 'stylelint-suppressions.json');
  t.after(() => {
    rmSync(fixturePath, { force: true });
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  writeFileSync(fixturePath, '.fixture { color: red; }\n.fixture { color: blue; }\n');
  const initial = await stylelint.lint({
    files: [fixturePath],
    configFile: stylelintConfigPath,
    suppressRule: ['no-duplicate-selectors'],
    suppressLocation: suppressionsPath,
  });

  assert.equal(
    initial.results[0].warnings.filter(({ rule }) => rule === 'no-duplicate-selectors').length,
    0,
  );

  writeFileSync(
    fixturePath,
    '.fixture { color: red; }\n.fixture { color: blue; }\n.fixture { color: green; }\n',
  );
  const updated = await stylelint.lint({
    files: [fixturePath],
    configFile: stylelintConfigPath,
    suppressLocation: suppressionsPath,
  });

  assert.ok(updated.results[0].warnings.some(({ rule }) => rule === 'no-duplicate-selectors'));
});

test('native color suppression baseline exposes additional literal colors', async (t) => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'paralleax-color-baseline-'));
  const fixturePath = path.join(repositoryRoot, 'apps/web/src/__stylelint_color_fixture__.css');
  const suppressionsPath = path.join(temporaryDirectory, 'stylelint-suppressions.json');
  t.after(() => {
    rmSync(fixturePath, { force: true });
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  writeFileSync(fixturePath, '.fixture { color: #123456; }\n');
  const initial = await stylelint.lint({
    files: [fixturePath],
    configFile: stylelintConfigPath,
    suppressRule: ['color-no-hex'],
    suppressLocation: suppressionsPath,
  });
  assert.equal(initial.results[0].warnings.filter(({ rule }) => rule === 'color-no-hex').length, 0);

  writeFileSync(fixturePath, '.fixture { color: #123456; }\n.new-color { color: #654321; }\n');
  const updated = await stylelint.lint({
    files: [fixturePath],
    configFile: stylelintConfigPath,
    suppressLocation: suppressionsPath,
  });
  assert.ok(
    updated.results[0].warnings.some(({ rule }) => rule === 'color-no-hex'),
    'a second semantic color must exceed the audited baseline',
  );
});

test('prevents shared domain files from importing framework layers', async () => {
  const eslint = new ESLint({ cwd: repositoryRoot });
  const [result] = await eslint.lintText(
    [
      "import React from 'react';",
      "import '../../../apps/web/src/App';",
      "import '@paralleax/api';",
    ].join('\n'),
    { filePath: path.join(repositoryRoot, 'packages/shared/src/__eslint_fixture__.test.ts') },
  );

  assert.equal(
    result.messages.filter(({ ruleId }) => ruleId === 'no-restricted-imports').length,
    3,
  );
});
