# Current Scope

This page describes the implemented product baseline that agents should assume today.
It exists because older MVP and roadmap documents contain historical sequencing that
no longer matches the current repository.

## Implemented baseline

Paralleax currently includes:

- Story authoring and PostgreSQL persistence.
- Interactions with rich content, graph positions, location context, character cast,
  stat effects, item effects, item-stat effects, and duration.
- Triggers with multiple input interactions, typed conditions, and optional saved
  positions for linked graph markers.
- Persisted visual graph decorations: movable, resizable colored frames and movable
  text with configurable color, size, family, weight, and style. Decorations stay
  behind interactions and trigger markers and have no reader semantics.
- Reader execution and persisted authenticated reader progress.
- Story-local deterministic calendar time.
- Locations.
- Characters.
- Reusable stat definitions and character stat assignments.
- Reusable item definitions.
- Exact authored item instances, including nested item relationships.
- Character- or location-rooted item placement and nested item relationships.
- Authentication, sessions, creator ownership, global user/admin roles, per-story
  visibility, editing, and editor/reader comment policies, reader/editor invitations,
  authenticated anchored review discussions, health/readiness, migrations, and
  production-oriented API error handling.
- Story review post-its on the graph, interactions, triggers, characters, locations,
  item/stat definitions, and selected title/body/name/description text, with replies,
  open/resolved state, durable quote context, detached-anchor detection, and live
  SSE invalidation/reload for reviewers connected to the same API process. Editors
  use an inspector-integrated list, contextual discussion rail, navigable anchors,
  and expandable graph post-its; authorized readers see and create contextual
  interaction discussions in the player.
- An administrator-only account interface with role summaries, account search and
  filtering, global user/admin assignment, and visible last-administrator protection.
- A unified story library: anonymous visitors see public stories, while signed-in
  users see every story they can read with capability and ownership filters. Local
  return-to-page navigation is preserved through sign-in and registration.
- Editor-only React Flow graph authoring.
- Editor-only Simulation Mode diagnostics.
- Live simultaneous editing for clients connected to the same API process. Every
  committed interaction, trigger, position, context entity, item/stat structure,
  and graph-decoration change invalidates open editor and Simulation Mode clients;
  editors reload the authoritative story without a page refresh, while simulations
  deterministically replay their current journey. Active local drafts and drags
  finish before a remote refresh is applied.
- English and French interface localization with browser detection, a persisted
  user preference, and English fallback. Authored story content is never
  translated by the interface layer.
- Optional Formbricks-powered contextual feedback from the application header,
  with localized controls and non-content route, surface, version, viewport, and
  language context. The integration stays disabled when it is not configured.
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
- presence, remote cursors/selections, conflict-free same-field editing, and
  horizontally distributed story events;
- suggestion workflow, message editing, mentions, notifications, and horizontally
  distributed comment events;
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
