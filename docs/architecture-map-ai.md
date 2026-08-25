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

The repository has four unusually broad orchestration files:

- `apps/api/src/stories/stories.service.ts`
- `apps/web/src/hooks/useStoryEditorPersistence.ts`
- `apps/web/src/pages/StoryEditor.tsx`
- `apps/web/src/pages/StoryPlayer.tsx`

They are functional, but they increase agent risk because unrelated concepts share
large edit surfaces.

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

imports/
  intermediate-model.ts
  validation.ts
```

### API

```text
stories/
  application/
    story.service.ts
    interaction.service.ts
    trigger.service.ts
    context.service.ts
    reader-progress.service.ts
  persistence/
  validation/
  dto/
```

This does not require one Nest provider per file; the goal is responsibility
separation, not ceremony.

### Web

```text
features/story-editor/
  graph/
  persistence/
  inspectors/
  navigation/
  simulation/

features/story-player/

features/realtime/

features/story/
  storyMutationResults.ts
```

## Extraction rule

Do not run a repository-wide rewrite just to reach this shape.

When a task changes one responsibility:

1. protect current behavior with tests;
2. extract the smallest coherent module;
3. keep exports/API stable where practical;
4. implement the requested behavior;
5. verify no semantic drift.
