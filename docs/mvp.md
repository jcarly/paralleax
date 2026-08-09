# MVP

The original MVP validated Paralleax's narrative core around Story, Interaction,
Trigger, and Reader. It is now a historical product milestone rather than the
boundary of the current implementation.

For the authoritative description of what exists today, see
[Current scope](current-scope.md). For future work, see [Roadmap](roadmap.md).

## Validated Narrative Core

The MVP established these foundations:

- Story: create, read, edit, and delete a scenario.
- Interaction: create and edit narrative content, move it in the editor, and delete it safely.
- Trigger: define one output interaction, zero or more alternative input
  interactions, and conditions.
- Reader: execute a story through successive available interactions.
- PostgreSQL persistence for authored stories.
- Authoring reliability around save state, structural deletion, and trigger connections.
- Automated unit, component, API, PostgreSQL, and Playwright coverage for critical flows.

## Capabilities Added Since the Minimal MVP

The current implementation now includes:

- authenticated reader progress;
- local accounts, sessions, and creator ownership;
- locations and current-location conditions;
- characters, interaction casts, and presence conditions;
- reusable numeric character stats, effects, and comparisons;
- reusable item definitions and exact authored item instances;
- recursive item-instance relationships with character roots and nested item
  containers;
- deterministic inventory and item-stat replay from the reader journey;
- story-local calendar time, interaction durations, and date/weekday/time-slot conditions;
- simulation-oriented reader diagnostics;
- production-oriented persistence, migration, health, and API error foundations.

These capabilities must not be treated as out of scope merely because they were
not part of the original MVP.

## Still Outside the Stable Product Contract

Unless explicitly introduced and validated, the following remain future or incomplete:

- generic story variables/attributes beyond the current typed stat model;
- probabilities and probabilistic automatic choices;
- real-time choice countdowns and delayed automatic choices;
- explicit final interactions and completed-story semantics;
- multiple player save slots and anonymous saves;
- managed media upload/storage;
- real-time collaboration;
- public story sharing, delegated permissions, and suggestion/review workflows;
- stable public import/export formats;
- executable, Unity, or video exports;
- AI-driven narrative or runtime behavior.

## Core Rules Established by the MVP

- A Trigger belongs to exactly one output Interaction.
- A Trigger may have several input Interactions; they are alternative reachability sources.
- An inputless Trigger without conditions can expose a starting Interaction.
- An inputless Trigger with conditions is contextual and evaluated against reader state.
- Multiple Triggers may target the same Interaction to represent alternative condition variants.
- Authored story state and reader/runtime state remain separate.
- React Flow graph data is a projection of story state, never the canonical story format.

The exact current semantics live in [Domain invariants](domain-invariants.md),
[Reader semantics](reader-semantics.md), and [Trigger semantics](triggers.md).

## Historical Stability Criteria

The original MVP was considered stable when editor changes did not lose data,
trigger connections remained predictable, save failures were recoverable,
structural deletions were explicit, reader availability respected trigger rules,
and the critical automated test suites passed.

Those criteria remain useful regression expectations, but they are no longer a
complete description of Paralleax's current feature set.
