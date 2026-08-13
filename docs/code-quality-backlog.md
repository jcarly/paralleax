# Code Quality Backlog

Status: Active

This page records maintainability, reliability, performance, and test work found
during the August 2026 code review. Production gates remain authoritative in
[Production readiness](production-readiness.md).

## Completed In The First Review Batch

- [x] Return lightweight `StorySummary` objects from story listing.
- [x] Display a recoverable reader load error with retry.
- [x] Ignore obsolete reader and editor loads after route changes or cleanup.
- [x] Reconstruct direct-start inventory effects in Simulation Mode.
- [x] Resolve authored item instances rooted at locations and characters.
      Historical note: ADR-014 temporarily removed location-owned roots before
      ADR-015 restored them.
- [x] Add regression tests for these behaviors.

## P0 — Reliability And Safety

- [x] Enforce a 64,000-character interaction-body limit at the DTO boundary and
      cover oversized content with an API regression test.
- [x] Show editor-side character usage, warn within the final 10%, and identify
      content that cannot be saved above the limit.
- [x] Configure an explicit 128 KiB global HTTP request-body limit and normalize
      parser rejection as a stable `413 PAYLOAD_TOO_LARGE` response.
- [ ] Add story-level size and entity-count quotas.
- [x] Apply a 60-per-minute rate limit to story mutations while retaining a
      separate 100-per-minute read limit and stable `429` responses.
- [x] Protect browser closing/reloading and internal link clicks while editor
      saves are pending or failed, with confirmation and cleanup tests.
- [ ] Migrate from declarative `BrowserRouter` to a data router before blocking
      browser back/forward navigation; do not emulate this by mutating history after
      `popstate`.
- [x] Upgrade `sanitize-html`, DOMPurify, React Router, Nano ID, and safe
      transitive packages. Pin the fixed `js-yaml` patch beneath Swagger with an
      npm override; the production dependency audit reports no known findings.
- [ ] Remove the targeted Swagger `js-yaml` override once Swagger declares the
      fixed patch directly, retaining the high-severity CI audit.
- [ ] Verify with an automated test that a late response from a previous story
      cannot overwrite the active editor or reader route.

## P1 — Performance And Persistence

- [ ] Record story-summary query count, payload size, and latency with many
      large stories, then retain a regression budget.
- [ ] Add direct repository commands for story metadata, interaction text, and
      node positions so common updates avoid a complete graph read and lock.
- [ ] Replace remaining complete-story delete responses with explicit cleanup
      result contracts where the client can apply them safely.
- [ ] Measure long-journey replay and large item graphs, then add interaction and
      item lookup maps only where the measurements confirm repeated linear costs.
- [ ] Retain React Flow projection and interaction-latency budgets after the
      current 2,000-node baseline.
- [ ] Run controlled PostgreSQL stress tests in CI and retain comparable results.

## P1 — Module Boundaries

- [ ] Split `packages/shared/src/index.ts` into model, story mutations, reader,
      inventory, time, and demo-data modules while retaining public exports.
- [ ] Split `StoriesService` into story metadata, interaction/trigger,
      context/inventory, and reader-progress application services.
- [ ] Split `useStoryEditorPersistence` into load/save status, graph mutations,
      and context/inventory mutations while keeping one optimistic-state owner.
- [ ] Extract Story Player presentation and reader-session state without
      duplicating engine state in React.
- [ ] Extract Story Editor navigation, selection, and connection-dialog
      orchestration without moving semantics into React Flow.
- [ ] Break large test files into capability suites and remove broad `any` usage
      from React Flow test doubles.

## P2 — Error Handling And User Feedback

- [ ] Give Simulation Mode mutations visible saving, failure, and recovery UI.
- [ ] Add retry and empty states to story listing and prevent duplicate submits.
- [ ] Standardize loading, empty, recoverable-error, save-error, and expired-
      session presentation across frontend routes.
- [ ] Decide whether failed optimistic mutations should reload or restore the
      last confirmed entity value automatically.
- [ ] Make API request identifiers available in optional support details.

## P2 — Testing And Accessibility

- [ ] Add Playwright coverage for reader load retry and unresolved-save guards,
      including real browser `beforeunload` behavior.
- [ ] Add automated accessibility checks and a manual keyboard/focus audit.
- [ ] Add focused cleanup tests for unmounts and story-id changes.
- [ ] Review coverage thresholds after module splits and cover hidden branches.
- [ ] Track bundle size so refactors do not pull React Flow into the initial chunk.

## Delivery Notes

- Perform module extraction in behavior-preserving slices, not a broad rewrite.
- Pair every behavior change with a regression test and changelog entry.
- Do not prepare a public release while applicable production gates are open.
