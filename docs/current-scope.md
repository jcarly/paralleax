# Current Scope

This page describes the implemented product baseline that agents should assume today.
It exists because older MVP and roadmap documents contain historical sequencing that
no longer matches the current repository.

## Implemented baseline

Paralleax currently includes:

- Story authoring and PostgreSQL persistence.
- Interactions with rich content, graph positions, location context, character cast,
  stat effects, item effects, item-stat effects, and duration.
- Triggers with multiple input interactions and typed conditions.
- Reader execution and persisted authenticated reader progress.
- Story-local deterministic calendar time.
- Locations.
- Characters.
- Reusable stat definitions and character stat assignments.
- Reusable item definitions.
- Exact authored item instances, including nested item relationships.
- Character-rooted item placement and nested item relationships. Locations do
  not own item instances.
- Authentication, sessions, creator ownership, health/readiness, migrations, and
  production-oriented API error handling.
- React Flow graph authoring.
- Simulation-oriented reader diagnostics.
- Unit, integration, PostgreSQL, component, and Playwright testing.
- Provider-neutral production API/web images, a migration-first Compose shape,
  exact production-origin enforcement, invitation-code registration, deployment
  smoke checks, and operator runbooks for a private alpha.

## Not yet a stable product contract

The following remain future or incomplete unless a task explicitly implements them:

- generic story variables/attributes beyond current typed stats;
- probabilities and automatic choices;
- real-time choice timers;
- explicit final/completed story semantics;
- multiple player save slots and anonymous saves;
- managed media upload/storage;
- real-time collaboration;
- suggestion/review workflow and delegated story permissions;
- stable public import/export format;
- executable/Unity/video exports;
- AI-driven narrative/runtime behavior.

## Historical documents

`docs/mvp.md` and `docs/roadmap.md` are valuable product history, but their original
version sequencing is not authoritative evidence that already-implemented concepts
are still out of scope.

When an older document conflicts with current code, tests, accepted ADRs, or this
page, update the stale documentation as part of the next relevant documentation
maintenance task.
