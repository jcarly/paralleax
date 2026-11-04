# StoryEditor guard follow-up — 2026-11-04

## Targeted audit

On `origin/main` at `7f85c7f`, `apps/web/src/pages/StoryEditor.tsx` had three
`@typescript-eslint/no-non-null-assertion` findings:

- The trigger-condition summary called `describeTriggerCondition` with
  `story!`. `buildTriggerNodes` currently calls the summary only while building
  nodes from a present Story, but that requirement was implicit at the callback
  boundary.
- The local stat-definition and item-definition update handlers spread
  `story!`. Unlike the adjacent location update handler, they did not handle an
  absent Story before replacing local state.

The trigger callback is synchronous today, and valid inspector updates happen
while a Story is loaded. These are narrow lifecycle guards; the finding alone
does not establish that ordinary graph or editor use was broken.

## Changes

- The condition-summary callback now returns an empty summary if no Story is
  available before evaluating trigger conditions.
- The local stat and item definition handlers now return when Story state is
  absent, matching the existing location handler. Valid edits still update the
  same local Story fields.
- Removed the three stale non-null assertion suppressions. Against the original
  `7f85c7f` baseline, the count changes from 3,649 to 3,646. After PRs #22 and
  #23 merged, this PR's updated base is 3,632 findings; this slice reduces it to
  3,629.

## Verification and limits

- `npm run test -w @paralleax/web -- src/pages/StoryEditor.context.test.tsx
src/pages/StoryEditor.triggers.test.tsx`: 44 tests passed, covering the
  existing stat/item editing and trigger flows.
- `npm run typecheck -w @paralleax/web` passed.
- ESLint pruning completed across all workspaces with no new findings; CSS and
  dependency baseline checks passed. The aggregate command then hit sandbox
  `EPERM` when the duplicate scanner spawned Node. A direct jscpd scan and
  shrink-only comparison found 15 exact clones with no growth or stale entries.
- The architecture gate passed across 595 modules and 2,171 dependencies.
- No API, persisted data, graph geometry, or valid editor interaction changed.
  The remaining `StoryEditor` complexity findings stay subject to the backlog's
  guidance against splitting the editor solely to clear thresholds.
