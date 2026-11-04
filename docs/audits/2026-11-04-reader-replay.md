# Reader item-stat replay follow-up — 2026-11-04

## Targeted audit

At `origin/main` commit `7f85c7f`,
`applyInteractionItemStatChanges` in `packages/shared/src/reader/replay.ts`
combined item-stat initialization, elapsed-time changes, effect evaluation,
expression-context construction, and ordered writes. Its measured baseline was
cyclomatic complexity 19, cognitive complexity 22, five parameters, 54 lines,
and maximum nesting depth 4. These operations form one replay step, but keeping
all of them in one loop made it difficult to review the ordering that gives
expressions their current values.

## Changes

- Extracted item-stat initialization, duration advancement, per-assignment time
  changes, and expression-context construction into focused private helpers.
- Kept the public API and behavior: clone incoming values, initialize owned
  items, advance existing item stats for the interaction duration, then apply
  item effects in authored order. Each expression sees prior effects from this
  interaction, and the supplied input remains unchanged.
- Added a focused regression test. It verifies a 30-minute time change before
  the first effect, that the second effect sees the first effect's result, and
  that the original item-stat record is not mutated.
- Removed five stale ESLint suppression counts from `replay.ts` across
  complexity, cognitive complexity, maximum nesting, maximum function length,
  and curly-brace findings. The repository-wide ESLint baseline moves from
  3,649 to 3,644 findings.

## Verification and limits

- `npm run test -w @paralleax/shared`: 26 files and 215 tests passed.
- `npm run typecheck -w @paralleax/shared` passed.
- Prettier and targeted ESLint checks passed.
- The aggregate baseline-prune command completed ESLint, CSS, and dependency
  baseline checks, then hit the sandbox's `EPERM` when its duplicate scanner
  spawned Node. A direct jscpd scan and shrink-only comparison passed with no
  clone growth or stale entries. The architecture gate passed across 596
  modules and 2,174 dependencies.
