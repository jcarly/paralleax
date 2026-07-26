# ADR-010 - Character Stats as Reconstructable Reader State

## Status

Accepted.

## Decision

A numeric stat belongs to one character and one story. It has an authored
initial value. Interactions may apply one `add` or `set` effect per stat, and
triggers may compare the current value using `=`, `<`, `<=`, `>`, or `>=`.

The reader does not persist mutable stat values in the authored story. It derives
them from initial values and the ordered interaction journey. Backward navigation
replays the remaining journey instead of attempting to invert effects.

Stats and effects use relational tables with same-story composite foreign keys.
Trigger conditions remain typed JSON on their owning trigger, with references
validated by the application service.

## Consequences

- Reader execution is deterministic and stat state can be rebuilt after restart
  or backward navigation.
- Authoring remains explicit; this does not introduce a generic untyped variable
  bag.
- Persisted player sessions and general world variables remain separate future
  concerns.
