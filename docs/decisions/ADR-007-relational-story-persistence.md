# ADR-007 - Relational Story Persistence

## Status

Accepted. Supersedes the JSON document storage part of ADR-005.

## Context

The MVP narrative model is stable enough to prepare story sharing, independent
edits, object-level history, and later progressive loading. Persisting a whole
story as one `jsonb` value makes every edit target the same row and provides weak
database constraints for trigger relationships.

Legacy JSON stories must be converted in the migration transaction. Existing
data is never assumed to be disposable.

## Decision

- Persist stories, interactions, triggers, and trigger inputs in relational
  PostgreSQL tables. Store each trigger's ordered condition value as JSONB.
- Keep ownership, titles, bodies, positions, and ordering as typed columns with
  foreign keys and cascading cleanup. Validate condition references at the API
  boundary because PostgreSQL cannot apply foreign keys inside JSONB.
- Keep the public API and shared engine model unchanged: `StoriesRepository`
  assembles relational rows into the existing `Story` domain shape.
- Persist mutations as field- and entity-level differences inside a transaction,
  so independent concurrent field edits do not rewrite an entire story document.
- Keep JSON as a future versioned import/export representation, not the current
  persistence source of truth.
- Keep one canvas position per interaction until multiple layouts become a real
  product requirement.

## Consequences

- The normalization migrations convert story metadata, interactions, triggers,
  inputs, conditions, positions, timestamps, and ownership without deleting the
  legacy story.
- Interaction, trigger, and input records can be queried independently before
  permissions, history, and collaboration are added. Conditions evolve with their trigger.
- The frontend and narrative engine continue to consume one assembled `Story`;
  progressive projections can be introduced later without duplicating semantics.
- Concurrent changes to the same trigger structure still require a future
  conflict/version policy; relational persistence only narrows the conflict
  boundary.

## Amendment — 2026-07-26

The original implementation deleted legacy JSON stories. The migration now
performs a forward conversion and PostgreSQL integration tests verify that the
graph, conditions, and owner survive. This amendment supersedes the earlier
test-data exception.
