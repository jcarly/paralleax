import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ESLint } from 'eslint';
import stylelint from 'stylelint';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylelintConfigPath = path.join(repositoryRoot, 'stylelint.config.mjs');
const stylelintFixturePath = path.join(repositoryRoot, 'apps/web/src/__stylelint_fixture__.css');

async function lintCss(code) {
  const result = await stylelint.lint({
    code,
    codeFilename: stylelintFixturePath,
    configFile: stylelintConfigPath,
  });

  return {
    errored: result.errored,
    rules: result.results.flatMap((entry) => entry.warnings.map(({ rule }) => rule)),
  };
}

const invalidCssCases = [
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

test('prevents shared domain files from importing framework layers', async () => {
  const eslint = new ESLint({ cwd: repositoryRoot });
  const [result] = await eslint.lintText(
    [
      "import React from 'react';",
      "import '../../../apps/web/src/App';",
      "import '@paralleax/api';",
    ].join('\n'),
    { filePath: path.join(repositoryRoot, 'packages/shared/src/__eslint_fixture__.ts') },
  );

  assert.equal(
    result.messages.filter(({ ruleId }) => ruleId === 'no-restricted-imports').length,
    3,
  );
});
