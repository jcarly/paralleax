# ADR-009 - Characters as Current-Interaction Context

## Status

Accepted.

## Decision

Characters are story-owned authored entities. An interaction references an
ordered set of present character ids through a relational join.

Trigger character conditions use `characterId` and `isPresent`. They evaluate
against the cast of the current interaction. Character presence does not carry
between interactions and is empty before the reader selects an interaction.

## Consequences

- An interaction may involve several characters, while it still has at most one
  location transition.
- The database and API enforce same-story character references.
- Reader helpers receive current character ids explicitly and remain
  deterministic.
- Persistent party membership, character movement, point of view, and
  relationships remain separate future state concepts.
