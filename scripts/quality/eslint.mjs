import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Release TypeScript programs between workspaces instead of retaining all three.
const groups = [
  ['apps/api'],
  ['apps/web'],
  ['packages/shared'],
  [
    '.',
    '--ignore-pattern',
    'apps/api/**',
    '--ignore-pattern',
    'apps/web/**',
    '--ignore-pattern',
    'packages/shared/**',
  ],
];
const cli = fileURLToPath(new URL('../../node_modules/eslint/bin/eslint.js', import.meta.url));
const options = process.argv.slice(2);
if (options.some((option) => option !== '--prune-suppressions')) {
  throw new Error(
    'Only --prune-suppressions is supported; this runner never generates suppressions.',
  );
}
for (const group of groups) {
  console.log(`ESLint: ${group[0]}`);
  const result = spawnSync(
    process.execPath,
    [
      cli,
      ...group,
      '--max-warnings',
      '0',
      '--suppressions-location',
      'eslint-suppressions.json',
      ...options,
    ],
    { stdio: 'inherit' },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
