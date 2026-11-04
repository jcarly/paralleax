# Secondary baseline follow-up — 2026-11-04

## Targeted audit

On `origin/main` at `7f85c7f`, the QSP analyzer had 21 `curly` suppressions,
alongside separate complexity, nesting, and function-length findings. Adding
braces is an automatic syntax-only correction and does not change the parser's
unsupported-command classification or state transitions, so it was a suitable
small P2 cleanup after the async, persistence, shared-engine, and editor work.

The remaining parser findings were reviewed as candidates, not treated as bugs.
For example, `qsp/parser.ts` and `qsp/control-flow.ts` have higher complexity and
non-null suppressions around branch construction and indexed graph data. Those
paths have existing importer and subroutine regression coverage; a behavior
change should be driven by a concrete source case and a test before simplifying
them.

The clone scan still reports 15 exact pairs. It includes repeated DTO validation
shapes and UI fragments, but this pass did not establish that their create/update
validation or presentation semantics are interchangeable. No clone or CSS
baseline change was justified here.

## Changes

- Added explicit braces to the 21 auto-fixable `curly` findings in
  `packages/shared/src/import-export/qsp/analyzer.ts`.
- Against the original `7f85c7f` baseline, this slice changes the count from
  3,649 to 3,628. After PRs #22 and #23 merged, this PR's updated base is 3,632
  findings; the QSP cleanup reduces it to 3,611.
- No parser rule, import report, source mapping, or runtime behavior changed.

## Verification and limits

- QSP tests: 4 files and 61 tests passed.
- `npm run typecheck -w @paralleax/shared` passed.
- Prettier and ESLint pruning passed. CSS and dependency baseline checks passed.
- The aggregate prune command stopped when the duplicate scanner hit sandbox
  `EPERM` spawning Node. A direct jscpd scan found 15 exact clones with no
  growth or stale entries. The architecture gate passed across 595 modules and
  2,171 dependencies.
