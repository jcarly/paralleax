# ADR-023: Durable Authored Story Change History

Status: Accepted

Date: 2026-08-28

## Context

Graph organization, direct manipulation, inspector edits, and context changes
all mutate the same canonical authored Story. A one-off automatic-layout undo
would cover only one command, disappear after reload, and duplicate behavior
needed by every other authoring operation. Collaborative editing also means that
restoring a complete historical Story snapshot could erase unrelated work
committed by another editor.

Reader and Simulation Mode progress, review comments, access settings, and
authored Story content have different ownership and lifecycles. They must not be
combined into one undo stack.

## Decision

Every successful canonical Story-content mutation records one durable,
reversible event in the same PostgreSQL transaction as its relational changes.
The event stores a framework-independent field/entity delta, its author,
revision, operation category, timestamp, and an optional reference to the event
it reverses. Events are appended; undo and redo never delete historical events.

Undo targets the current author's latest active normal or redo event. Redo
targets that author's latest active undo event. Both create a new inverse event
and a new Story revision. Before applying an inverse, every affected value is
compared with the value recorded by the source event. Unrelated later changes
are retained; an overlapping or structurally invalid inverse returns a conflict
instead of overwriting newer authored data.

The shared package owns deterministic delta creation and application. The API
owns authorization, transaction boundaries, history persistence, conflict
mapping, and live invalidation. The web editor owns controls and shortcuts. Its
global shortcuts do not intercept editable fields, so text inputs and rich-text
controls retain native local undo behavior; the explicit toolbar control always
targets canonical Story history once pending persistence is settled.

Undo/redo responses remain authoritative but use the narrowest existing shared
projection contract. An inverse that only changes interaction or Trigger
positions returns those positions with the new Story revision; the editor
applies that patch to its canonical Story state. Other inverses return the full
Story because their shape or downstream effects may span several domain areas.

The web editor may keep a bounded, session-only forward/inverse cache for graph
position events it has just persisted. A matching undo or redo projects that
patch immediately, while the normal API reversal still selects, validates, and
persists the durable event. Any non-position mutation, remote/reloaded revision,
response mismatch, or failed reversal invalidates the cache. Failure also rolls
back the optimistic projection and reloads the authoritative Story.

History includes Story metadata, interactions, triggers, context entities,
typed variables and assignments, item structures, and graph decorations. Story
creation/import, whole-Story deletion, access settings, collaborators, review
comments, and reader/simulation saves are outside this history.

## Consequences

- History and undo remain available after a reload and across editor sessions.
- Automatic graph organization uses the same mechanism as every other authored
  mutation instead of owning a special rollback path.
- Large position-only inverses avoid transferring and replacing unchanged Story
  content while preserving the same durable history and conflict semantics.
- Recently persisted graph-position inverses appear immediately in the current
  editor session without making the browser cache authoritative or durable.
- Collaborative edits to unrelated fields can survive an older inverse.
- Same-field edits and newly introduced references may make an inverse
  incompatible; the author receives a conflict and the current Story is kept.
- The first implementation exposes recent event summaries plus undo/redo state;
  richer history browsing can build on the same append-only event stream.
- Existing stories have no synthetic pre-migration events. Their first new
  content mutation starts the durable history.
