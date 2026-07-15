# ADR-002 - React, NestJS, and TypeScript

## Status

Accepted.

## Context

Paralleax needs a web editor, an API, and shared narrative logic. The prototype
should keep the engine independent from the UI while still allowing fast
iteration on the editor and reader.

The codebase also needs a structure that can later support durable persistence,
exports, and other renderers without rewriting the core model.

## Decision

Use a TypeScript monorepo with:

- React and Vite for the web app;
- NestJS for the API;
- shared TypeScript packages for the model, story operations, reader rules, and
  pure helpers.

Use npm workspaces to keep the applications and shared package in one repository.

## Alternatives Considered

- Keep a single full-stack framework.
- Use Next.js as the only application layer.
- Use Express without the NestJS module and dependency structure.
- Keep model types duplicated between frontend and backend.

## Positive Consequences

- Shared types reduce drift between API, editor, and reader.
- The narrative engine can be tested independently from React and NestJS.
- The web app and API can evolve with clear responsibilities.
- The monorepo keeps cross-workspace changes easy to review.

## Negative Consequences

- The project has more configuration than a single app.
- Development requires coordinating multiple workspaces.
- Some behavior must be tested at both shared and application boundaries.

## Follow-Up

Keep shared narrative behavior in `packages/shared` unless there is a clear
application-specific reason not to.
