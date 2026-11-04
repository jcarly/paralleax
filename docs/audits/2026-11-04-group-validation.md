# Shared group validation follow-up — 2026-11-04

## Targeted audit

On `origin/main` at `c86fd64`, `validateStoryGroups` in
`packages/shared/src/operations/groups.ts` combined group-title and membership
checks with parent-chain validation. ESLint measured cyclomatic complexity 13
and cognitive complexity 21. `moveStoryGroup` combined parent membership,
cycle, and sibling destination checks at cyclomatic complexity 13 and cognitive
complexity 11. The same module had three non-null assertions in group traversal
and deletion.

These checks protect authored organization and history replay: members must
belong to the Story, one Interaction cannot be directly assigned to multiple
groups, parent references must exist, and parent chains must not cycle. Existing
tests cover those invariants, including undo replay. The result is a single
validation message, so its deterministic first-error order is also preserved.

## Changes

- Extracted direct-member validation and parent-hierarchy validation into
  focused helpers. `validateStoryGroups` still checks each group in authored
  order and checks membership before hierarchy, preserving the prior error
  precedence.
- Replaced the traversal `pop()!` assertions with explicit empty-result guards.
- Captured the group list once in `removeStoryGroup` and reuse it for lookup and
  filtering, removing its non-null assertion.
- Added a regression test for error precedence within a group and across group
  order.
- Split move-parent validation and destination-sibling lookup into focused
  helpers. Missing groups, parent membership, cycle checks, and sibling errors
  retain their previous precedence; canonical list order is unchanged.
- Removed two complexity, two cognitive-complexity, nine `curly`, and three
  non-null assertion suppression counts. Across both group slices, the updated
  `main` baseline drops from 3,608 to 3,592 ESLint findings.

## Verification and limits

- `npm run test -w @paralleax/shared -- src/operations/groups.test.ts`: 13 tests
  passed; the full shared package suite passed 26 files and 222 tests.
- `npm run typecheck -w @paralleax/shared`, Prettier, and targeted ESLint passed.
- ESLint pruning passed across all workspaces; CSS baseline and dependency
  checks passed. The aggregate command then hit sandbox `EPERM` when its
  duplicate scanner spawned Node. A direct jscpd scan found 15 exact clones;
  comparison with the existing clone baseline showed no growth or stale entries.
- The architecture gate passed across 596 modules and 2,174 dependencies.
