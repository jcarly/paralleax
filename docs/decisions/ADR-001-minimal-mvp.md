# ADR-001 - Minimal MVP

## Status

Accepted.

## Context

Paralleax is intended to become an editor and narrative simulation engine for
interactive scenarios. The long-term vision includes characters, places,
attributes, timing, probabilities, users, permissions, media, integrations, and
exports.

Adding those concepts too early would make it difficult to validate the core
narrative model. The first implementation must prove that authors can create a
story graph, connect interactions, define simple trigger conditions, and read the
result without data loss.

## Decision

The MVP is limited to:

- Story;
- Interaction;
- Trigger;
- Reader.

The MVP excludes characters, places, attributes, variables, AI, media, real-time
collaboration, authentication, user permissions, SQL persistence, and advanced
exports.

## Alternatives Considered

- Build the target narrative model immediately.
- Add users, permissions, and persistence before validating the editor.
- Start with a richer game-like model containing characters, places, and
  variables.

## Positive Consequences

- The editor and reader can be stabilized around a small model.
- Tests can focus on the essential graph and trigger behavior.
- Future concepts can be documented without forcing them into the first
  implementation.
- The project can validate whether the Story / Interaction / Trigger model is
  understandable before adding advanced authoring features.

## Negative Consequences

- Some expected product features are intentionally unavailable in the prototype.
- Several future decisions remain open until the MVP is stable.
- Later versions may need migrations once durable persistence is introduced.

## Follow-Up

Future features must stay documented as target model or roadmap items until the
MVP stability criteria are met.
