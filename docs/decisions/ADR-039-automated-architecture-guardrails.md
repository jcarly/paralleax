# ADR-039 - Automated Architecture Guardrails

**Status:** Accepted  
**Date:** 2026-10-25

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

Cross-feature imports already used by the web editor/player remain permitted.
React Flow remains limited to the explicit graph projection and presentation
modules documented in the configuration. Coupling measurements do not trigger
automatic module splits.
