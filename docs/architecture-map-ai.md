# Architecture Map for AI Agents

## Canonical flow

```text
Author / Reader UI
        |
        v
apps/web
  React + React Flow
  browser state / optimistic persistence
        |
        | HTTP
        v
apps/api
  NestJS application boundary
  ownership / validation / transactions
        |
        +-------------------+
        |                   |
        v                   v
packages/shared         PostgreSQL
domain + reader         authored state
deterministic rules     reader progress
```

## Central rule

`packages/shared` is the semantic center of Paralleax.

The API and web application may orchestrate the model, but neither may become the
only place where a narrative rule exists.

## Dependency audit snapshot

The 2026-10-25 dependency-cruiser scan covered 557 source modules and 2,018
dependency edges. It found no workspace-boundary violations and no runtime
cycles. One mixed cycle remains between `apps/api/src/email/email.service.ts`
and `apps/api/src/email/test-email-outbox.ts`: the service imports the outbox at
runtime, and the outbox imports `EmailMessage` as a type. It is the only entry
in the architecture baseline. The check rejects any additional cycle.

The graph has 34 dynamic-import edges and 447 type-only edges. The shared public
facade has 212 dependents. High-fan-in modules worth inspecting when their
responsibility changes include `apps/web/src/api.ts` (45 dependents),
`packages/shared/src/model/index.ts` (28), `apps/api/src/stories/stories.repository.ts`
(22), and `apps/web/src/storyGraph.ts` (21). These counts are review context,
not automatic reasons to split a module.

The production-source ESLint census found 86 functions above complexity 15 and
45 above 20. At exploratory thresholds, it also found 2 functions deeper than 4
levels, 27 functions with more than 5 parameters, 66 functions longer than 120
lines, and 31 files longer than 450 lines. Only complexity above 20 is blocking;
the other counts do not justify adding more rules before evidence shows value.

The 10 current web feature-to-feature edges connect the editor/player to shared
story and realtime support. They remain permitted because those modules own
shared feature behavior. The mixed `apps/web/src/components/` directory also
contains feature-aware inspectors, so no blanket generic-component-to-feature
rule is enabled. React Flow imports stay on the explicit graph allowlist in
`.dependency-cruiser.cjs`.

`@formbricks/js` is declared by the web workspace and resolves from Node, but
dependency-cruiser reports it as unresolved through its conditional/type-query
export path. Unresolved imports are not a blocking rule. Semantic duplication
also remains a review responsibility; dependency rules can protect the shared
owner, but cannot prove that equivalent business behavior was not reimplemented.

## Current hotspots

The remaining unusually broad orchestration files are:

- `apps/web/src/pages/StoryEditor.tsx`
- `apps/web/src/pages/StoryPlayer.tsx`

`apps/api/src/stories/stories.service.ts` is intentionally a broad but thin
controller-facing facade. Story metadata, access, mutation coordination, graph,
context/inventory, and reader progress live in focused application services.

The remaining hotspots are functional, but they increase agent risk because
unrelated concepts share large edit surfaces.

Refactor incrementally, extracting one cohesive responsibility when a feature
already requires touching that area.

## Suggested long-term module boundaries

### Shared

```text
model/
  story.ts
  interaction.ts
  trigger.ts
  character.ts
  location.ts
  stat.ts
  item.ts

reader/
  availability.ts
  progress.ts
  replay.ts
  diagnostics.ts

time/
  calendar.ts
  temporal-conditions.ts

operations/
  interactions.ts
  triggers.ts
  merge.ts

items/
  graph.ts

graph/
  placement.ts

demo/
  story.ts

import-export/
  choicescript/
    parser.ts
    models.ts
    graph-builder.ts
    mapping.ts
    report.ts
    importer.ts
```

The ChoiceScript public importer is a thin staged orchestrator. Its internal
source model remains adapter-specific and must not be re-exported as Paralleax
engine semantics.

### API

```text
stories/
  application/
    story-metadata.ts
    story-access.ts
    story-mutations.ts
    story-graph.ts
    story-context.ts
    story-reader-progress.ts
  persistence/
  validation/
  dto/
```

This does not require one Nest provider per file; the goal is responsibility
separation, not ceremony.

### Web

```text
features/story-editor/
  editor.css
  graph/
    storyGraph.css
  persistence/
  inspectors/
    inspector-layout.css
    inspector-controls.css
  navigation/
  simulation/

features/story-player/
  storyPlayer.css
  storySimulation.css
  storyPlayerPresentation.ts
  useReaderProgressPersistence.ts
  useReaderSessionState.ts

features/comments/
  comments.css

styles.css
responsive.css

features/realtime/

features/story/
  storyMutationResults.ts

features/story-editor/persistence/
  storyContextPersistence.ts
  storyGraphPersistence.ts
  storyPersistenceTypes.ts
  useStoryPersistenceLifecycle.ts

features/story-editor/graph/
  useStoryConnectionController.ts

features/story-editor/selection/
  useStoryEditorSelection.ts

features/story-editor/navigation/
  useStoryContextNavigation.ts
```

`StoryPlayer.tsx` still composes the route and Simulation Mode authoring UI, but
reader session projection, persistence ordering, and condition copy now live in
the focused modules above. `useReaderSessionState` delegates every reconstruction
to `packages/shared`; it is not a browser-side narrative engine.

### Story Player incremental boundaries (proposed)

The remaining boundaries below are candidates for the existing
[StoryEditor/StoryPlayer backlog task](code-quality-backlog.md), not modules that
already exist. Extract them one at a time after protecting the current behavior.
The suggested names are provisional; a slice should add a module only when it
has one clear owner and lifecycle.

Current coupling observed in `StoryPlayer.tsx`:

- Route/mode selection and replay side effects remain in one component lifecycle.
  Bootstrap/progress/context assembly lives in `loadStoryPlayerRuntime.ts`;
  `runtime/useStoryPlayerLoading.ts` owns initial request cancellation,
  retry/error state, and the loaded-route key. Current-step slice request keys,
  cancellation, and localized errors live in
  `runtime/useStoryPlayerRuntimeSlice.ts`. The paginated data loader itself
  remains in `storyRuntimeLoader.ts`. Save restoration hydrates the saved journey
  and replays it through `navigation/restoreReaderSave.ts`; the page still applies
  the restored Story projection and persists the resulting session.
- The projected `Story` is updated by initial/slice loads, Simulation's local
  edits and mutation responses, and live refreshes. Keep exactly one owner for
  this mutable projection while extracting those paths.
- Reader progress is already owned by `useReaderSessionState`; a synchronized
  `sessionRef` lets async refreshes read the latest journey. Choice-commit,
  automatic-cycle, navigation-version, realtime-attempt, and edit-deferral refs
  protect different race or transition boundaries and must not be merged into
  one generic flag.
- Availability and condition truth use shared operations. Simulation
  diagnostics and conditional text build several web projections from those
  results; `useReaderChoiceNavigation.ts` revalidates availability so a timer
  that expires after render cannot still be selected. The existing
  evaluation-context backlog task should assess repeated work before those
  projections are consolidated.
- `navigation/useAutomaticReaderTransitions.ts` owns queued opening selection
  and empty-body pass-through. It asks `hasVisibleRichTextContent` in the
  browser's sanitized DOM projection. Cycle-stop, per-step commit, and stale-
  navigation refs live in `navigation/useReaderNavigationGuards.ts`. Preserve
  the reader behavior during further extraction. The DOM-based visibility helper
  cannot move into `packages/shared`; a platform-independent narrative rule
  would need its own contract and tests rather than being inferred during
  refactoring.
- Rendering already reuses `RichTextContent`, `RichTextEditor`,
  `StoryCommentsPanel`, `ReaderSaveDialog`, and `ChoiceTimerBar`. Extract new
  sections only after action and view-data boundaries are clear.

| Responsibility             | Boundary and owner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Reuse and dependency                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route and page composition | `StoryPlayer.tsx` keeps route parameters, effective reader/Simulation mode, access recovery, and final composition. Keep the mutable runtime `Story` projection in one place; if ownership moves to a hook, move it atomically rather than mirroring it.                                                                                                                                                                                                                                                                                                                                                           | `useStoryRouteAccessRecovery`, React Router                                                                                                                                      |
| Runtime loading            | `loadStoryPlayerRuntime.ts` assembles the initial bootstrap/progress/context/first-slice result. `useStoryPlayerLoading.ts` owns initial request cancellation, retry/error state, and the loaded-route key. `useStoryPlayerRuntimeSlice.ts` owns current-step request keys, cancellation, and slice errors. `StoryPlayer.tsx` still owns session replay and the one mutable `Story` projection.                                                                                                                                                                                                                    | `api` runtime projections, `storyRuntimeLoader.ts`, `useReaderSessionState`, `useStoryRouteAccessRecovery`; keep revision/request-key checks                                     |
| Reader navigation          | `useReaderNavigationGuards.ts` owns per-step choice commits, stale-navigation versioning, and automatic-cycle guards. `useReaderChoiceNavigation.ts` revalidates choices and advances through existing session/progress callbacks. `restoreReaderSave.ts` hydrates a saved journey slice and replays through the existing session callback. `useAutomaticReaderTransitions.ts` owns queued opening selection and automatic empty-body pass-through. Restart/back side effects remain in `StoryPlayer.tsx`.                                                                                                         | `useReaderSessionState` remains the only `ReaderProgressState` owner; `useReaderProgressPersistence` remains the save queue; shared replay and availability remain authoritative |
| Simulation authoring       | `simulation/useSimulationAuthoringCommands.ts` owns local interaction patches, current-title/body saves, option creation/title saves, and canonical reload after uncertain mutation failures. `StoryPlayer.tsx` keeps the one mutable Story projection and applies refreshed projections.                                                                                                                                                                                                                                                                                                                          | Reuse `useSimulationMutationPersistence`, `storyMutationResults.ts`, and graph placement helper; preserve the safe update retry and non-retryable create recovery policy         |
| Live refresh               | `useStoryPlayerRealtimeRefresh.ts` owns refresh generations, latest-session slice loading, invalidation coalescing, and deferral during an active Simulation edit/mutation. `StoryPlayer.tsx` applies the refreshed projection and handles access recovery.                                                                                                                                                                                                                                                                                                                                                        | Reuse `useStoryRealtime`, `storyRealtime.ts`, `loadLatestRuntimeSliceForSession.ts`, the runtime loader, and navigation signal                                                   |
| Presentation               | `components/PlayerToolbar.tsx` renders route-owned mode, status, save, navigation, comments, and exit actions; `components/PlayerScene.tsx` renders location, story time, and present characters; `components/PlayerChoices.tsx` renders projected choices, timers, inline title editing, the Simulation add-option action, and the Reader ending; `components/PlayerContextPanels.tsx` renders character, inventory, author-control, and encounter panels from the current Story and reader projection. Availability, navigation, and authoring actions remain supplied by the route and existing feature owners. | Reuse `ReaderSaveDialog`, `StoryCommentsPanel`, `RichTextContent`, `RichTextEditor`, `ChoiceTimerBar`, current CSS, and existing accessible interaction patterns                 |

Incremental module layout, subject to review at each implementation slice:

```text
features/story-player/
  runtime/
    loadLatestRuntimeSliceForSession.ts
    useStoryPlayerRealtimeRefresh.ts
    useStoryPlayerLoading.ts
    useStoryPlayerRuntimeSlice.ts
  navigation/
    restoreReaderSave.ts
    useAutomaticReaderTransitions.ts
    useReaderChoiceNavigation.ts
    useReaderNavigationGuards.ts
  simulation/
    useSimulationAuthoringCommands.ts
  components/
    PlayerToolbar.tsx
    PlayerScene.tsx
    PlayerChoices.tsx
    PlayerContextPanels.tsx
```

Do not turn this layout into one `useStoryPlayer` hook with every page concern.
Keep condition and effect evaluation in `packages/shared`. The pending shared
evaluation-context task is a separate prerequisite before consolidating repeated
availability/diagnostic work; incremental journey-date recalculation is a
separate measured optimization. Neither should be hidden inside structural
extraction. Keep the reader-progress version, save-slot/API contracts, and
reader-visible behavior stable throughout this work. Keep incremental
`StoryPlayer` slices at P1, while following the roadmap sequence: observe author
sessions before broad structural work unless an earlier slice addresses a
concrete blocker, priority feature, risk, or duplicated rule.

## Extraction rule

Do not run a repository-wide rewrite just to reach this shape.

When a task changes one responsibility:

1. protect current behavior with tests;
2. extract the smallest coherent module;
3. keep exports/API stable where practical;
4. implement the requested behavior;
5. verify no semantic drift.
