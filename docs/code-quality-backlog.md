# Code Quality Backlog

Status: Active

This page records maintainability, reliability, performance, and test work found
during the August 2026 code review and subsequent technical evaluations. Production gates remain authoritative in
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
- [x] Upgrade Jest and Vitest, review every dependency install hook, and retain a
      clean full and production npm audit. Keep the classification and evidence
      in [npm warning triage](npm-warning-triage.md).
- [ ] Remove the targeted Swagger `js-yaml` override once Swagger declares the
      fixed patch directly, retaining the high-severity CI audit.
- [ ] Remove the development-only `test-exclude -> glob@10.5.0` deprecation once
      the Jest/ts-jest coverage chain supports a maintained `glob` release; do
      not force a transitive major override without an upstream contract.
- [x] Verify with an automated test that a late response from a previous story
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
- [x] Run controlled PostgreSQL stress tests in the weekly/manual CI stress lane
      and retain their structured measurements in job logs.

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

- [x] Give Simulation Mode mutations visible saving, failure, and recovery UI.
- [x] Add retry and empty states to story listing and prevent duplicate submits.
- [ ] Standardize loading, empty, recoverable-error, save-error, and expired-
      session presentation across frontend routes.
- [ ] Decide whether failed optimistic mutations should reload or restore the
      last confirmed entity value automatically.
- [ ] Make API request identifiers available in optional support details.

## P2 — Testing And Accessibility

- [x] Add a separate Playwright real-stack golden path with PostgreSQL and no
      intercepted Paralleax endpoints for invited registration, Story authoring,
      reload, sign-in recovery, and conditioned Simulation Mode traversal.
- [x] Add real-stack P0 coverage for offline save failure visibility, guarded
      navigation, canonical reload recovery, and undo/redo data survival after
      browser reload.
- [x] Add real-stack P0 coverage for slow and out-of-order save responses plus
      graph move/create/delete survival.
- [x] Add real-stack P0 coverage for independent reader/Simulation autosaves,
      reader resume after reload, and a named manual save loaded into Simulation
      without repopulating the reset reader autosave.
- [x] Extend real-stack reader-save coverage to assert reconstructed variables,
      runtime inventory and item stats, story time, seeded probability, and
      timers before and after reload.
- [x] Add real-stack P0 coverage for two-user invitations, permissions, editing,
      and live invalidation.
- [x] Add a small real-stack P1 review scenario for a reader-created anchored
      comment, author navigation/reply/resolution, live updates in both
      directions, and reload persistence.
- [x] Add small real-stack P1 scenarios for known ChoiceScript and QSP
      `locations` fixtures, including graph inspection and Simulation traversal.
- [x] Add a weekly/manual real-stack P1 scenario for realistically sized Story
      import, complete graph loading, search navigation, editing/reload, and
      Simulation traversal, with structured timing output.
- [x] Add Playwright coverage for a real browser `beforeunload` cancellation while
      an authored save is unresolved.
- [x] Add Playwright coverage for reader load retry and reader-progress
      unresolved-save navigation guards.
- [x] Add automated WCAG A/AA accessibility checks for the Story library,
      creation/import dialogs, loaded editor, reader, and save dialog.
- [ ] Complete the manual keyboard/focus audit across all authoring, import,
      save, access, and comment dialogs.
- [x] Add focused cleanup tests for obsolete editor/player loads and reader
      autosave story-id changes.
- [x] Extend cleanup coverage to an explicit editor unmount while its projection
      request remains unresolved.
- [x] Review coverage thresholds after module splits and cover hidden branches.
- [x] Track bundle size so refactors do not pull React Flow into the initial chunk.

## Library Evaluation Candidates — 2026-09-24

These candidates record the author's library-reuse note and the initial layout
review. They are evaluation leads, not accepted dependencies or implementation
commitments. Compare each candidate with the existing implementation and its
tests before replacing code. The current product baseline remains authoritative.

- [ ] Evaluate **elkjs / ELK Layered** first for automatic graph organization,
      with **Dagre** as a simpler comparison. Preserve explicit linked Trigger
      vertices, multiple inputs, measured card dimensions, and bottom-output /
      top-input attachment points. Compare dense branches, convergence, cycles,
      disconnected components, repeat-layout stability, selected-only movement,
      execution time, and bundle cost against the existing fixtures. ELK's
      interactive options must not be assumed to freeze every unselected node.
      Reuse the existing batched position mutation and durable undo operation;
      consider on-demand loading and a worker for expensive computation.
- [ ] Evaluate **ELK routing**, then **libavoid** if independent obstacle-aware
      edge routing remains necessary. Node placement and edge routing are
      separate responsibilities: adopting computed positions does not make the
      current React Flow edges consume the engine's routed paths automatically.
- [ ] Evaluate **Graphology** when structural diagnostics require shared graph
      traversals, components, cycle detection, or path analysis. Use a temporary
      technical projection of the Story. Structural connectivity alone cannot
      establish narrative reachability through conditions, stats, items, time,
      and journey state; that remains the shared Paralleax engine's responsibility.
- [ ] Assess a separate **layout cleanup** action if authors need overlap
      removal while retaining deliberate placement. React Flow collision examples
      are implementation references to inspect, not an assumed built-in cleanup
      API. Define the permitted displacement and spacing behavior before delivery.
- [ ] Evaluate **React Hook Form with the existing Zod dependency** where it
      demonstrably simplifies inspector forms. Preserve current autosave,
      validation, draft, and optimistic persistence behavior.
- [ ] Evaluate **Chevrotain** if ChoiceScript or QSP grammar growth justifies
      replacing parts of the existing parsers. Preserve the staged adapters,
      source diagnostics, compatibility reports, and canonical mapping; a parser
      library does not resolve unsupported source runtime semantics.
- [ ] Evaluate **Fuse.js** only when approximate, multi-field search becomes a
      concrete requirement beyond the existing filtering and navigation.

Two suggestions in the supplied note require different treatment because their
underlying features already exist:

- **Undo/redo:** retain the durable, conflict-checked field/entity deltas from
  [ADR-023](decisions/ADR-023-durable-story-change-history.md). A zundo or React
  Flow snapshot stack is not a replacement for canonical Story history and may
  overwrite unrelated collaborative edits.
- **Collaboration:** live editing already uses authorized SSE invalidation and
  server persistence under [ADR-020](decisions/ADR-020-live-story-collaboration.md).
  Yjs, Liveblocks, or another collaboration system would require evaluation for
  a specific additional need, such as concurrent editing of the same text field,
  with explicit authorization, persistence, and history integration.

Primary references checked for the layout and structural-analysis candidates:

- [React Flow layout overview](https://reactflow.dev/learn/layouting/layouting)
- [ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)
- [elkjs usage and workers](https://github.com/kieler/elkjs)
- [ELK interactive constraints](https://eclipse.dev/elk/blog/posts/2023/23-01-09-constraining-the-model.html)
- [React Flow libavoid routing example](https://reactflow.dev/examples/edges/edge-routing)
  (the example is distributed under the React Flow Pro license)
- [Graphology standard library](https://graphology.github.io/standard-library/)

The remaining named libraries are retained from the author's note for later
evaluation; this entry does not verify their versions or select integrations.

## Delivery Notes

- Perform module extraction in behavior-preserving slices, not a broad rewrite.
- Pair every behavior change with a regression test and changelog entry.
- Do not prepare a public release while applicable production gates are open.
