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

## Extraction rule

Do not run a repository-wide rewrite just to reach this shape.

When a task changes one responsibility:

1. protect current behavior with tests;
2. extract the smallest coherent module;
3. keep exports/API stable where practical;
4. implement the requested behavior;
5. verify no semantic drift.
