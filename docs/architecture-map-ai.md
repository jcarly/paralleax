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

- Route/mode selection, bootstrap and progress reads, runtime-slice hydration,
  and load/retry state share one component lifecycle. The paginated data loader
  itself already lives in `storyRuntimeLoader.ts`.
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
  results; the click path revalidates availability so a timer that expires after
  render cannot still be selected. The existing evaluation-context backlog task
  should assess repeated work before those projections are consolidated.
- Automatic empty-body pass-through is orchestrated in the page and asks
  `hasVisibleRichTextContent` in the browser's sanitized DOM projection. Preserve
  this reader behavior during extraction. The DOM-based visibility helper cannot
  move into `packages/shared`; a platform-independent narrative rule would need
  its own contract and tests rather than being inferred during refactoring.
- Rendering already reuses `RichTextContent`, `RichTextEditor`,
  `StoryCommentsPanel`, `ReaderSaveDialog`, and `ChoiceTimerBar`. Extract new
  sections only after action and view-data boundaries are clear.

| Responsibility | Boundary and owner | Reuse and dependency |
| --- | --- | --- |
| Route and page composition | `StoryPlayer.tsx` keeps route parameters, effective reader/Simulation mode, access recovery, and final composition. Keep the mutable runtime `Story` projection in one place; if ownership moves to a hook, move it atomically rather than mirroring it. | `useStoryRouteAccessRecovery`, React Router |
| Runtime loading | A focused loading boundary can own bootstrap/progress request cancellation, request keys, retry/error status, and current-step slice hydration. `storyRuntimeLoader.ts` remains the paginated transport/projection loader and owns no narrative rules. | `api` runtime projections, `storyRuntimeLoader.ts`, `useReaderSessionState`, `useStoryRouteAccessRecovery`; keep revision/request-key checks |
| Reader navigation | A focused navigation boundary can own selection idempotency, restart/back/load-save actions, opening selection, and automatic empty-body pass-through/cycle guards. | `useReaderSessionState` remains the only `ReaderProgressState` owner; `useReaderProgressPersistence` remains the save queue; shared replay and availability remain authoritative |
| Simulation authoring | A focused command boundary can own optimistic title/body edits, option creation/rename, and failed-mutation recovery. | `useSimulationMutationPersistence`, `storyMutationResults.ts`, existing graph placement helper; preserve one Story projection owner and safe/unsafe retry policy |
| Live refresh | A focused player policy can own refresh generations, latest-journey slice loading, invalidation coalescing, and deferral during an active Simulation edit/mutation. | Reuse `useStoryRealtime` and `storyRealtime.ts`; coordinate with the runtime loader and navigation signal |
| Presentation | Extract only cohesive page sections after action/view-data boundaries settle. | Reuse `ReaderSaveDialog`, `StoryCommentsPanel`, `RichTextContent`, `RichTextEditor`, `ChoiceTimerBar`, current CSS, and existing accessible interaction patterns |

Candidate module layout, subject to review at each implementation slice:

```text
features/story-player/
  runtime/
    useStoryPlayerLoading.ts
    useStoryPlayerRefresh.ts
  navigation/
    useReaderNavigation.ts
  simulation/
    useSimulationAuthoring.ts
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
