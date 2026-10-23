# Code Quality Backlog

Status: Active

Last triaged: 2026-10-22

This page records maintainability, reliability, performance, and test work found
during the August 2026 code review and subsequent technical evaluations. Production gates remain authoritative in
[Production readiness](production-readiness.md).

## Active Delivery View

This backlog is intentionally broader than the near-term delivery queue. Use the
following order when choosing incremental quality work:

1. **Reliability gates:** Story/entity quotas, data-router navigation blocking,
   cancellable import-job lifecycle, and an explicit optimistic-mutation recovery
   policy.
2. **Measured persistence/performance:** Story-summary budgets, focused repository
   commands, long-journey/item measurements, and retained React Flow latency budgets.
3. **Author-facing consistency:** shared loading/error/session-expiry presentation,
   request-id support details, and the manual keyboard/focus audit.
4. **Incremental module work:** shared evaluation context, incremental journey time,
   Rich Text Editor extraction, shared import validation, and smaller editor/player
   orchestration modules.
5. **Design-system defects:** address the reproducible P0 layering, graph hover,
   rich-text CSS ownership and token-scope defects recorded in the
   [2026-10-22 audit](audits/design-system-2026-10-22.md), then take its P1/P2
   work in the existing consistency/accessibility order. This does not displace
   reliability gates or authorize open visual decisions.

Dependency-watch entries such as the Swagger `js-yaml` override and the
development-only `glob@10.5.0` warning are removal conditions, not active feature
work. UX ideas and library candidates remain discovery inputs until a product task
promotes them.

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
- [x] Add story-level size and entity-count quotas.
- [x] Apply a 60-per-minute rate limit to story mutations while retaining a
      separate 100-per-minute read limit and stable `429` responses.
- [x] Protect browser closing/reloading and internal link clicks while editor
      saves are pending or failed, with confirmation and cleanup tests.
- [x] Migrate from declarative `BrowserRouter` to a data router and block browser
      back/forward navigation with `useBlocker`, without mutating history after
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
  - [x] Add authenticated and public stress measurements for 25 Stories with
        1,000 Interactions each, including structured metrics and query, payload,
        and latency budgets.
  - [ ] Run the scheduled/manual PostgreSQL stress lane and retain its measured
        baseline before closing this item.
- [ ] Add direct repository commands for story metadata, interaction text, and
      node positions so common updates avoid a complete graph read and lock.
- [x] Group comment messages by thread once when listing discussions instead of
      filtering the complete message result for every thread.
- [ ] Replace remaining complete-story delete responses with explicit cleanup
      result contracts where the client can apply them safely.
  - [x] Return compact cleanup results for Interaction, Trigger, and graph-decoration
        deletion and apply their shared domain operations locally.
  - [x] Centralize character-stat and leaf-item cleanup in `packages/shared`, then
        return compact deletion results and apply the same operations in the editor.
  - [ ] Review the unused generic stat-definition and stat-assignment deletion
        endpoints separately before changing their compatibility contracts.
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

## P1 — Additional 2026-10-15 Audit Follow-Ups

These follow-ups came from the October 2026 static audit and should be tracked
as incremental, behavior-preserving improvements. Keep the existing product
rules authoritative; treat these as sequencing and measurement work rather than a
rewrite.

- [ ] Replace the broad scenario mutation flow with focused persistence commands
      such as story metadata, interaction content, and graph-position updates,
      then measure SQL query counts and latency for 100, 600, and 2,000
      interaction stories before broadening the pattern.
- [x] Centralize import job lifecycle management so cancellation is an actual
      stop signal and the API cannot mark a cancelled job as completed after the
      active job keeps running; add concurrency checks before any persistence and
      add visible cleanup for long-lived in-memory import metadata.
  - [x] Route QSP job cancellation to the worker abort signal, guard the
        persistence boundary, and expire terminal in-memory metadata.
    - [x] Make ChoiceScript parsing cancellable without blocking the API event loop.
- [ ] Persist import compatibility reports durably so completed, failed, and
      cancelled imports retain their diagnostics across process restarts; define
      retention and ownership before exposing the report as a user-facing
      recovery surface.
- [x] Make ELK the canonical graph-layout strategy while keeping the historic
      custom layout as an explicit fallback or removing it after validation;
      update the large-graph stress benchmark to use the active engine and keep
      the measured baseline aligned with production behavior.
- [x] Reduce repeated graph-layout work by indexing ELK results by node id and
      by avoiding repeated array spreads in lane assignment while preserving
      deterministic ordering for existing graph mutations.
- [ ] Consolidate trigger and interaction evaluation behind a single shared
      evaluation context so the reader, Simulation Mode, and unavailable-reason
      projections all reuse one deterministic result object instead of repeated
      bespoke calculations.
- [ ] Make journey-date recalculation incremental during normal reader
      progression, while retaining the full reconstruction path for saves,
      rewinds, and replays; validate the optimization against long loops and
      large journeys.
- [ ] Break `RichTextEditor` into focused modules for selection handling,
      token serialization, conditional-content decoration, and editing actions
      before adopting a richer editing engine; keep the existing storage format
      compatible throughout the refactor.
  - [x] Extract token-source recovery, temporary editor-control construction, and
        canonical HTML serialization into a focused tested module.
  - [x] Extract selection capture/restoration and inline conditional-frame
        insertion behind a focused hook.
  - [ ] Extract conditional-content decoration and editing actions without
        changing persisted markup or keyboard behavior.
- [ ] Share client and server import validation rules for QSP and other import
      families in `packages/shared` while retaining the server as the final
      authority for persisted-story acceptance.
- [ ] Define one explicit optimistic-mutation recovery policy for failed
      authoring updates: targeted rollback, preserved draft state, or canonical
      reload according to mutation type and user impact.
- [ ] Split the remaining orchestration responsibilities in `StoryEditor` and
      `StoryPlayer` into focused feature modules without duplicating narrative
      runtime state or changing the public behavior of the reader engine.

## P2 — UX, Editor Workflow, And Readability Follow-Ups

These ideas came from the 2026-10-15 review of the authoring workflow and
reader/editor usability. They are follow-up items for product polish and
operational clarity, not a sign that the existing model is incorrect.

- [ ] Adapt the editor layout to narrow windows by preventing top-bar overflow
      and keeping side panels from obscuring the graph canvas.
- [x] Make conditions easier to read by avoiding truncated fields, using a
      vertical rule layout, exposing ET / OU connectors explicitly, and
      keeping the combined-rule summary available without persistent copy.
      **Completed 2026-10-22:** Trigger conditions now show concise readable
      rules by default and reveal vertically stacked controls on demand. The
      editor has uniform field spacing and collapses on Enter or focus leaving
      the condition. Explicit AND/OR connectors remain visible, and the combined
      rule is available from the graph marker tooltip. Empty groups are identified
      as always matching, preserving their existing semantics.
- [ ] Distinguish creation from connection by separating "Add interaction" from
      "Link to an existing interaction" and adding destination search.
- [ ] Improve graph readability with a more suitable working zoom, selection
      centering, explicit condition / chance / delay markers, and easier loop
      tracking for large graphs.
- [ ] Add a reader preview in Simulation Mode with on-demand editing and a
      condition diagnostic panel showing the result, current value, and reason a
      block is unavailable.
- [ ] Uniformize entity creation by naming before creation, using consistent
      user-facing labels in English/French-friendly terminology, and allowing
      variables and items to be created directly from their detail views.
- [ ] Clarify rule scope by making object ownership explicit and distinguishing
      story-level variables from character-level fields or attributes.
- [ ] Lighten the inspector by compacting the formatting toolbar, collapsing
      secondary settings, and reducing the visual dominance of comments.
- [ ] Improve conditional text editing with easier insertion, spacing,
      keyboard navigation, and visible block-boundary cues.
- [ ] Lighten the reader by hiding empty panels and reducing generic banners so
      the text and choices sit closer together.
- [ ] Streamline the home/creation flow by opening the editor immediately after
      creating a story, compacting cards, and moving demos into an explicit
      Examples section.
- [ ] Harmonize terminology and translations across the product, including
      story/story, variable/characteristic, graph commands, and technical
      vocabulary.
- [ ] Validate the following scenarios after the UX fixes: very large graphs,
      time and delay handling, probability behavior, multiplayer editing,
      and save integrity after story modifications.

## Design-System Audit Follow-Ups — 2026-10-22

These tasks preserve the priorities and open decisions from
[the historical audit](audits/design-system-2026-10-22.md). They are additive
only where existing backlog items do not already cover the work. Update each
resolution field with the correcting commit hash; the audit itself remains an
unchanged snapshot.

### P0 — Reproducible defects

- [x] **DS-01 — Isolate modal layers and preserve keyboard focus** (D1). Portal
      the affected modal through the existing modal patterns and use a shared
      layer token; do not solve the defect with ad hoc z-index escalation.
      Acceptance: hit-testing over the app header reaches the modal layer;
      background controls cannot be activated by pointer or Tab/Shift+Tab;
      Escape closes when allowed and focus returns to the opener. Add a browser
      regression for the reader save dialog. Depends on the existing modal
      keyboard/focus behavior; does not replace the broader manual dialog audit.
      **Completed 2026-10-22:** a shared modal portal and background-isolation
      helper are wired to product and rich-text dialogs. Resolution commit:
      `aaead01`.
- [x] **DS-02 — Keep Trigger geometry stable on hover** (D2). Remove the common
      button hover transform that changes graph markers. Acceptance: root and
      linked Trigger transforms remain stable at rest, hover, focus and selection;
      React Flow selection, connection and drag behavior still pass. Depends on
      existing graph test fixtures. **Completed 2026-10-22:** the shared button
      hover keeps its shadow feedback but no longer assigns `transform`; Playwright
      now checks computed transforms and rendered bounds for root and linked
      markers at rest, hover, focus and selection. Graph selection/drag and the
      existing connection-controller tests pass. The CSS correction and original
      root-marker regression landed in `aaead01`; linked-marker coverage is added
      in this D2 change. Resolution commit: `aaead01`.
- [x] **DS-03 — Make rich-text token controls own their presentation** (D3).
      Remove reliance on graph-only classes for rich-text and conditional-text
      removal controls. Acceptance: same computed placement, color, shape and
      focus treatment in editor, direct reader and direct Simulation routes;
      edit/remove, selection, contenteditable and serialization behavior remain
      unchanged. Depends on existing rich-text token helpers/tests. Resolution
      **Completed 2026-10-22:** rich-text surface, interaction/stat token, and
      conditional-text control rules now live in `apps/web/src/components/richTextEditor.css`
      and load through the shared web entry stylesheet. A direct Simulation
      browser test confirms the graph stylesheet is absent while the link and
      condition removal controls retain their computed placement, color, shape,
      hover, and keyboard-focus treatment; the same values match in the editor.
      Existing component tests cover token removal, conditional-frame unwrapping,
      contenteditable ownership, and clean authored serialization. Resolution
      commit: `7dbd8ec`.
- [x] **DS-04 — Resolve tokens outside product-page scope** (D4). Reuse semantic
      root tokens for shared badges and story settings; do not add a second
      palette. Acceptance: no production CSS consumer outside the product-page
      scope depends on `--product-*`; simulation badge and story settings resolve
      to the current approved colors. **Completed 2026-10-22:** the shared
      `.product-eyebrow` selector now uses root `--color-accent`, so reader and
      editor history labels no longer depend on `--product-accent` from
      `.product-page`. D1's `aaead01` had already moved the Simulation badge and
      Story Settings styling to common semantic tokens. Playwright regression
      coverage verifies those colors in direct Simulation, editor navigation,
      Story Settings, and editor history. Implementation commit: `c45b3b6`.

### P1 — Shared styling and verified behavior

- [ ] **DS-05 — Separate common reader styles from simulation-only styles**
      (D5). Keep the current reader appearance and Simulation behavior while
      removing accidental cascade overrides. Depends on DS-04 token scope.
      Acceptance: normal reader computed card/layout styles match the approved
      baseline; simulation editing, choices, timers and saves are unchanged.
      Resolution commit: TBD.
- [ ] **DS-06 — Make help tooltips dismissible and usable** (D6, D7). Extend the
      existing `FieldHelpTooltip`; do not add a parallel tooltip system.
      Acceptance: Escape dismisses focused help, hover content remains reachable
      while the pointer is over it, focus and pointer states are both usable,
      and essential actions remain available without hover. Resolution commit:
      TBD.
- [ ] **DS-07 — Evaluate contrast and focus indicators by semantic role** (D8,
      D15). First record component/state pairs and proposed values for human
      review; then implement only approved changes. Acceptance: applicable text
      and non-text WCAG criteria pass for enabled states; disabled exceptions and
      graph zoom/target exceptions are documented rather than guessed. Depends
      on human approval of colors. Resolution commit: TBD.
- [ ] **DS-08 — Reconcile typography after product review** (D9). Do not select
      or bundle a new font as part of mechanical cleanup. Acceptance: UI and
      reader families, fallbacks, label/value sizing and catalogue examples are
      agreed and documented; only then align code. Depends on human visual
      approval. Resolution commit: TBD.
- [ ] **DS-09 — Synchronize design documentation with accepted implementation**
      (D11). Preserve historical rationale and resolve contradictions against
      domain invariants/accepted ADRs; update docs alongside the relevant code.
      Acceptance: graph ownership, trigger OR groups, current entities and
      palette statements are accurate; no unapproved visual decision is recorded
      as settled. Resolution commit: TBD.
- [ ] **DS-10 — Clarify CSS ownership and consolidate proven duplicates** (D12, D13).
      Continue the existing feature stylesheet split incrementally. Consolidate
      only patterns with the same semantics/lifecycle and preserve intentional
      post-it, graph, reader and inspector variants. Acceptance: no cascade-order
      regression; duplicated state logic is removed only where callers share the
      same behavior. Resolution commit: TBD.

### P2 — Catalogue, automation and remaining state consistency

- [ ] **DS-11 — Make the design catalogue a live reference** (D10). After the
      relevant components/tokens migrate, render those real components and states
      instead of copied swatch values and claims. Acceptance: each sample matches
      its production owner, the route is discoverable, and examples do not mutate
      stories. Depends on DS-04 and incremental component migration. Resolution
      commit: TBD.
- [ ] **DS-12 — Align remaining action and status variants** (D14). Follow DS-01
      for direct defects, then review only combinations with demonstrated
      conflicts (for example ghost-danger and secondary focus/hover). Acceptance:
      destructive/disabled/selected meaning remains distinguishable and no broad
      palette redesign is included. Depends on human approval where color changes
      are involved. Resolution commit: TBD.
- [ ] **DS-13 — Add staged CSS quality rules without noisy global bans** (D16).
      Evaluate Stylelint against Node 24 and current CI, then enable structural
      rules on migrated CSS and expand by explicit file ownership. Acceptance:
      authored decoration colors, runtime CSS properties, graph geometry and
      intentional fallbacks do not create broad false positives; lint runs in CI
      without auto-fixing source. Depends on DS-10 and token ownership. Resolution
      commit: TBD.
- [ ] **DS-14 — Complete targeted graph and visual regression coverage** (D15, D16).
      Extend existing graph geometry/DND/performance and accessibility coverage
      only for migrated states; retain the existing manual keyboard/focus audit
      item above as the single cross-dialog checklist. Acceptance: graph hit areas,
      React Flow projection, drag thresholds, keyboard alternatives, inspector
      scrolling, reader appearance and bundle budgets remain within baseline.
      Depends on the relevant component migration. Resolution commit: TBD.

## Library Evaluation Candidates — 2026-09-24

These candidates record the author's library-reuse note and the initial layout
review. They are evaluation leads, not accepted dependencies or implementation
commitments. Compare each candidate with the existing implementation and its
tests before replacing code. The current product baseline remains authoritative.

- [x] Evaluate **elkjs / ELK Layered** first for automatic graph organization,
      with **Dagre** as a simpler comparison. Preserve explicit linked Trigger
      vertices, multiple inputs, measured card dimensions, and bottom-output /
      top-input attachment points. Compare dense branches, convergence, cycles,
      disconnected components, repeat-layout stability, selected-only movement,
      execution time, and bundle cost against the existing fixtures. ELK's
      interactive options must not be assumed to freeze every unselected node.
      Reuse the existing batched position mutation and durable undo operation;
      consider on-demand loading and a worker for expensive computation.
- [x] Evaluate **ELK routing**, then **libavoid** if independent obstacle-aware
      edge routing remains necessary. Node placement and edge routing are
      separate responsibilities: adopting computed positions does not make the
      current React Flow edges consume the engine's routed paths automatically.
      ELK routes are now consumed after whole-graph organization; reload and
      manually moved layouts still use the documented fallback, so libavoid remains
      a future option rather than an accepted dependency.
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
