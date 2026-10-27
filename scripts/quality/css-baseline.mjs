import { readFileSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import stylelint from 'stylelint';
import {
  addCount,
  assertNoGrowth,
  compareCounts,
  flattenCounts,
  readJson,
  pruneCounts,
  writeJson,
} from './counts.mjs';

export async function collectCssCounts() {
  const counts = {};
  for await (const file of glob('apps/web/src/**/*.css')) {
    const result = await stylelint.lint({
      code: readFileSync(file, 'utf8'),
      codeFilename: path.resolve(file),
      configFile: path.resolve('stylelint.config.mjs'),
    });
    for (const warning of result.results[0].warnings) {
      addCount(counts, file.split(path.sep).join('/'), warning.rule);
    }
    if (result.results[0].parseErrors.length) {
      throw new Error(`CSS parsing failed: ${file}`);
    }
  }
  return counts;
}

export async function checkCssBaseline(prune = false) {
  const file = 'stylelint-suppressions.json';
  const actual = await collectCssCounts();
  const accepted = readJson(file);
  const comparison = compareCounts(flattenCounts(actual), flattenCounts(accepted));
  assertNoGrowth(comparison);
  if (prune) {
    writeJson(file, pruneCounts(accepted, actual));
  } else if (comparison.stale.length) {
    throw new Error(
      `Stale CSS suppressions; run npm run lint:baseline:prune:\n${comparison.stale.join('\n')}`,
    );
  }
  console.log(`CSS baseline: ${comparison.stale.length} stale entries${prune ? ' pruned' : ''}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await checkCssBaseline(process.argv.includes('--prune'));
}
