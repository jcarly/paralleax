# Shared narrative engine follow-up — 2026-11-04

## Targeted audit

The `origin/main` snapshot at `7f85c7f` had 3,649 ESLint suppression findings.
Within `packages/shared/src/triggers/evaluation.ts`, the private
`conditionMatches` function evaluated visited-interaction, location, character,
inventory, temporal, and typed-stat conditions. Its unsuppressed ESLint
diagnostics were cyclomatic complexity 26, cognitive complexity 27, eight
parameters, and 59 executable lines, against thresholds of 10, 10, four, and 50.
This is central narrative logic: an incorrect change can alter which routes the
Reader exposes and which condition failures Simulation reports.

Existing tests already exercised OR groups of AND conditions, visited state,
location and character context, inventory ownership, temporal conditions, typed
stat assignments, expressions, and exact item-instance references. The
stat-comparison operator dispatch did not have direct coverage for every numeric
operator.

Other high-debt shared candidates remain separate work: `applyInteractionItemStatChanges`
in `reader/replay.ts` has complexity 19, cognitive complexity 22, five
parameters, and 54 lines; `applyInteractionVariableChanges` has complexity 12,
cognitive complexity 14, and five parameters. These functions mutate replayed
time and item-stat state in authored order, so they need a focused audit of
effect ordering and broader replay fixtures before extraction. No replay or
history behavior was changed in this slice.

## Changes

- Bundle the existing condition inputs in a private typed evaluation context,
  constructed from the unchanged public evaluator parameters.
- Keep input, condition-group, and condition ordering intact. Stat comparison
  values now resolve through a focused helper, and the six operators use an
  explicit comparator. Missing values and mismatched types still fail.
- Add direct numeric comparison coverage for `eq`, `neq`, `lt`, `lte`, `gt`, and
  `gte`.
- The ESLint baseline shrank from 3,649 to 3,637 findings. This removes one
  cyclomatic-complexity finding, one cognitive-complexity finding, one
  parameter-count finding, two function-length findings, and seven `curly`
  findings. No rule or threshold changed.

The change does not alter exported function signatures, Trigger semantics,
appearance probability, timers, Reader progress, persisted data, or API
contracts.

## Verification and limits

- `npm run test -w @paralleax/shared`: 25 files and 220 tests passed.
- `npm run typecheck -w @paralleax/shared` passed.
- ESLint pruning, CSS baseline pruning, and dependency-baseline checks passed.
- Direct jscpd scan found the same 15 exact clones; the shrink-only comparison
  reported no growth or stale entries. The architecture gate passed across 595
  modules and 2,171 dependencies.
- `npm run lint:baseline:prune` stopped when the duplicate scanner's nested Node
  process received `EPERM` from the sandbox. Running jscpd directly and applying
  the same comparison/prune logic succeeded.

The remaining complexity in Reader replay and public Trigger evaluators stays in
the backlog for separately reviewed slices. This follow-up does not attempt to
clear the shared-engine baseline as a whole.
