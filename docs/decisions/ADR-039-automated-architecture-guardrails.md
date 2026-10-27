# ADR-039 - Automated Architecture Guardrails

**Status:** Accepted  
**Date:** 2026-10-25

**Partially superseded on 2026-10-26:** [ADR-041](ADR-041-strict-quality-gates-and-native-baselines.md)
replaces the complexity threshold, typed-test exclusion and deferred size/depth
guards. The decisions and measurements below are retained as historical context.

## Context

The repository documents its workspace and React Flow boundaries, but those
boundaries and the import graph were not checked in CI. A repository-wide
cyclomatic-complexity limit also needs an existing-code baseline to avoid
requiring broad refactors before the current alpha validation work.

## Decision

- Use dependency-cruiser for source-level workspace boundaries and circular
  dependency detection. Scan `apps/web/src`, `apps/api/src`, and
  `packages/shared/src`; combine runtime and type dependencies.
- Permit only the existing mixed API email cycle in the dependency baseline:
  `EmailService` imports the test outbox at runtime and the test outbox imports
  the `EmailMessage` type. New runtime or type cycles fail the check.
- Enforce the documented cross-workspace boundaries, the shared package public
  facade, API controller-to-persistence separation, and the existing React Flow
  graph-module allowlist. Do not add a blanket web feature-to-feature rule.
- Use ESLint's `complexity` rule at 20 for production TypeScript. Keep the
  existing findings in ESLint's native file-and-rule suppression baseline.
  Tests, specs, and test helpers do not contribute to this baseline.
- Enable type-aware ESLint safety rules on production TypeScript in all three
  workspaces. Enable `no-floating-promises`, `no-misused-promises`,
  `no-unnecessary-type-assertion`, and the `no-unsafe-*` rules with each
  workspace's tsconfig. Exclude tests and specs and track existing violations in
  ESLint's native suppression baseline.
- Enable Stylelint's `no-descending-specificity`, `no-duplicate-selectors`, and
  `declaration-no-important` rules across web source CSS. Keep current findings
  in Stylelint's native bulk suppression baseline, separately from ESLint's
  baseline.
- Keep file size, parameter count, nesting depth, dependency concentration, and
  semantic duplication as review signals until measured criteria justify a
  blocking rule.

## Consequences

`npm run lint:architecture` and `npm run lint` make the selected checks part of
local verification and CI. This adds no domain or persistence behavior and
requires no migration. Dependency-cruiser suppressions match known dependency
violations; ESLint suppressions count errors per file and rule, so a replacement
complexity violation in the same file can pass when the count does not increase.
The complexity baseline currently contains 45 findings in 34 production files
and should be reduced incrementally without a broad refactor.

The 12 typed rules initially ran on `shared`, then expanded after separate
measurements of `api` and `web`. The native ESLint baseline now holds 120
existing findings in 17 production files: one in `shared`, 100 in `api`, and 19
in `web`. The full root lint takes about 130 seconds versus 29.4 seconds before
typed lint. An earlier probe using the full `recommendedTypeChecked` preset
exceeded 3.5 minutes. Keep tests and specs outside the typed scope. Stylelint's
native bulk suppressions are experimental in 17.16.0; its baseline contains 359
findings across nine stylesheets. Its per-file/rule counts have the same
replacement limitation as ESLint's counts and should shrink as those stylesheets
are otherwise changed.

Cross-feature imports already used by the web editor/player remain permitted.
React Flow remains limited to the explicit graph projection and presentation
modules documented in the configuration. Coupling measurements do not trigger
automatic module splits.
