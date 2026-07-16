# Architecture

Paralleax is a TypeScript monorepo.

## Applications

- `apps/web`: React, Vite, React Flow. Contains the editor, reader, and web tests.
  Editor inspector UI lives in dedicated components under `components/`, while
  `StoryEditor` keeps page orchestration.
  Story editor persistence and stale-response merge orchestration live in
  `useStoryEditorPersistence`.
  Graph mapping from stories to React Flow nodes and edges lives in `storyGraph.ts`
  so trigger node and edge rendering can be tested outside the editor component.
  Editor selection lookups live in `storySelection.ts` so inspector behavior is
  testable outside the React component.
  Canvas connection decisions live in `storyConnection.ts`; the editor component
  keeps API orchestration while pure trigger-link rules stay unit-tested.
  Trigger input deletion planning lives in `storyTriggerInput.ts`, keeping link
  deletion explicit and tested.
- `apps/api`: NestJS. Exposes story endpoints. Story application logic lives in
  `StoriesService`, while MVP in-memory storage is isolated behind `StoriesRepository`.
- `packages/shared`: shared types, narrative reader logic, story operations, trigger cleanup rules, stale-response merge rules, and graph placement helpers used by both the web app and API.
  It also contains the local demo story generator used for manual testing and
  regression-friendly sample data.

## Guiding Principle

The narrative engine must stay independent from the interface.

The UI creates, visualizes, and edits a story. The engine must be able to evaluate a story without depending on React, React Flow, or NestJS, so it can be reused by other renderers: web app, game, Unity, interactive film, or external tooling.

## React Flow Boundary

React Flow is currently a good fit for the editor because Paralleax needs custom
interaction nodes, graph edges, dragging, zooming, panning, and connection
gestures. These needs match React Flow's native primitives without forcing the
narrative model into a UI-specific shape.

The important boundary is that React Flow must remain a canvas interaction and
rendering layer. Stories, interactions, triggers, and reader rules must stay in
the Paralleax domain model and shared packages. The application may map domain
objects to React Flow nodes and edges, but it should not store stories as React
Flow data.

The graph is therefore a representation of the narrative model, not the product
itself. Other surfaces, such as simulation, navigation, filtering, review, or a
future reader platform, must be able to use the same story model without
duplicating it.

Current trigger rendering is a projection: a linked trigger is shown as a small
React Flow trigger node between its input interactions and its output
interaction. Each input edge connects an interaction to that trigger node, and
the trigger node connects to the output interaction. Root triggers remain markers
on the interaction itself. The underlying domain model still owns trigger
semantics; React Flow nodes only make the relationships easier to manipulate.

A warning sign would be changing trigger semantics only to match React Flow
constraints. In that case, the integration should be revisited before the UI
starts shaping the engine.

## Current Flow

1. The API exposes stories through NestJS endpoints.
2. The web app loads a story from the API.
3. The editor displays interactions as a graph.
4. Edits are saved through the API.
5. The editor and API use shared story operations for trigger updates, deletion cleanup, stale-response merges, and child placement.
6. The reader uses shared rules to determine the available interactions.
7. The story list can request a local demo story from the API; the API builds it
   through the shared deterministic generator and stores it in memory.

## Storage

Storage is in memory during the MVP. This keeps the prototype simple to test, but data is lost when the API restarts.

The API accesses that storage through `StoriesRepository` instead of reading a `Map`
directly from the service. Durable persistence can replace the repository later
without moving story endpoint behavior or trigger cleanup rules.

Durable persistence is postponed to a later version.

## Styling

The web app currently uses plain CSS with shared custom properties for colors and
elevation. This keeps the MVP light while the graph editor behavior is still
stabilizing.

Tailwind CSS is a candidate to evaluate once the UI surface justifies a
design-system decision. React Flow-specific styles, such as node handles and
trigger markers, may remain in dedicated CSS because they target third-party
graph classes directly.

## Tests and CI

- API: Jest and Supertest.
- Web: Vitest and Testing Library.
- Shared: Vitest for narrative rules and pure story operations.
- Functional: Playwright.
- Coverage: Jest coverage for the API, Vitest V8 coverage for shared and the web app,
  with per-workspace thresholds enforced by the coverage commands.
- Code style: ESLint and Prettier.
- GitLab CI: typecheck, coverage, build, and Playwright on every pushed commit.
