# Code Quality Backlog

Status: Active

Last triaged: 2026-10-25

This page records maintainability, reliability, performance, and test work found
during the August 2026 code review and subsequent technical evaluations. Production gates remain authoritative in
[Production readiness](production-readiness.md).

## Priority Definitions

- **P0** blocks an essential author/reader path, threatens data or security, or
  prevents a scheduled user-validation session.
- **P1** materially improves the validated product direction or is a concrete
  prerequisite to the next delivery result.
- **P2** is useful but can wait without compromising the current product goal.
- **Deferred / Exploration** needs user evidence, a scope decision, or a
  feasibility prototype before it can be scheduled.

Priority is impact, not chronology. If a P1 task depends on P2 work, reassess
whether that dependency is truly required. The [Roadmap](roadmap.md) owns product
sequence; [Production readiness](production-readiness.md) owns release gates.

## Active Delivery View

This backlog is intentionally broader than the near-term delivery queue. The
[Roadmap](roadmap.md) currently leads with guided author validation. Use the
following order when choosing incremental quality work:

1. **Protect the current alpha journey:** address observed data/security issues or
   failures that prevent a scheduled author task. Disposable-project sessions do
   not wait on real-project provider gates; valuable user projects do, per
   [Production readiness](production-readiness.md).
2. **Deliver evidence-backed product slices:** use session findings to pick an
   independently useful authoring fix. `StoryPlayer` incremental extraction stays
   P1 but begins after author observation unless a slice fixes a concrete blocker,
   risk, priority feature, or duplicated rule. Do not start a complete rewrite.
3. **Close the gates for the next release stage:** retain the measured Story-summary
   and React Flow budgets for the open creator alpha; durable import-report
   storage and explicit mutation recovery remain P1 when their stated use cases
   apply.
4. **Use measurements for performance work:** implement repository/query changes
   only where profiles show a meaningful cost. General journey optimization and
   unused cleanup-contract work are P2.
5. **Finish remaining UX/accessibility and design-system work by impact:** the
   manual keyboard/focus audit and reproducible defects outrank CSS consolidation
   or style-only cleanup. DS-01 through DS-04 are resolved; remaining audit work
   retains its task-level P1/P2 status.

Dependency-watch entries such as the Swagger `js-yaml` override and the
development-only `glob@10.5.0` warning are removal conditions, not active feature
work. UX ideas and library candidates remain discovery inputs until a product task
promotes them.

## Priority Reclassifications

- **`StoryPlayer` extraction: P1 -> P1 (retained).** Keep the detailed,
  incremental plan and behavior coverage. Start after author observation unless a
  slice addresses a concrete blocker, feature, risk, or duplication; no complete
  rewrite before sessions.
- **`StoryEditor` split: P1 -> P2, conditional.** Split only where an observed
  workflow, concrete risk, or needed feature benefits; file size alone is not a
  priority.
- **`RichTextEditor` extraction: P1 -> P2.** Preserve compatible incremental
  extraction and tests, but treat it as groundwork for a deferred editor-engine
  choice, not an alpha prerequisite. Tiptap remains unscheduled.
- **Shared evaluation context: P1 -> P2.** It is a prerequisite only before
  consolidating diagnostics; current Reader and Simulation behavior continues.
- **Incremental journey-date recalculation: P1 -> P2.** Keep ordinary progress
  writes and restores on the runtime-checkpoint path in ADR-040; reserve full
  journey reconstruction for explicit automated validation. Optimize that
  validation path only if representative profiles show a material cost.
- **Repository commands and remaining complete-Story cleanup responses: P1 -> P2.**
  Extend targeted mutations only for measured costs or a concrete safe client
  update.
- **Durable import-report retention: P1 -> P1, conditional gate.** Required before
  promising reports survive restarts/multiple instances or before production
  imports; it does not block disposable guided sessions in a test environment.
- **Optimistic-mutation recovery policy: P1 -> P1, retained.** Clarify recovery by
  mutation risk and user impact. Promote a specific path to P0 only if evidence
  shows current behavior can lose saved user work or blocks the alpha journey.
- **Scoped architecture guardrails: explicitly commissioned on 2026-10-25.** Add
  workspace/cycle checks and the calibrated complexity gate as a bounded
  preventive task. This does not change the Roadmap's next product activity:
  guided author sessions remain first. The existing-code complexity baseline is
  a reviewable debt list, not a request for a broad refactor.

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
- [x] Verify with an automated test that a late response from a previous story
      cannot overwrite the active editor or reader route.

## Dependency Watches

- Remove the targeted Swagger `js-yaml` override once Swagger declares the fixed
  patch directly, retaining the high-severity CI audit.
- Remove the development-only `test-exclude -> glob@10.5.0` deprecation once the
  Jest/ts-jest coverage chain supports a maintained `glob` release; do not force
  a transitive major override without an upstream contract.

## P1 — Performance And Persistence

- [ ] **Restore Reader and Simulation from saved runtime checkpoints.** Persist
      the materialized state at the current Interaction and restore it directly
      for autosaves and named saves in both modes. Apply current authored Story
      behavior only to later steps; do not recalculate prior effects during an
      ordinary save or load. Retain full journey replay as an explicit automated
      check that compares replay output with the checkpoint without rewriting it.
      **Depends on:** an API write/validation contract and a rule for references
      to changed or deleted authored entities; see
      [ADR-040](decisions/ADR-040-reader-simulation-runtime-checkpoints.md).
      **Risk:** trusting or reconciling materialized values incorrectly can lose
      saved state or accept inconsistent snapshots. **Acceptance:** Reader and
      Simulation both reopen at the saved Interaction with the saved values;
      editing an already visited effect leaves checkpoint state intact and the
      current effect applies on a later visit; ordinary writes and loads do not
      replay the full prefix; Simulation Back crosses a restored checkpoint
      without per-step snapshots, shortening the journey while preserving its
      current debug values; explicit replay compares only a clean journey against
      its matching Story revision and never changes the save.
      **Verification:** shared reader tests, API and PostgreSQL
      save tests, Reader and Simulation Playwright flows, and an explicit replay
      comparison test.
- [ ] Record story-summary query count, payload size, and latency with many
      large stories, then retain a regression budget.
  - [x] Add authenticated and public stress measurements for 25 Stories with
        1,000 Interactions each, including structured metrics and query, payload,
        and latency budgets.
  - [ ] Run the scheduled/manual PostgreSQL stress lane and retain its measured
        baseline before closing this item.
- [x] Group comment messages by thread once when listing discussions instead of
      filtering the complete message result for every thread.
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

## P2 — Conditional Performance And Persistence

These changes follow representative measurements or a concrete client need; they
are not prerequisites for disposable author sessions.

- [ ] Replace remaining complete-Story delete responses with explicit cleanup
      result contracts where a client can safely apply them and profiling or
      concrete usage justifies the contract.
  - [x] Return compact cleanup results for Interaction, Trigger, and graph-decoration
        deletion and apply their shared domain operations locally.
  - [x] Centralize character-stat and leaf-item cleanup in `packages/shared`, then
        return compact deletion results and apply the same operations in the editor.
  - [ ] Review the unused generic stat-definition and stat-assignment deletion
        endpoints separately before changing their compatibility contracts.
- [ ] Measure long-journey replay and large item graphs, then add interaction and
      item lookup maps only where measurements confirm repeated linear costs.

## P2 — Error Handling And User Feedback

- [x] Give Simulation Mode mutations visible saving, failure, and recovery UI.
- [x] Add retry and empty states to story listing and prevent duplicate submits.
- [ ] Standardize loading, empty, recoverable-error, save-error, and expired-
      session presentation across frontend routes.
- [ ] Make API request identifiers available in optional support details.

## P2 — Static Analysis

- [x] Add source-scoped workspace boundary and cycle checks to CI. Keep the one
      existing mixed API email cycle in the dependency baseline and reject new
      cycles; protect the shared facade, controller/persistence boundary, and
      React Flow graph allowlist.
- [x] Enforce ESLint cyclomatic complexity 20 for production TypeScript with a
      native suppression baseline: 45 findings across 34 files as of
      2026-10-25. Reduce this baseline incrementally; do not refactor the large
      orchestrators solely to clear the metric.
- [ ] Revisit the complexity baseline after guided author sessions. Remove
      entries as affected functions are otherwise changed; do not schedule a
      broad refactor or set a zero-baseline date without evidence.
- [x] Enable 12 type-aware ESLint safety rules on production TypeScript in all
      three workspaces: `no-floating-promises`, `no-misused-promises`,
      `no-unnecessary-type-assertion`, and the `no-unsafe-*` rules. Tests and
      specs remain outside the typed scope. The original 106-file shared probe
      took about 20 seconds and found one `no-unsafe-assignment` in the
      ChoiceScript/QSP converter.
      **Follow-up measurements (2026-10-25):** API matched 136 TypeScript paths,
      took 24.7 seconds, and found 100 diagnostics in seven files, all from
      `no-unsafe-*`. Web matched 247 TypeScript paths, took 67.8 seconds, and
      found 19 diagnostics in nine files: 11 from the three async/assertion rules
      and eight from `no-unsafe-*`. Neither probe had parsing errors. The native
      ESLint suppression baseline now tracks 120 findings across 17 production
      files (one shared, 100 API, 19 web). The full root lint takes about 130
      seconds, compared with 29.4 seconds before typed checks. An earlier probe
      using the full `recommendedTypeChecked` preset exceeded 3.5 minutes.
- [x] Enable the deferred CSS cascade rules across all 18 source stylesheets:
      `no-descending-specificity`, `no-duplicate-selectors`, and
      `declaration-no-important`. The native Stylelint suppression baseline
      records the existing 264, 46, and 49 diagnostics respectively, across nine
      stylesheets. New findings beyond the per-file/rule counts fail lint. This
      file-and-rule count baseline cannot distinguish a new diagnostic from a
      resolved one if their total stays the same; reduce counts as stylesheets
      are otherwise changed. Bulk suppressions are experimental in Stylelint
      17.16.0 and should be re-evaluated when upgrading Stylelint. Preserve
      authored decoration values and graph geometry; global selector bans,
      specificity caps, and raw color/dimension restrictions still need stable
      ownership and approved thresholds.

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

## 2026-10-15 Audit Follow-Ups

These follow-ups came from the October 2026 static audit and should be tracked
as incremental, behavior-preserving improvements. Keep the existing product
rules authoritative; current priorities are assigned per item below, rather
than inherited from the historical audit grouping.

- [ ] **P2, measurement-led:** replace the broad scenario mutation flow with
      focused persistence commands
      such as story metadata, interaction content, and graph-position updates,
      then measure SQL query counts and latency for 100, 600, and 2,000
      interaction stories before broadening the pattern. Do not block alpha
      sessions unless measurements show a core-task problem.
- [x] Centralize import job lifecycle management so cancellation is an actual
      stop signal and the API cannot mark a cancelled job as completed after the
      active job keeps running; add concurrency checks before any persistence and
      add visible cleanup for long-lived in-memory import metadata.
  - [x] Route QSP job cancellation to the worker abort signal, guard the
        persistence boundary, and expire terminal in-memory metadata.
    - [x] Make ChoiceScript parsing cancellable without blocking the API event loop.
- [ ] **P1, conditional gate:** persist import compatibility reports durably so completed, failed, and
      cancelled imports retain their diagnostics across process restarts; define
      retention and ownership before exposing the report as a user-facing
      recovery surface. This applies before promising report retention or running
      production imports, not before disposable alpha sessions in a test
      environment.
- [x] Make ELK the canonical graph-layout strategy while keeping the historic
      custom layout as an explicit fallback or removing it after validation;
      update the large-graph stress benchmark to use the active engine and keep
      the measured baseline aligned with production behavior.
- [x] Reduce repeated graph-layout work by indexing ELK results by node id and
      by avoiding repeated array spreads in lane assignment while preserving
      deterministic ordering for existing graph mutations.
- [ ] **P2, prerequisite only for consolidated diagnostics:** consolidate
      trigger and interaction evaluation behind a single shared
      evaluation context so the reader, Simulation Mode, and unavailable-reason
      projections can reuse one deterministic result object. Do not block current
      Reader or Simulation behavior on this refactor.
- [ ] **P2, measurement-led:** make journey-date recalculation incremental during
      normal reader progression. Ordinary saves and loads use the checkpoint
      contract in ADR-040; full reconstruction remains available for explicit
      automated replay validation. Define backward-navigation behavior at the
      checkpoint boundary before including rewinds in this optimization; validate
      against long loops and large journeys.
- [ ] **P2:** continue breaking `RichTextEditor` into focused modules for selection handling,
      token serialization, conditional-content decoration, and editing actions
      before adopting a richer editing engine; keep the existing storage format
      compatible throughout the refactor. This remains prerequisite work for the
      deferred [Tiptap migration initiative](roadmap.md#deferred-cross-cutting-initiative-rich-text-editor-migration).
      Do not duplicate this task in that initiative.
  - [x] Extract token-source recovery, temporary editor-control construction, and
        canonical HTML serialization into a focused tested module.
  - [x] Extract selection capture/restoration and inline conditional-frame
        insertion behind a focused hook.
  - [ ] Extract conditional-content decoration and editing actions without
        changing persisted markup or keyboard behavior.
- [ ] **P1 when import families expand:** share client and server import
      validation rules for QSP and other import families in `packages/shared`
      while retaining the server as the final authority for persisted-story
      acceptance.
- [ ] **P1:** define one explicit optimistic-mutation recovery policy for failed
      authoring updates: targeted rollback, preserved draft state, or canonical
      reload according to mutation type and user impact.
- [ ] Split the remaining orchestration responsibilities in `StoryEditor` and
      `StoryPlayer` into focused feature modules without duplicating narrative
      runtime state or changing the public behavior of the reader engine.
      **Priority:** targeted `StoryPlayer` slices remain P1; broad `StoryEditor`
      splitting is conditional P2. Wait for author-session observations before
      broad structural work; an earlier slice is justified only by a concrete
      blocker, priority feature, risk, or duplicated rule.
  - [ ] `StoryPlayer` - establish regression coverage before extracting behavior.
        Extend the existing `StoryPlayer.loading.test.tsx` and
        `StoryPlayer.runtime.test.tsx` only for uncovered lifecycle cases:
        timer expiry after returning from a hidden tab or refocusing the window,
        and a real-time invalidation received during focused Simulation editing
        being applied after the edit/mutation settles. Keep the existing route-
        change, stale-slice, automatic-entry, empty-interaction cycle, replay,
        save-slot, timer, and mutation-failure coverage as the behavior baseline.
        **Acceptance:** each new case fails if a stale or deferred update is
        applied at the wrong time; no reader-semantic expectation changes.
  - [ ] `StoryPlayer` - extract initial runtime loading and slice lifecycle.
        Separate bootstrap/context/progress loading, current-step slice
        hydration, retry/error state, and cancellation from page composition.
        Reuse `storyRuntimeLoader.ts` and `useStoryRouteAccessRecovery`; keep
        `StoryRuntimeBootstrap`/slice API contracts and revision checks intact.
        Do not add a second `Story` projection or a second
        `ReaderProgressState` owner. Files: `StoryPlayer.tsx`,
        `features/story-player/loadStoryPlayerRuntime.ts`,
        `features/story-player/runtime/useStoryPlayerLoading.ts`,
        `features/story-player/runtime/useStoryPlayerRuntimeSlice.ts`,
        `features/story-player/navigation/useReaderNavigationGuards.ts`,
        `features/story-player/storyRuntimeLoader.ts`, and
        `StoryPlayer.loading.test.tsx`. Preserve its recoverable-load-error,
        inaccessible-route, prior-route-response, and latest-simulation-slice
        cases; add only missing cancellation/request-key cases.
        **Depends on:** the lifecycle baseline above. **Risk:** stale bootstrap,
        progress, or option-page responses can overwrite a later route or
        journey. **Acceptance:** retry, inaccessible-route recovery, direct
        Simulation starts, and latest-step slices remain unchanged; each loaded
        slice belongs to one Story revision and request key.
  - [ ] `StoryPlayer` - extract navigation and automatic-transition
        orchestration. Move choice revalidation/commit guards, restart,
        Simulation step-back, save restoration, automatic opening selection,
        empty-body pass-through, and cycle-stop bookkeeping behind a focused
        navigation boundary. Continue to call `useReaderSessionState` and
        `useReaderProgressPersistence`; they remain the owners of session state
        and save ordering. Keep availability, replay, effects, and date
        reconstruction in `packages/shared`. Files include `StoryPlayer.tsx`,
        `features/story-player/navigation/useReaderNavigationGuards.ts`,
        `features/story-player/navigation/restoreReaderSave.ts`,
        `features/story-player/navigation/useAutomaticReaderTransitions.ts`,
        `features/story-player/navigation/useReaderChoiceNavigation.ts`, and
        `StoryPlayer.loading.test.tsx` / `StoryPlayer.runtime.test.tsx`.
        Preserve existing opening-choice, direct-start, pass-through/cycle,
        duplicate-commit, restart, backward-step, and save-restore cases.
        **Depends on:** loading lifecycle contract. **Risk:** duplicate choice
        commits, changed transition timing, probability/timer revalidation, or
        incorrect save-slot writes. **Acceptance:** repeated visits, seeded
        probability, timers, focus behavior, starting choices, pass-through,
        cycle stopping, restart, backward replay, and loaded saves preserve their
        current results and keyboard behavior.
  - [ ] `StoryPlayer` - isolate Simulation authoring commands. Extract local
        interaction patching, current-title/body saves, option creation/title
        edits, and recovery after uncertain mutations. Reuse
        `useSimulationMutationPersistence`, `storyMutationResults.ts`, and
        `getStoryGraphClickCreationPosition`; keep one owner for the optimistic
        `Story` projection and keep retry policy aligned with mutation safety.
        Files: `StoryPlayer.tsx`, `features/story-player/useSimulationMutationPersistence.ts`,
        `features/story-player/simulation/useSimulationAuthoringCommands.ts`,
        `features/story/storyMutationResults.ts`, and
        `StoryPlayer.simulation-authoring.test.tsx`.
        Preserve inline-edit, safe-retry, uncertain-create recovery, new-option
        focus, and root/child-option placement cases.
        **Depends on:** the Story projection update contract from runtime loading.
        **Risk:** lost typing, duplicate creation after an uncertain response,
        or a realtime refresh overwriting an active edit. **Acceptance:** inline
        edits remain responsive, safe updates retain retry behavior, unsafe
        creation recovers by reload, and save/error/focus states remain
        accessible.
  - [ ] `StoryPlayer` - isolate live-refresh coordination. Keep
        `useStoryRealtime` and `storyRealtime.ts` as the subscription and shared
        invalidation primitives; extract only the player policy for stale
        refresh generations, latest-session slice loading, invalidation
        coalescing, and deferral while a Simulation edit or mutation is active.
        Files: `StoryPlayer.tsx`, `features/realtime/storyRealtime.ts`,
        `features/story-player/runtime/loadLatestRuntimeSliceForSession.ts`, a
        `features/story-player/runtime/useStoryPlayerRealtimeRefresh.ts`, and
        `StoryPlayer.loading.test.tsx`. Preserve the remote-story-replay and
        latest-slice-after-navigation cases; add the focused-edit deferral case
        from the baseline task. **Depends on:** navigation's current
        journey signal, Simulation mutation lifecycle, and the loading boundary.
        **Risk:** losing an invalidation, applying an old revision, or replacing
        an in-progress draft. **Acceptance:** rapid navigation, overlapping
        invalidations, edit deferral, mutation failure, story deletion, and route
        changes never apply a stale Story or discard local input.
  - [ ] `StoryPlayer` - extract only cohesive presentation sections after the
        state/action contracts settle. Reuse `ReaderSaveDialog`,
        `StoryCommentsPanel`, `RichTextContent`, `RichTextEditor`, and
        `ChoiceTimerBar`; consider focused toolbar/scene, choice-list, and
        inventory/encounter views, but do not create one component per JSX block
        or move behavior into a display-only component. Files: `StoryPlayer.tsx`,
        focused components under `features/story-player/`, existing player CSS,
        `StoryPlayer.access-and-comments.test.tsx`, the save-dialog focus tests,
        and the relevant web component/Playwright suites. **Depends on:** stable
        action and view-data boundaries. **Risk:** focus restoration, keyboard
        activation, accessible names, and reader/simulation visibility may drift.
        **Acceptance:** `StoryPlayer.tsx` primarily composes the route and
        feature sections, with existing controls, focus, and accessible output
        unchanged.
    - [x] Extract the Reader and Simulation choice list into
          `components/PlayerChoices.tsx`. It renders projected options and keeps
          existing timer, inline-title, add-option, unavailable-choice, and
          ending presentation. The route and existing action modules continue to
          own availability, navigation, and authoring mutations.
    - [x] Extract the location, story time, and present-character visual into
          `components/PlayerScene.tsx`, receiving the route's existing view data.
    - [x] Extract the profile, inventory, Simulation control, and encounter
          panels into `components/PlayerContextPanels.tsx` while keeping the same
          Story and Reader state owners.
    - [x] Extract the mode and persistence toolbar into
          `components/PlayerToolbar.tsx`, retaining route-owned callbacks and the
          save-dialog trigger ref for focus restoration.
  - [ ] Keep adjacent backlog items separate from this structural work:
        shared Trigger/interaction evaluation context, incremental journey-date
        recalculation, and Reader/Simulation runtime checkpoints. The first is a
        prerequisite before consolidating repeated diagnostics/availability
        calculations; date recalculation is a measured optimization; checkpoint
        persistence changes are tracked separately in the P1 persistence task.
        None belongs in a behavior-preserving extraction. Do not move narrative rules from
        `packages/shared` into React or change reader/simulation semantics here.
  - [ ] For every implementation slice, add or retain the narrow unit/component
        coverage first, then run the relevant web tests and typecheck; run
        Playwright for critical reader/simulation focus and navigation flows.
        No API, persistence schema, reader-progress version, or external
        dependency change is expected. Keep the refactor under the existing
        incremental module-work priority; this plan does not reorder the roadmap
        delivery queue.

## Consolidated UX Follow-Ups (2026-10-25)

The items below consolidate the 2026-10-15 review and the 36 UX reports audited
on 2026-10-25. They are candidates for observation-led work, not a new delivery
sequence. The Roadmap still leads with guided author sessions and its existing
reliability gates. For this intake, P0 means a reproducible defect that blocks an
essential author task or a scheduled validation session; operational release
gates remain in Production readiness. No report was reproduced in a browser
during this documentation audit, so no new P0 is confirmed. The implementation
and existing test files were inspected, but tests and browser scenarios were not
run in this documentation-only pass. Existing coverage references identify
regression cases in the repository, not tests executed for this audit.

### P1 — Core authoring and access

- [ ] **Make effect authoring easier to scan.** Show a concise summary for each
      saved stat or inventory effect and expose the existing fields for editing
      on demand. Place Add effect after the existing effects. When exactly one
      effect type is available, create it directly; keep the current disabled
      explanations when none are available. Reuse InteractionEffectCard,
      VariablePicker, and ExpressionEditor; keep effect evaluation in
      packages/shared. **Depends on:** current effect types and shared picker /
      expression controls. **Risk:** summaries can misstate expression results
      or diverge from runtime semantics. **Acceptance:** summaries identify the
      target, operation, and authored value; editing preserves stable targets;
      the add action follows the list; the single available type opens its
      existing editor without an extra choice step; no effect type available
      remains recoverable. **Verification:** component tests for every type and
      enabled/disabled combination, plus browser coverage for the authoring flow.
- [ ] **Repair rich-text formatting feedback.** Treat the reported selection,
      formatting, and active-button problems as a functional editor task, not as
      part of the Tiptap/ProseMirror migration. The current toolbar calls
      document.execCommand and does not expose a pressed state; existing unit
      coverage mocks the command rather than checking browser formatting.
      **Depends on:** the existing selection hook, token serializer, sanitizer,
      and rich-text controls. **Risk:** selection restoration, comment anchors,
      or stable narrative tokens can regress. **Acceptance:** a real selected
      range receives the requested formatting; caret and selection states are
      visibly and accessibly reflected by the toolbar; save/reload preserves
      formatting and tokens. **Verification:** focused component tests and a
      Playwright selection-formatting regression. Promote to P0 only if a
      reproduced failure blocks a scheduled author task or loses content.
- [ ] **Make empty Interaction content actionable.** Replace an always-mounted
      WYSIWYG editor with a concise Add content action for a truly empty authored
      body; show an explicit edit action when content is already present and mark
      empty Interactions on the graph. Reuse RichTextContent and RichTextEditor.
      **Depends on:** a clear authored-empty versus reader-visible content rule
      and the existing Reader evaluation. **Risk:** authored-empty content must
      not be confused with conditional content that is currently invisible to a
      reader. **Acceptance:**
      Add content opens and focuses the existing editor; graph status reflects
      authored content; conditionally hidden or unresolved text remains authored
      and editable; Reader auto-entry and pass-through rules do not change.
      **Verification:** component tests for empty, non-empty, and conditional
      bodies, plus a browser flow and the existing Reader transition regressions.
- [ ] **Keep essential editor controls reachable at narrow sizes.** Cover
      left-side graph commands, title,
      comments, and header actions. **Depends on:** existing editor grid and
      comment overlay behavior. **Risk:** fixed side-panel widths can compress
      the graph or hide actions. **Acceptance:** no essential command is clipped,
      covered, or unreachable at supported viewport widths; inspector and
      comment overlays preserve graph access, keyboard focus, and scrolling.
      **Verification:** Playwright at representative narrow, desktop, and short
      viewports. Promote to P0 only when a command is inaccessible during a
      scheduled validation task.
- [ ] **Correct graph cursor affordances.** Reproduce the reported hand cursor
      during connection dragging and align cursor states with pan, selection,
      connection, and node movement. **Depends on:** current React Flow gesture
      projection. **Risk:** cursor rules can make graph actions misleading or
      interfere with handles. **Acceptance:** each action shows the matching
      cursor from press through release; connecting remains distinct from panning
      and rectangular selection. **Verification:** browser regression across
      connection, pan, selection, and cancel states. This remains a reported
      issue until that browser check is run.

### P2 — Workflow comprehension and debugging

- [ ] **Simplify variable-owner selection.** VariablePicker is already shared by
      rich text, expressions, and Trigger conditions. Extend this component and
      its shared path-label helper so a lone owner does not require a redundant
      owner choice or display the French Monde / English World level by itself.
      **Depends on:** the existing same-Story assignment tree. **Risk:** hiding an
      owner level must not make saved references ambiguous or hide owners when
      more than one is available. **Acceptance:** one owner is selected without
      an unnecessary owner step; multiple owners retain clear localized paths;
      all existing assignment targets remain selectable. **Verification:** picker
      tests in English, French, and Italian and a browser selection flow. The
      related request to highlight Interactions that modify a selected variable
      is already planned as the Workbench State view's reads/writes/dependencies
      projection in [Workbench](workbench.md#state); keep it within that shared
      projection instead of adding a parallel filter task.
- [ ] **Improve graph navigation and information density.** Consolidate graph
      readability around three proposed zoom levels (structure,
      essential information, details), explicit effects/condition/chance/delay
      markers, and loop tracking. Middle-button pan and Space + primary drag are
      already implemented and have a Playwright test; first improve discovery of
      Space + drag and only add another gesture if user sessions show a need.
      **Depends on:** existing graph projection and gesture controller. **Risk:**
      extra card detail and markers can harm large-graph performance or conflict
      with selection and connection gestures. **Acceptance:** each zoom level has
      a defined information set; a user can discover panning without hiding the
      selection action; markers use authored data and do not change Trigger
      semantics; large-graph rendering remains within the existing budget.
      **Verification:** projection/component tests and Playwright at multiple
      zooms and viewport sizes. Whether zoom levels are worth shipping remains
      open in Story Canvas UX.
- [ ] **Create shared parents and children from graph multi-selection.** Reuse
      the existing selection, Interaction creation, and Trigger mutations. A
      common parent creates one Interaction and, for each selected output
      Interaction, one Trigger whose input is the new parent. A common child
      creates one new output Interaction and one Trigger whose input list
      contains all selected Interactions. Any one selected Interaction can be
      the source that makes this Trigger reachable; this is input matching, not
      condition-group logic. Do not replace existing routes or add conditions.
      **Depends on:** graph multi-selection and the existing authored creation
      operations. **Risk:** creation spans multiple writes, so a failed request
      can leave only part of the new graph. **Acceptance:** each action creates
      exactly one new Interaction; parent creation adds one correctly owned
      Trigger to each selected output Interaction; child creation adds one
      Trigger with every selected Interaction in its input list; existing
      links and reader semantics remain unchanged; failed or uncertain saves
      recover through the current mutation/reload behavior without duplicate
      content.
      **Verification:** shared operation/component coverage and Playwright for
      both actions, including save failure and reload recovery.
- [ ] **Make Simulation read like the Reader by default.** Extend the existing
      Simulation preview task to render the current interaction through the
      Reader projection and expose editing on request. Add a diagnostic view for
      currently available and blocked Interactions, relevant Triggers, reasons,
      and current typed values. Existing code already shows playable-character
      stat values and owned items; it does not expose every Story, Location, and
      exact-item assignment in one state view. Reuse shared reader evaluation and
      existing editors; do not add a second condition evaluator or a parallel
      editing model. **Depends on:** the Simulation editing scope and the shared
      Reader/Simulation checkpoint contract in ADR-040. **Risk:** the current
      revision reload replays the whole journey, which changes past effects
      immediately instead of preserving checkpoint state.
      **Acceptance:** Reader and Simulation remain distinct; current values are
      labeled by owner; blocked choices remain inspectable; edits use shared
      operations; both modes preserve state already produced and apply revised
      effects to later visits. Save, reload, and backward-navigation behavior
      follows the shared persistence contract. **Verification:** component and
      StoryPlayer tests, plus Playwright across Reader and Simulation routes.
      Trigger-condition editing remains a separate scope decision.
- [ ] **Launch ordinary Reader mode from the editor.** Add a distinct action to
      open normal /play behavior without the Simulation query, while keeping Test
      as the authoring simulation action. **Depends on:** existing route access
      and Reader save-slot behavior. **Risk:** readers and authors could mistake
      their progress slots or editing capabilities. **Acceptance:** each action
      opens its documented mode; Reader does not show forced paths or author
      editing; Simulation keeps its diagnostics and separate autosave. **Verification:**
      route/component tests and Playwright for mode entry, exit, and save status.
- [ ] **Reduce Inspector density and retain temporary section choices.** Collapse
      Context and timing by default,
      compact secondary controls, and keep open/closed section choices for the
      current editing session only. Prefer component state; use sessionStorage
      only if state must survive a same-tab remount. Do not persist preferences
      to the Story or account. **Depends on:** current native details accordions
      and Inspector selection lifecycle. **Risk:** restoring state across another
      selection can reopen irrelevant fields or lose keyboard context.
      **Acceptance:** the default is concise; authors can reveal fields; state is
      stable for its defined session and resets at the chosen boundary; comments
      remain reachable. **Verification:** component tests for selection changes,
      keyboard access, and session boundaries.
- [ ] **Resize the Inspector accessibly.** Add a bounded width control after the
      narrow-layout rules are stable; keep the graph useful at both limits and
      expose an accessible keyboard-adjustable separator. **Depends on:** the
      responsive layout task. **Risk:** pointer-only resizing or stale widths can
      obscure graph actions on small screens. **Acceptance:** pointer and keyboard
      resizing share documented min/max behavior, width remains transient, and
      the panel cannot cover essential canvas controls. **Verification:** browser
      coverage at min/max widths and keyboard-only operation. Full-screen panel
      modes remain discovery work until resizing is evaluated.
- [ ] **Lighten Reader presentation without disabling time.** Hide the scene
      placeholder when no location or other scene context is relevant; show
      temporal text only when its authored use makes it useful. This is
      presentation behavior only; every Story
      currently has a startDateTime and interactions have duration semantics.
      **Depends on:** an agreed relevance rule for time display. **Risk:** a hidden
      clock can obscure a meaningful temporal condition or effect. **Acceptance:**
      empty location presentation is absent; relevant scene context remains; time
      visibility never changes evaluation, progression, or saved state.
      **Verification:** Reader component and Playwright cases for timed and
      untimed-looking Stories. Optional Story-level time remains a separate open
      domain decision.
- [ ] **Deliver progressive onboarding through V0.7.** Refine the existing
      coherent onboarding / first-story flow around short contextual guidance,
      not a mandatory long tutorial. **Depends on:** guided author-session
      findings. **Risk:** guidance can distract returning authors or teach a
      workflow that changes. **Acceptance:** a first-time author can create and
      test a small branching Story with help available at the point of need; no
      blocking tutorial is required. **Verification:** observe the flow in the
      guided sessions and record workarounds or confusion.

### P3 — Finish and polish

- [ ] **Audit directional arrows in localized UI copy.** The intake requests a
      typographic arrow, while AGENTS.md currently prefers ASCII -> for directional
      and ownership relationships. Settle the scope and apply one rule across
      locales before changing labels; preserve code and authored-expression
      syntax. **Depends on:** the open Interface and presentation question.
      **Risk:** mixed punctuation can make paths harder to scan or translations
      inconsistent. **Acceptance:** the agreed rule is used consistently in
      visible UI, examples, accessibility names, and all supported locales.
      **Verification:** localization/catalogue tests and a browser visual check.
- [ ] **Add restrained transition feedback.** Improve panel arrival, Reader
      transition, and button response only after functional and comprehension
      issues. Reuse existing CSS transitions; do not add an animation framework.
      **Depends on:** reviewed user journeys. **Risk:** motion can add latency,
      distract, or conflict with reduced-motion preferences. **Acceptance:**
      transitions are brief, do not delay input, respect prefers-reduced-motion,
      and leave keyboard focus stable. **Verification:** Playwright for state and
      focus; reduced-motion browser coverage.

### Deferred until product decisions

- [ ] Keep the source/code view as an exploration until open-questions.md decides
      whether it is read-only diagnostics or a second editable representation.
      If editable, prototype stable token/condition identity, sanitization, and
      round-trip compatibility before scheduling implementation. Do not bundle it
      into the unscheduled Tiptap migration.
- [ ] Keep automatic entry beyond the single-opening Reader rule unscheduled
      until the off-path case and narrative intent are defined.
- [ ] Keep automatic cleanup of comments on deleted entities unscheduled until
      the entity-history lifecycle is decided. Missing anchor targets are already
      marked detached and remain available for reattachment; decide whether an
      entity delete should also hide/soft-delete its threads and how undo/restore
      reconnects them. Preserve replies and avoid permanent deletion.

### Other 2026-10-15 follow-ups retained

- [x] Make conditions easier to read by avoiding truncated fields, using a
      vertical rule layout, exposing ET / OU connectors explicitly, and keeping
      the combined-rule summary available without persistent copy.
      **Completed 2026-10-22:** Trigger conditions now show concise readable
      rules by default and reveal vertically stacked controls on demand. The
      editor has uniform field spacing and collapses on Enter or focus leaving
      the condition. Explicit AND/OR connectors remain visible, and the combined
      rule is available from the graph marker tooltip. Empty groups are identified
      as always matching, preserving their existing semantics.
- [ ] Distinguish creation from connection by separating "Add interaction" from
      "Link to an existing interaction" and adding destination search.
- [ ] Uniformize entity creation by naming before creation, using consistent
      user-facing labels in English/French-friendly terminology, and allowing
      variables and items to be created directly from their detail views.
- [ ] Clarify rule scope by making object ownership explicit and distinguishing
      story-level variables from character-level fields or attributes.
- [ ] Improve conditional text editing with easier insertion, spacing,
      keyboard navigation, and visible block-boundary cues.
- [ ] Streamline the home/creation flow by opening the editor immediately after
      creating a story, compacting cards, and moving demos into an explicit
      Examples section.
- [ ] Harmonize terminology and translations across the product, including
      story/story, variable/characteristic, graph commands, and technical
      vocabulary.
- [ ] Validate very large graphs, time and delay handling, probability,
      multiplayer editing, and save integrity after story modifications.

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

- [x] **DS-05 — Separate common reader styles from simulation-only styles**
      (D5). Keep the current reader appearance and Simulation behavior while
      removing accidental cascade overrides. Depends on DS-04 token scope.
      Acceptance: normal reader computed card/layout styles match the approved
      baseline; simulation editing, choices, timers and saves are unchanged.
      **Completed 2026-10-24:** page/card and responsive layout overrides in
      `apps/web/src/features/story-player/storySimulation.css` now require the
      `.simulation-mode` root, so normal reading uses its `.player-page` and
      `.player-card` baseline from `storyPlayer.css`. The save-row surface uses
      the existing root `--color-surface-secondary` token instead of the
      undefined `--color-surface-muted`. Playwright verifies computed Reader and
      Simulation layout at desktop and mobile sizes and the save-row surface in
      both modes; 30 focused StoryPlayer Vitest tests, 3 Playwright regressions,
      lint, typecheck and the web production build passed. Implementation commit:
      `9f44a73`.
- [x] **DS-05 follow-up — Isolate remaining Reader/Simulation component styles**
      (D5). DS-05 isolated page and card layout but left shared toolbar, scene,
      choices, contextual panels, and mobile rules in the later-loaded Simulation
      stylesheet. Move shared presentation to `storyPlayer.css`; keep authoring,
      forced/unavailable choices, history, and Simulation layout scoped in
      `storySimulation.css`. Acceptance covers direct routes, mode navigation,
      desktop/tablet/mobile computed styles, editing, choice states, ending
      cards, and panel scrolling. Completed 2026-10-25: 4 targeted Playwright
      cases, targeted Stylelint, root lint, typecheck, and build passed.
- [x] **DS-06 — Make help tooltips dismissible and usable** (D6, D7). Extend the
      existing `FieldHelpTooltip`; do not add a parallel tooltip system.
      Acceptance: Escape dismisses focused help, hover content remains reachable
      while the pointer is over it, focus and pointer states are both usable,
      and essential actions remain available without hover. **Completed
      2026-10-24:** the tooltip now handles Escape only while open, preserving
      focus and allowing the next Escape to reach and close its containing
      dialog. A short close delay lets the pointer cross from the trigger onto
      the tooltip; visible tooltip content accepts pointer events. Playwright
      covers focused dismissal and essential form controls, pointer travel, and
      containing dialog dismissal/focus restoration. Three browser tests and 11
      focused modal keyboard/unit tests passed; repository lint and typecheck
      and the web production build passed. Implementation commit: `7225199`.
- [x] **DS-07 — Evaluate contrast and focus indicators by semantic role** (D8,
      D15). First record component/state pairs and proposed values for human
      review; then implement only approved changes. Acceptance: applicable text
      and non-text WCAG criteria pass for enabled states; disabled exceptions and
      graph zoom/target exceptions are documented rather than guessed. **Approved
      and completed 2026-10-24:** the reviewed candidates were approved by the
      product owner, then applied with existing semantic tokens. Playwright now
      asserts the listed text ratios, opaque two-color focus rings in light and
      dark contexts, actual Simulation rich-text focus, and graph marker geometry
      and focus contrast. The implementation also corrected the target: the
      rendered Simulation body uses shared `.rich-text-surface`; the named
      `.simulation-body-input` selector is unused. Axe, 622 web unit tests, lint,
      typecheck, and the production build passed. Graph zoom/target-size review
      and the broader D15 keyboard/focus checklist remain in DS-14. Resolution
      commit: `e15e2ba`.

#### DS-07 review proposal (2026-10-24; approved and implemented)

The audit ratios record the original baseline. The candidates below were
reviewed and approved for these component/state pairs; they do not finalize
palette-wide roles. For WCAG 2.2 AA, use 4.5:1 for ordinary text and 3:1 for
meaningful non-text component/state indicators against adjacent colors
(SC 1.4.3 and 1.4.11). SC 2.4.7 requires visible keyboard focus; the separate
SC 2.4.13 requirement for at least a 2 CSS-pixel perimeter area and a 3:1
focus-state contrast change is AAA, not an AA requirement.

| Component/state                                                                                                                                | Original pairing and ratio                                                                                   | Approved correction                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor comment-count badges (`editor.css`: `.location-panel .context-comment-badge`, `.comments-toolbar-button small`)                         | White text on `--color-trigger` `#b78335`: 3.33:1                                                            | Keep the amber surface; use existing `--color-text` `#20221f` for the small count text (4.82:1).                                                                                                                                                                        |
| Editor save status and graph location marker (`editor.css`: `.save-status.saved`; `graph/storyGraph.css`: `.interaction-node-location > span`) | `--color-place` `#5faf72` on white: 2.67:1                                                                   | Use existing `--color-primary` `#2f6250` for the enabled status text and location glyph (7.04:1); retain `--color-place` for fills and dots. The glyph is `aria-hidden` and accompanied by the location name, but the proposal keeps its visual distinction reliable.   |
| Product-page placeholders (`ProductPages.css`: `.product-field input::placeholder`)                                                            | `#a6aaa2` on white: 2.36:1                                                                                   | Use existing `--color-muted` `#666b63` (5.46:1); retain the placeholder role and layout.                                                                                                                                                                                |
| Simulation help (`storySimulation.css`: `.simulation-controls small`)                                                                          | `#8d806a` on `#fffaf0`: 3.72:1                                                                               | Use existing `--color-muted` `#666b63` (5.25:1); preserve size and placement.                                                                                                                                                                                           |
| Shared button/link keyboard focus (`styles.css`: `button:focus-visible`, `.button:focus-visible`, `a:focus-visible`)                           | `--color-primary-halo-strong` composites to `#d1ddd9` on white: 1.39:1; on the light canvas: 1.38:1          | Review a two-color indicator using existing opaque `--color-primary` and `--color-surface`, so a visible edge remains on both light surfaces and dark Simulation Mode chrome.                                                                                           |
| Story title and Simulation text-editor focus (`editor.css`: `.story-title-input:focus`; `storyPlayer.css`: Simulation title/body inputs)       | `--color-primary-focus` `#87a99b` on white: 2.57:1; the translucent Simulation halo is about 1.14:1 on white | Use an opaque existing primary focus edge on these light editing surfaces, without changing field dimensions. Product-page focus border `#6d9383` on white is already 3.41:1 and should remain unchanged.                                                               |
| Graph node-create and Trigger-marker focus (`graph/storyGraph.css`)                                                                            | Translucent focus halo is 1.14–1.39:1 on light surfaces; the primary marker border against amber is 2.12:1   | Review the same two-color focus treatment in graph-specific rules. Preserve marker/card dimensions, rotation, React Flow handles, hit areas, selection, `nodrag`/`nopan`, and drag behavior. Do not promote hover or selection-only styling into a keyboard-focus rule. |

The current Axe suite passes its four representative routes, but does not assert
the focused CSS pairings above. The approved candidates were implemented in
`e15e2ba`; rendered-state assertions now cover the listed editor, product,
Simulation, and graph cases, and the Axe suite was rerun. Already passing
text/focus pairs and product-input focus were left unchanged. Disabled controls
remain exempt where WCAG defines them as inactive; the exemption is limited to
those controls. Graph markers remain 18–20px in authored geometry; zoom, spacing,
and target-size exceptions remain open for browser review and are not inferred
from CSS dimensions alone.

- [x] **DS-08 — Reconcile typography after product review** (D9). Product review
      approved the shared Geist/system interface stack, Georgia narrative stack,
      12px/14px roles, and catalogue samples. No font files were added. Acceptance
      met: families, fallbacks, label/value sizing and catalogue examples are
      agreed, documented, and aligned in code. Graph micro-labels remain
      density-specific. Resolution commit: `3268dda`.
- [x] **DS-09 — Synchronize design documentation with accepted implementation**
      (D11). Preserve historical rationale and resolve contradictions against
      domain invariants/accepted ADRs; update docs alongside the relevant code.
      Acceptance: graph ownership, trigger OR groups, current entities and
      palette statements are accurate; no unapproved visual decision is recorded
      as settled. **Completed 2026-10-24:** design-system references now describe
      current semantic selection/Trigger tokens, mixed spacing units, and the
      unadopted icon-family proposal without settling future palette choices;
      UI direction and design principles match canonical Story ownership and
      current entity scope; Story Canvas and regression scenarios describe OR
      groups as belonging to one Trigger. The audit snapshot remains unchanged.
      Resolution commit: `84d5e79`.
- [x] **DS-10 — Clarify CSS ownership and consolidate proven duplicates** (D12, D13).
      Continue the existing feature stylesheet split incrementally. Consolidate
      only patterns with the same semantics/lifecycle and preserve intentional
      post-it, graph, reader and inspector variants. Acceptance: no cascade-order
      regression; duplicated state logic is removed only where callers share the
      same behavior. **Incremental progress (2026-10-24):** moved `.sr-only` to
      shared `styles.css` because its consumers span product and application
      surfaces; current `FeedbackButton.css` only hides its label responsively,
      so that distinct behavior remains local. Consolidated the identical live /
      reconnecting status-dot rules used by comments, editor and Simulation, and
      grouped the matching condition/effect picker shells, headers, choice grids,
      focus rules and tooltips in their existing inspector stylesheet. Added a
      comment documenting the shared-first CSS import order. Targeted tests
      (51), typecheck, ESLint, Prettier and the web build passed; bundle budgets
      remain within limits. The audit snapshot is unchanged. Slice commit:
      `6b328e8`.
      **Additional progress (2026-10-24):** shared the exact flex row layout of
      context-section and effect-group headings through the editor-owned
      `.editor-heading-row` utility. Kept their semantic classes and local title
      styling. The Trigger variant wrapper remains specialized because it only
      contains an absolutely positioned delete action. Graph marker styles and
      interactions are unchanged. Targeted inspector/context tests (46), web
      typecheck, TypeScript lint, Prettier and web build passed; bundle budgets
      passed. Slice commit: `5579a93`.
      **Additional progress (2026-10-24):** renamed `.location-panel-header` to
      `.editor-context-header` because the same editor context header wraps
      locations, characters, stats, items and Groups. Updated its local style
      selectors and the existing context test; layout and interactions are
      unchanged. Context and group navigation tests (33), web typecheck, ESLint
      and Prettier passed. Slice commit: `31bd21b`.
      **Additional progress (2026-10-24):** consolidated the identical hover,
      selected and `:focus-visible` states of root and linked Trigger markers in
      `storyGraph.css`. Their distinct geometry, rotation, React Flow classes and
      interactions remain unchanged. Graph, Trigger and connection tests (58),
      Prettier and the web build passed; configured bundle budgets passed. Vite
      still reports its existing large-chunk advisory. Slice commit: `f91b376`.
      **Additional progress (2026-10-24):** grouped the identical stacked form
      layouts for rich-text interaction links and conditions, and the identical
      action-row layouts for rich-text and image-URL dialogs, in
      `inspector-controls.css`. Dialog markup and behavior are unchanged.
      RichTextEditor and Interaction Inspector tests (30), Prettier and the web
      build passed; configured bundle budgets passed. The Vite large-chunk
      advisory remains. Slice commit: `341b043`.
      **Additional progress (2026-10-24):** included the graph's `node-create`
      button in the same focus-visible rule because its keyboard focus ring is
      identical to both Trigger marker rings. Its hover state and geometry stay
      local. Graph tests (32) and Prettier passed. Slice commit: `64f1a43`.
      **Additional progress (2026-10-24):** moved the `.story-body` image,
      video and iframe presentation rules from the inspector stylesheet to the
      Story Player stylesheet, beside the class's rendering owner. Reader and
      Simulation continue to share the same declarations; selectors and visual
      behavior are unchanged. Story Player and Simulation tests (29) and
      Prettier passed. Slice commit: `4e573a1`.
      **Additional progress (2026-10-24):** reused `.editor-heading-row` for
      the four inspector section headers in Character, Item Definition and
      Stat Definition inspectors. Removed their duplicate flex alignment rules;
      inspector-specific spacing and title styling remain local. Inspector
      tests (6), targeted ESLint and Prettier passed. Slice commit: `c35b3c2`.
      **Additional progress (2026-10-24):** reused `.editor-heading-row` for
      Trigger variant headings while retaining `.trigger-variant-header` and
      the absolutely positioned group-delete control. Removed the duplicated
      row layout. Trigger Inspector tests (14), targeted ESLint and Prettier
      passed. Slice commit: `9209c1c`.
      **Additional progress (2026-10-24):** moved the shared `.hint` rule from
      the inspector stylesheet to `styles.css`; the class is used across editor
      and reader surfaces. The existing Simulation inventory and interaction
      timing refinements remain local and unchanged. Reader, Simulation and
      inspector tests (45) and Prettier passed. Slice commit: `9c8fe35`.
      **Additional progress (2026-10-24):** moved `.modal-dialog-backdrop`,
      `.modal-dialog` and its heading/paragraph rules from `editor.css` to
      `styles.css` because both Rich Text Editor dialogs and Reader Save dialogs
      render that shell. Editor action-row layout stays local. Portal, Rich Text
      and Reader Save tests (46) and Prettier passed. Slice commit: `b630fb6`.
      **Additional progress (2026-10-24):** shared the identical surface,
      border and positioning declarations for Trigger condition and OR-group
      delete controls. Their sizes, offsets and glyph sizing remain distinct.
      Trigger Inspector and editor condition tests (33) and Prettier passed.
      Slice commit: `5d773c4`.
      **Additional progress (2026-10-24):** separated the 2rem cancel-picker
      dimensions from the smaller Trigger group-delete control. Kept their
      shared icon color and line height, plus each control's existing geometry.
      Trigger and Interaction Inspector tests (25) and Prettier passed. Slice
      commit: `0d0cc7b`.
      **Additional progress (2026-10-24):** moved the context-list category,
      row, thumbnail, and comment-badge rules from `editor.css` to
      `components/StoryContextList.css`, beside their shared component. The new
      sheet loads immediately after the editor sheet; selectors, semantic tokens,
      geometry, and hover/selected behavior are unchanged. Context tests (22),
      Playwright contrast tests (2), Prettier and the web build passed. Bundle
      budgets passed; initial JavaScript is 148.6 KiB / 150.0 KiB. Slice commit:
      `83c31d3`.
      **Additional progress (2026-10-24):** moved the effect-card shell, title,
      removal action, and field-grid rules from `inspector-controls.css` to
      `components/InteractionEffectCard.css`, beside the presentation component
      shared by the inspector and catalogue. Imported the sheet immediately after
      the inspector controls; declarations and effect behavior are unchanged.
      Inspector and catalogue tests (12), Prettier and the web build passed.
      Bundle budgets passed at 148.6 KiB / 150.0 KiB initial JavaScript. Slice
      commit: `f8ac59d`.
      **Completed (2026-10-24):** reviewed the remaining audit-listed candidates.
      Repeated state rules with matching semantics now share declarations; the
      remaining graph, reader, post-it, Trigger, and inspector geometry/state
      variants stay local where their lifecycles differ. Shared context-list and
      effect-card styles now live beside their production components. The
      main-entry import order remains explicit, and the focused context/inspector
      tests, contrast Playwright tests, formatting checks, and web build passed.
      Final ownership slices: `83c31d3`, `f8ac59d`; earlier resolutions are listed
      above.

### P2 — Catalogue, automation and remaining state consistency

- [x] **DS-11 — Make the design catalogue a live reference** (D10). Render
      production-owned components and states instead of copied samples.
      Acceptance: each sample matches its production owner and examples do not
      mutate stories. The original route-discoverability acceptance is superseded
      by the visibility decision below. Depends on DS-04 and incremental component
      migration.
      **Visibility decision (2026-10-24):** Keep the production catalogue
      internal and directly accessible at `/design-system`, with no link in app
      navigation or other product surfaces. The prototype catalogue remains a
      separate exploratory surface. `apps/web/src/App.test.tsx` covers direct
      route rendering and the absence of an app-navigation link. Implemented in
      commit `29c6419`.
      **D10 defect slice completed (2026-10-24):** swatches now read semantic CSS
      variables, typography labels name the variables used by their rendered
      examples, the error field exposes `aria-invalid` and an associated
      description, and Trigger samples reuse the production marker class for
      resting and selected states. The focused catalogue test verifies these
      references. Commit: `5cc5f4f`.
      **Completed (2026-10-24):** context rows now reuse `ContextEntityRow` in the
      catalogue and editor, and effect-card samples use `InteractionEffectCard`,
      also composed by `InteractionInspector`. The sample actions are inert; the
      focused test verifies production ownership and that the examples remain
      present after activation. Resolution commit: `fdb3fb5`.
      **Follow-up defect found and resolved (2026-10-25):** although the catalogue
      reused `InteractionEffectCard`, its labels and controls were styled only
      beneath `.inspector`, so the catalogue showed browser-default fields instead
      of the inspector's compact 12px labels, 14px values, shared borders, and
      surfaces. The existing field rules now also target the card's field region,
      preserving the inspector dimensions and native focus treatment. A focused
      browser regression compares computed label, input, select, spacing, border,
      color, and focus styles between the production inspector and catalogue.
- [x] **DS-12 — Align remaining action and status variants** (D14). Follow DS-01
      for direct defects, then review only combinations with demonstrated
      conflicts (for example ghost-danger and secondary focus/hover). Acceptance:
      destructive/disabled/selected meaning remains distinguishable and no broad
      palette redesign is included. **Completed 2026-10-24 after human approval:**
      `.ghost.danger` now uses `--color-danger` text while retaining its transparent
      surface; `.secondary` uses `--color-border` instead of a blue literal.
      Dimensions, hover, and the shared focus treatment are unchanged. The focused
      Playwright regression checks semantic token parity, transparency, and keyboard
      focus. Other action/status variants remain outside this slice. Resolution
      commit: `0735cf6`.
- [x] **DS-13 — Add staged CSS quality rules without noisy global bans** (D16).
      Evaluate Stylelint against Node 24 and current CI, then enable structural
      rules on migrated CSS and expand by explicit file ownership. Acceptance:
      authored decoration colors, runtime CSS properties, graph geometry and
      intentional fallbacks do not create broad false positives; lint runs in CI
      without auto-fixing source. Depends on DS-10 and token ownership.
      **Initial stage completed 2026-10-24:** added Stylelint 17.16.0 as a
      development dependency; its MIT license and Node `>=20.19.0` requirement
      match this repository's Node 24 CI. The normal lint command now invokes
      Stylelint on the explicitly owned `StoryContextList.css`,
      `InteractionEffectCard.css`, and `richTextEditor.css` files. Built-in rules
      detect unknown properties, at-rules and pseudo-classes, empty blocks, and
      duplicate declarations; consecutive duplicate declarations with different
      values remain allowed as browser fallbacks. Runtime custom properties pass.
      No standard preset, color/value naming policy, auto-fix, or whole-tree CSS
      glob was added. React Flow, authored graph decorations, Prototype and
      Simulation styles stay outside this initial scope. CLI probes rejected an
      unknown property while accepting a custom runtime variable and a differing
      fallback declaration. Extend the target list only as ownership is reviewed.
      Resolution commit: `ad57b65`.
      **Coverage and objective-rule expansion completed 2026-10-25:** the
      `apps/web/src/**/*.css` glob now checks all 18 source stylesheets, including
      graph, Simulation, and the lazy prototype routes. Global token references
      use only `styles.css`; component-local custom properties stay local, so a
      prototype-only `--muted` token cannot make a missing editor token look
      valid. Enabled unknown custom-property, invalid property-value, selector,
      media-feature name/value, media-query, and shorthand-override checks after
      auditing their current diagnostics. The `referenceFiles` token lookup is
      covered by an isolated test because Stylelint marks that option
      experimental. Corrected stale `--color-text-muted`, `--product-forest`,
      `--border`, `--surface-soft`, and `--muted` references, declared the two
      timer values that `ChoiceTimerBar.tsx` sets dynamically, and corrected an
      invalid prototype `font` shorthand. Added isolated Stylelint rule tests.
      ESLint now errors on explicit `any` and fails CI on any warning; the
      existing lint had no warnings. A targeted `no-restricted-imports` rule
      protects the documented framework-independent boundary of
      `packages/shared`.
      Globally enabling `no-descending-specificity`, `no-duplicate-selectors`,
      and `declaration-no-important` was deferred: the audit reported 264, 46,
      and 49 existing diagnostics respectively, many from responsive/cascade
      overrides, the prototype, and third-party graph styling. A full
      type-aware ESLint probe across web, API, and shared exceeded 3.5 minutes
      without completing, compared with 29.4 seconds for the prior root lint.
      No broad UI-feature import restriction was added because the `components`
      directory mixes generic controls with domain inspectors that intentionally
      import `features/comments/InspectorCommentField`. At the time, the bounded
      typed-lint and targeted CSS pilots remained P2 backlog items; global-selector
      bans, specificity caps, and raw color/dimension restrictions still need
      stable ownership and approved thresholds.
      **Deferred-rule pilots completed 2026-10-25:** all three CSS rules are now
      enabled with Stylelint's native bulk suppression file, containing the
      audited existing counts. The typed ESLint pilot covers only production
      files in `packages/shared/src`, with one existing unsafe assignment in its
      native suppression baseline. The experimental Stylelint suppression
      feature is version-sensitive; reassess it on Stylelint upgrades.
- [x] **DS-14 — Complete targeted graph and visual regression coverage** (D15, D16).
      Completed 2026-10-24 after the relevant component migrations. Reused the
      existing React Flow marker geometry, routing/projection, drag and pan
      alternatives, inspector scrolling, Reader/Simulation appearance, contrast,
      and 600-interaction development/production performance coverage. Added an
      explicit dnd-kit mouse activation regression: movement at 4 CSS px remains
      below threshold, movement at 6 CSS px activates the drag, and Escape cancels
      without writes. The two 100-interaction/cycle layout-quality cases still
      report their existing expected routing failures (15 edge crossings in the
      tangled graph; 3 edge/node intersections after cycle reload); this slice
      preserves and records them without changing graph behavior. Validation:
      36 targeted Playwright tests and both performance projects passed; layout
      audit cases completed as expected failures; lint, format, typecheck, and
      production build/bundle budgets passed. The separate manual keyboard/focus
      checklist and browser zoom/target-size review remain open under D15.
      Resolution commit: `2cd35b8`.

- [ ] **DS-15 — Review specialized field exceptions after adoption.** Keep this
      P2 follow-up behind the manual keyboard/focus audit and guided author
      validation. After the shared standard/compact styles are used in production,
      review search and toolbar controls, native date/time fields, expression
      editors, and graph controls against author feedback at desktop and mobile
      widths. Record only evidence-backed changes; preserve specialized behavior
      and do not reopen DS-01 through DS-14.

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
- [ ] Evaluate **React Hook Form with the existing Zod dependency** only where
      it demonstrably simplifies a specific inspector form. The 2026-10-25
      source scan found no Zod imports in the web application; confirm that
      finding before considering React Hook Form, and do not add a new form
      state model without an observed validation or draft problem. Preserve
      current autosave, validation, draft, and optimistic persistence behavior.
- [ ] Evaluate **Chevrotain** if a concrete ChoiceScript, QSP, or expression
      grammar expansion justifies replacing part of an existing parser. Compare
      one grammar with the current implementation; Peggy may be included only as
      a parser-generator comparison on that same grammar. Preserve the staged
      adapters, source locations, cancellation, compatibility reports, and
      canonical Story mapping; a parser library does not resolve unsupported
      source runtime semantics. Keep the current parser if the comparison does
      not reduce custom grammar code without losing diagnostics or adding a
      costly build/runtime dependency.
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

The [2026-10-25 library reuse audit](audits/library-reuse-2026-10-25.md) records
current implementation evidence, upstream version/license checks, and the
specific candidates that merit bounded experiments. The entries below remain
conditional; this list does not approve any dependency.

## Library Reuse Audit Follow-ups: 2026-10-25

These tasks are backlog work only. Guided author validation, data safety, and
the current roadmap remain ahead of library experiments. Recheck upstream
versions and runtime requirements when a task is scheduled.

- [ ] **P2 — Pilot Knip across npm workspaces.** Add it only as development
      tooling and inspect unused files, exports, and dependencies in the root,
      `apps/web`, `apps/api`, and `packages/shared`. **Depends on:** correct
      workspace entry points, test/config discovery, and dynamic import
      registration. **Acceptance:** classify each finding as confirmed or false
      positive; representative test, worker, Vite, Nest, and script entrypoints
      are discovered; the configuration needs no broad ignore that hides a
      workspace; the report adds no duplicate ESLint, Stylelint, or
      dependency-cruiser rule. If setup noise outweighs unique findings, retain
      the audit report and do not add the tool to CI. **Verification:** Knip
      workspace run, current lint/typecheck, and a review of every finding before
      cleanup.
- [ ] **P2 — Confirm and remove the unused web Zod dependency.** The source scan
      found `zod` declared in `apps/web/package.json` but no application or test
      import. Confirm with Knip or an equivalent complete entrypoint scan before
      editing the manifest and lockfile. **Acceptance:** no static or dynamic
      use remains; the direct web dependency and its now-unneeded lockfile
      entries are removed; the web typecheck, tests, and production bundle still
      pass. Do not add React Hook Form as a replacement. **Verification:** the
      targeted dependency scan and web checks.
- [ ] **P2 — Prototype one Radix Dialog in the existing design system.** Use
      `StorySettingsDialog` as the prototype, adapting Dialog open/close handling
      to its current conditional-mount and `onClose` lifecycle while keeping the
      current styles, labels, fields, and save workflow. Compare it with the shared
      `ModalPortal` and dialog helpers; do not migrate menus, tooltips, or other
      dialogs in the same task. **Acceptance:** the prototype preserves Escape,
      focus entry and restore, Tab wrapping, nested modal isolation, body scroll
      restore, tooltip access inside the dialog, and keyboard isolation from the
      graph; CSS appearance remains aligned with the design tokens; no Story
      access or persistence behavior changes. Record custom code removed, new
      package/runtime cost, bundle delta, test coverage, and any remaining
      lifecycle code. If the shared custom modal stays simpler, keep it.
      **Verification:** focused component tests, accessibility checks, and a
      browser pass through Story settings on desktop and narrow layouts.
- [ ] **P2 — Complete an OpenAPI coverage check before generating client types.**
      `@nestjs/swagger` is already installed, but current API metadata is
      concentrated in the health controller and most Story DTOs lack schema
      decorators. Inventory every method used by `apps/web/src/api.ts`, then
      determine whether its request and response schemas can be represented
      completely from the Nest contract. If so, prototype
      `openapi-typescript` on a small authenticated read/write endpoint set;
      keep `openapi-fetch` out unless it preserves the existing error mapping,
      session-expiry event, cancellation, and upload-progress transport with
      less code. **Acceptance:** generated types agree with DTO validation and
      shared Story types; missing/error responses and cookie auth are explicit;
      binary upload remains correctly represented; generated types are
      reproducible without exposing production Swagger routes. No generated
      client replaces the current request wrapper until a separate comparison
      proves it removes code. **Verification:** schema coverage report, generated
      type check, and focused API client contract tests.
- [ ] **P3 — Compare a parser library only when importer scope grows.** Reuse the
      existing parser evaluation above when a planned source-format feature or a
      recurring parser defect gives it a concrete target. Compare Chevrotain,
      optionally Peggy, and the current implementation on the same grammar and
      existing supported/invalid inputs. **Acceptance:** source file and line
      diagnostics, cancellation, compatibility reporting, canonical Story
      mapping, and current fixtures remain equivalent; record the exact custom
      grammar code removed, dependencies or generated files added, Node 24/ESM
      behavior, and shared/web bundle impact. Preserve the handwritten parser
      when the measured tradeoff is negative. This is not a prerequisite for
      extending importer support.

## Delivery Notes

- Perform module extraction in behavior-preserving slices, not a broad rewrite.
- Pair every behavior change with a regression test and changelog entry.
- Do not prepare a public release while applicable production gates are open.
