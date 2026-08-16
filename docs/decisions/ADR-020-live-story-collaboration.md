# ADR-020: Live Story Collaboration by Authorized Invalidation

Status: Accepted

Date: 2026-08-16

## Context

Several editors must be able to work on the same story without reloading the
page. A committed change can affect the graph, trigger projection, context
lists, visual decorations, or deterministic Simulation Mode state. Periodic
polling would leave visible stale windows, while sending complete story payloads
through an event channel would duplicate authorization and make that channel a
second source of truth.

The API already serializes each story mutation with a row lock, reads the latest
aggregate, and persists only the changed relational fields. The web editor also
uses optimistic local updates, including fields that are drafted until blur and
graph positions previewed during drag.

## Decision

The API exposes an authenticated Server-Sent Events stream at
`/stories/:storyId/events`. Effective edit permission is required to subscribe.
Every committed authored-story mutation publishes a story-local invalidation;
access changes and story deletion publish corresponding invalidations. Reader
progress does not, because it is per-reader runtime state rather than authored
story state.

Events contain only the story id, change type, optional revision, and timestamp.
On a change, clients reload the normal authorized story endpoint. A ready event
on connection or reconnection recovers missed changes, repeated invalidations
are coalesced briefly, and heartbeat events keep idle streams open. The canonical
state remains the relational story projection returned by the API.

The editor replaces its local projection with the latest server story only when
there is no active local field edit, graph drag, or mutation request. If an event
arrives during one of those operations, refresh waits until the local mutation
has completed. This protects an unsaved draft while allowing the server's
serialized mutation flow to combine unrelated concurrent changes. If two editors
save the same field, the last committed write is authoritative; this increment
does not introduce CRDT or field-level conflict prompts.

Simulation Mode uses the same stream. After reloading an authored story, it
replays its current ordered journey through the shared deterministic reader
operations. Current interaction, visits, time, location, character stats,
inventory, item stats, conditions, and available choices therefore reflect the
new story immediately without persisting simulation progress.

Story and comment invalidations remain separate streams because comments are a
separate collaboration resource outside the canonical story aggregate. Both
brokers are process-local, matching the current single-API-process deployment.

## Consequences

- Interactions, triggers, their content and positions, context entities, item and
  stat structures, and graph decorations update in open editor sessions without
  a page reload.
- Simulation reflects authored changes by deterministic replay instead of
  partially patching runtime values.
- Existing story authorization remains the only data-access boundary; SSE does
  not expose a story payload.
- Concurrent changes to different fields or entities are combined by serialized
  partial persistence. Same-field edits use last-committed-write behavior.
- Presence, remote cursors, selection indicators, conflict-free same-field text
  editing, change history, and suggestions remain separate work.
- Multiple API replicas require a shared fan-out transport such as PostgreSQL
  `LISTEN`/`NOTIFY` before cross-replica invalidation is guaranteed.
