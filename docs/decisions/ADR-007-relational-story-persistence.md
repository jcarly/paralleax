# ADR-007 - Relational Story Persistence

## Status

Accepted. Supersedes the JSON document storage part of ADR-005.

## Context

The MVP narrative model is stable enough to prepare story sharing, independent
edits, object-level history, and later progressive loading. Persisting a whole
story as one `jsonb` value makes every edit target the same row and provides weak
database constraints for trigger relationships.

Existing story data is test-only and does not require conversion. The migration
may delete it rather than maintain two storage formats or a temporary dual-write
path.

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

- The normalization migrations deliberately remove existing test stories. Tests
  create their own users and story fixtures; normal API startup creates no data.
- Interaction, trigger, and input records can be queried independently before
  permissions, history, and collaboration are added. Conditions evolve with their trigger.
- The frontend and narrative engine continue to consume one assembled `Story`;
  progressive projections can be introduced later without duplicating semantics.
- Concurrent changes to the same trigger structure still require a future
  conflict/version policy; relational persistence only narrows the conflict
  boundary.
