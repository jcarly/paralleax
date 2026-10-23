# ADR-034: Collaborative Editing and Offline Authoring

Status: Accepted

Date: 2026-10-17

## Context

ADR-020 implements live collaboration by broadcasting authorized Story
invalidations and reloading the canonical Story. It combines unrelated partial
writes, but same-field writes are last-committed-write wins. Authors want a
Google-Docs-like experience for simultaneous text editing and the ability to
continue authoring the Story that is already open during a network outage.

## Decision

Adopt the following product contract for future collaborative authoring:

- Do not lock fields while someone is editing them.
- Merge simultaneous edits to text fields, including titles and rich-text
  interaction bodies, as live collaborative text operations. A whole-field
  last-write-wins update is not acceptable for those text fields.
- Keep structured values such as numbers, dates, and selections atomic. Edits to
  unrelated fields coexist. If two authors change the same atomic field before
  observing the other's update, show an explicit resolution that preserves both
  the current server value and the local draft. Never silently discard either.
- When connectivity is lost, allow continued editing of the already-open Story.
  Persist pending authored changes locally and synchronize them after
  reconnection. This decision does not add offline browsing of other Stories or
  offline Reader progress.
- Retry transient network failures a bounded number of times, then offer the
  author the option to continue in offline mode. Handle explicit API failures by
  stable error code: log and localize the failure, then preserve or reload state
  as appropriate to that code. Logs must not contain authored content or
  credentials.
- Keep PostgreSQL and the authorized Story API as the canonical persisted state.
  Locally queued work is pending until accepted by the server.

## Implementation Constraints

- ADR-020's invalidation stream remains the current implementation and can
  continue to carry canonical invalidations. Its same-field last-write-wins
  behavior is superseded by this decision when collaborative editing is
  implemented.
- Before implementation, evaluate maintained collaboration libraries and
  protocols against the existing rich-text format, stable authored tokens,
  undo/history behavior, API authorization, browser storage, reconnect/replay,
  and supported browser targets. This ADR does not select OT, CRDT, a transport,
  or a storage library.
- Define idempotent queued-mutation identities, local durability and recovery,
  retry limits, text-operation persistence, and atomic-field conflict UX in the
  implementation contract. Preserve Story ownership and deterministic reader
  semantics.
- A network outage must not turn unacknowledged local edits into a claim that
  they were saved to the canonical Story.

## Consequences

- Concurrent edits to different fields do not conflict.
- Concurrent text edits merge rather than replacing one author's complete
  field value with another's.
- Conflicts remain explicit for the rare overlapping atomic-field edits,
  especially when queued work reconnects after an offline interval.
- Durable offline authoring is a separate capability from offline Reader saves.
- Presence, remote cursors and selections, and cross-replica event fan-out are
  not implied by this decision.
