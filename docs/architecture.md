# Architecture

Paralleax is a TypeScript monorepo.

## Applications

- `apps/web`: React, Vite, React Flow. Contains the editor, reader, and web tests.
  Graph mapping from stories to React Flow nodes and edges lives in `storyGraph.ts`
  so trigger edge rendering can be tested outside the editor component.
  Editor selection lookups live in `storySelection.ts` so inspector behavior is
  testable outside the React component.
  Canvas connection decisions live in `storyConnection.ts`; the editor component
  keeps API orchestration while pure trigger-link rules stay unit-tested.
- `apps/api`: NestJS. Exposes story endpoints. Story application logic lives in
  `StoriesService`, while MVP in-memory storage is isolated behind `StoriesRepository`.
- `packages/shared`: shared types, narrative reader logic, story operations, trigger cleanup rules, stale-response merge rules, and graph placement helpers used by both the web app and API.

## Guiding Principle

The narrative engine must stay independent from the interface.

The UI creates, visualizes, and edits a story. The engine must be able to evaluate a story without depending on React, React Flow, or NestJS, so it can be reused by other renderers: web app, game, Unity, interactive film, or external tooling.

## Current Flow

1. The API exposes stories through NestJS endpoints.
2. The web app loads a story from the API.
3. The editor displays interactions as a graph.
4. Edits are saved through the API.
5. The editor and API use shared story operations for trigger updates, deletion cleanup, stale-response merges, and child placement.
6. The reader uses shared rules to determine the available interactions.

## Storage

Storage is in memory during the MVP. This keeps the prototype simple to test, but data is lost when the API restarts.

The API accesses that storage through `StoriesRepository` instead of reading a `Map`
directly from the service. Durable persistence can replace the repository later
without moving story endpoint behavior or trigger cleanup rules.

Durable persistence is postponed to a later version.

## Tests and CI

- API: Jest and Supertest.
- Web: Vitest and Testing Library.
- Shared: Vitest for narrative rules and pure story operations.
- Functional: Playwright.
- Coverage: Jest coverage for the API, Vitest V8 coverage for shared and the web app.
- Code style: ESLint and Prettier.
- GitLab CI: typecheck, coverage, build, and Playwright on every pushed commit.
