# Shared group validation follow-up — 2026-11-04

## Targeted audit

On `origin/main` at `c86fd64`, `validateStoryGroups` in
`packages/shared/src/operations/groups.ts` combined group-title and membership
checks with parent-chain validation. ESLint measured cyclomatic complexity 13
and cognitive complexity 21. The same module had three non-null assertions in
group traversal and deletion.

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
- Removed one complexity, one cognitive-complexity, six `curly`, and three
  non-null assertion suppression counts. On the updated `main` baseline, this
  slice reduces ESLint findings from 3,608 to 3,597.

## Verification and limits

- `npm run test -w @paralleax/shared -- src/operations/groups.test.ts`: 13 tests
  passed; the full shared package suite passed 26 files and 222 tests.
- `npm run typecheck -w @paralleax/shared`, Prettier, and targeted ESLint passed.
- ESLint pruning passed across all workspaces; CSS and dependency baseline
  checks passed. The aggregate command then hit sandbox `EPERM` when its
  duplicate scanner spawned Node. A direct jscpd scan and shrink-only comparison
  found 15 exact clones with no growth or stale entries.
- The architecture gate passed across 596 modules and 2,174 dependencies.
