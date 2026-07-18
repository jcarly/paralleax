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

- Persist stories, interactions, triggers, trigger inputs, and trigger conditions
  in relational PostgreSQL tables.
- Keep ownership, titles, bodies, positions, ordering, and MVP condition fields as
  typed columns with foreign keys and cascading cleanup.
- Keep the public API and shared engine model unchanged: `StoriesRepository`
  assembles relational rows into the existing `Story` domain shape.
- Persist mutations as field- and entity-level differences inside a transaction,
  so independent concurrent field edits do not rewrite an entire story document.
- Keep JSON as a future versioned import/export representation, not the current
  persistence source of truth.
- Keep one canvas position per interaction until multiple layouts become a real
  product requirement.

## Consequences

- The normalization migration deliberately removes existing test stories. The
  deterministic migration-user seed is recreated on API startup.
- Interaction, trigger, input, and condition records can be queried and evolved
  independently before permissions, history, and collaboration are added.
- The frontend and narrative engine continue to consume one assembled `Story`;
  progressive projections can be introduced later without duplicating semantics.
- Concurrent changes to the same trigger structure still require a future
  conflict/version policy; relational persistence only narrows the conflict
  boundary.
