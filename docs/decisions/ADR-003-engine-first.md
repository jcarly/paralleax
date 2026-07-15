# ADR-003 - Engine First

## Status

Accepted.

## Context

Paralleax must support several possible renderers over time: the current web
reader, external websites, game engines, interactive film tooling, exports, and
possibly Unity integrations.

If narrative rules depend on React, React Flow, or NestJS, the engine becomes
harder to test and harder to reuse.

## Decision

Keep narrative logic independent from the interface and API framework.

The shared package owns:

- domain types;
- reader rules;
- story operations;
- trigger cleanup rules;
- stale-response merge rules;
- graph placement helpers when they can be expressed as pure logic.

The web app maps the domain model to UI state. The API exposes and persists
stories but should not redefine narrative semantics.

## Alternatives Considered

- Put reader behavior directly in React components.
- Put all story mutation rules inside the NestJS service.
- Store stories in a UI-specific graph format and evaluate that format directly.

## Positive Consequences

- Reader behavior can be tested without a browser or server.
- Editor, API, and future renderers share the same model.
- UI technology can change without rewriting the narrative engine.
- Domain invariants are easier to document and enforce.

## Negative Consequences

- Some UI workflows need mapping code between domain objects and view objects.
- The shared package must avoid dependencies on application frameworks.
- More care is needed to decide whether a helper belongs in shared code or in an
  app.

## Follow-Up

When adding behavior, first decide whether it is a domain rule, an API
orchestration concern, or a UI interaction concern.
