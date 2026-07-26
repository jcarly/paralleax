# ADR-012: Versioned Reader Progress JSON

## Status

Accepted

## Context

Reader state contains an ordered journey and a growing set of runtime values.
Normalizing every future variable, inventory effect, or temporary status before
those systems stabilize would couple persistence to an unfinished runtime
model. Storing the entire row as opaque JSON without relational ownership would
weaken deletion, authorization, and query guarantees.

## Decision

Store one progress row per authenticated user and story. Keep `user_id`,
`story_id`, and `updated_at` relational, with cascading foreign keys and a
composite primary key. Store the versioned runtime snapshot in a JSONB `state`
column.

Version 1 includes the complete ordered journey, current interaction, unique
visits, story-local date/time, location, character-stat values, and owned
item-instance ids.

The client submits only the ordered journey and owned item ids. The API validates
same-story references and reconstructs replayable values before persistence.
Loading reconciles removed authored entities and rebuilds those values. Author
Simulation Mode does not use player progress.

## Consequences

- Runtime state can evolve through explicit JSON versions without immediate
  table proliferation.
- Ownership, account/story deletion, and one-slot uniqueness remain enforced by
  PostgreSQL.
- Common progress listing or analytics will require deliberate projections or
  indexes rather than arbitrary JSON scans.
- Multiple save slots, immutable published-version binding, item effects, and
  progress migration between story revisions remain future work.
