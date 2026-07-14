# Architecture

Paralleax is a TypeScript monorepo.

## Applications

- `apps/web`: React, Vite, React Flow. Contains the editor, reader, and web tests.
- `apps/api`: NestJS. Exposes story endpoints and keeps data in memory during the MVP.
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

Durable persistence is postponed to a later version.

## Tests and CI

- API: Jest and Supertest.
- Web: Vitest and Testing Library.
- Shared: Vitest for narrative rules and pure story operations.
- Functional: Playwright.
- Coverage: Jest coverage for the API, Vitest V8 coverage for shared and the web app.
- GitLab CI: typecheck, coverage, build, and Playwright on every pushed commit.
