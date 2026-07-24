# ADR-008 - Authored Locations and Runtime Location State

## Status

Accepted.

## Decision

Locations are story-owned authored entities stored relationally. An interaction
may reference one location from its story. Selecting a localized interaction
sets the reader's current location; selecting an interaction without a location
preserves the previous value.

Trigger conditions use a typed location condition with `locationId` and
`isCurrentLocation`. Location references must resolve inside the same story.
The current location remains reader runtime state and is not written back into
the authored story.

## Consequences

- The database enforces same-story interaction location references.
- JSONB trigger conditions require API-level same-story reference validation.
- Reader helpers receive current location explicitly, keeping them deterministic.
- Later persisted play sessions can store the current location without changing
  the authored location model.
