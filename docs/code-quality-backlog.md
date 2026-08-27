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
- [x] Group comment messages by thread once when listing discussions instead of
      filtering the complete message result for every thread.
- [ ] Replace remaining complete-story delete responses with explicit cleanup
      result contracts where the client can apply them safely.
- [ ] Measure long-journey replay and large item graphs, then add interaction and
      item lookup maps only where the measurements confirm repeated linear costs.
- [ ] Retain React Flow projection and interaction-latency budgets after the
      current 2,000-node baseline.
- [ ] Run controlled PostgreSQL stress tests in CI and retain comparable results.

## P1 — Module Boundaries

- [x] Split the shared domain into model, operations, reader, triggers, time,
      and import/export modules while retaining public exports.
- [x] Move demo-story data and the remaining interaction-placement helpers out
      of `packages/shared/src/index.ts` into focused `demo` and `graph` modules.
- [x] Centralize recursive item indexing, reachability, descendant collection,
      validation, and subtree moves in `packages/shared`; API, reader, and web
      projections must consume the same domain operations.
- [x] Split `StoriesService` into story metadata, interaction/trigger,
      context/inventory, and reader-progress application services.
  - [x] Extract story metadata and access orchestration.
  - [x] Extract interaction and trigger orchestration.
  - [x] Extract context and inventory orchestration.
  - [x] Extract authenticated reader-progress orchestration.
- [x] Split `useStoryEditorPersistence` into load/save status, graph mutations,
      and context/inventory mutations while keeping one optimistic-state owner.
  - [x] Extract load, save tracking, error recovery, and realtime deferral.
  - [x] Extract interaction, trigger, and graph-decoration mutations.
  - [x] Extract context and inventory mutations without introducing another
        story-state owner.
- [x] Share editor and Simulation Mode realtime invalidation helpers and API
      mutation-result adapters inside focused web feature modules.
- [x] Extract Story Player presentation and reader-session state without
      duplicating engine state in React.
  - [x] Replace parallel journey, current interaction, visit, location, variable,
        and inventory states with one shared-engine `ReaderProgressState` replay.
  - [x] Extract the authenticated progress-save queue without changing the API
        contract or allowing Simulation Mode to persist reader progress.
  - [x] Extract translated condition summaries and unavailable-reason projection
        while retaining trigger evaluation in the shared domain.
- [x] Extract Story Editor navigation, selection, and connection-dialog
      orchestration without moving semantics into React Flow.
  - [x] Extract connection gesture and connection-choice orchestration while
        reusing the existing validators and persistence actions.
  - [x] Extract transient inspector and graph-selection orchestration without
        storing authored entities or semantics in React Flow.
  - [x] Extract context-reference and text-search navigation orchestration,
        including panel state, filters, categories, and reference summaries.
- [x] Centralize comment-thread management authorization in the shared domain so
      the API and editor cannot drift.
- [x] Split the ChoiceScript importer into parser, mapping, graph-builder/layout,
      and compatibility-report modules without leaking source semantics into the
      Paralleax engine.
  - [x] Extract tokenization and statement parsing behind a typed source model.
  - [x] Extract draft graph compilation and deterministic initial layout.
  - [x] Extract Paralleax Story, trigger, effect, condition, and typed-variable
        mapping while retaining only transient source identifiers.
  - [x] Centralize compatibility-report construction, source issues, and error
        detection; keep the public importer as a thin staged orchestrator.
- [x] Split the global web stylesheet by shell, editor, inspector, graph, reader,
      and review features while retaining one shared token foundation.
  - [x] Keep tokens, base controls, shell, generic pages, and story-list rules in
        the root stylesheet.
  - [x] Move editor layout, graph, review comments, reader, Simulation Mode, and
        responsive rules beside their owning features.
  - [x] Preserve the original cascade by loading the two previously separated
        inspector sections on either side of review comments.
- [x] Break large test files into capability suites and remove broad `any` usage
      from React Flow test doubles.
  - [x] Split Story Editor tests into graph, context, interaction, connection, and
        trigger suites backed by shared typed fixtures and lifecycle setup.
  - [x] Split Story Player tests into loading/presentation, runtime state,
        access/comments, and Simulation Mode authoring suites.
  - [x] Split editor Playwright coverage into persistence, graph, and
        trigger/item suites backed by one shared route and story harness.
  - [x] Replace the untyped React Flow component mock with typed node, edge,
        handle, resize, connection, selection, and drag contracts.

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
