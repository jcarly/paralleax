# Reader Semantics

This page defines the MVP reader behavior implemented by `getAvailableInteractions`.
It is the behavioral contract for executing a story outside the editor.

## Function Shape

The shared reader function evaluates a story from the current interaction and the
visited history:

```ts
getAvailableInteractions(
  story: Story,
  currentInteractionId: string | null,
  visitedIds: string[],
): Interaction[];
```

`currentInteractionId` is `null` before the reader has selected an interaction.
`visitedIds` is the list of interactions already chosen by the reader.

## Trigger Eligibility

A trigger is eligible when:

1. its input rule matches;
2. all its conditions match the visited history.

For input rules:

- a trigger with no inputs and no conditions matches only when
  `currentInteractionId` is `null`;
- a trigger with no inputs and at least one condition has no input constraint and
  can match during reading when its conditions match;
- a trigger with inputs matches when `currentInteractionId` is one of its input
  interaction ids.

For conditions:

- every `hasBeenVisited: true` condition must be present in the visited history;
- every `hasBeenVisited: false` condition must be absent from the visited history;
- conditions on the same trigger are evaluated as AND.

Inputs on the same trigger are evaluated as OR.

## Inputless Triggers

Inputless triggers have no input interactions. The MVP distinguishes two cases:

- an inputless trigger without conditions is a starting trigger;
- an inputless trigger with conditions is a contextual trigger.

Starting triggers are evaluated only at the start of reading, when there is no
current interaction. They are not re-offered after the reader has selected an
interaction unless another trigger also makes the same interaction available.

Contextual inputless triggers are evaluated during reading. In the MVP, they can
only use visited / not visited conditions. Later, the same mechanism can support
world context, such as the current place, current character, time period, or
other state.

A contextual inputless trigger can be offered at the same time as normal linked
transitions. For example, after interaction `A`, interaction `B` may be
available because `A` is one of its trigger inputs, while interaction `X` may
also be available because its inputless trigger condition, such as `C has been
visited`, is already true.

## Available Interaction List

The reader returns each available interaction at most once.

If several triggers on the same interaction are eligible, the interaction still
appears only once in the returned list. The interaction is available when any one
of its triggers is eligible.

The order of available interactions follows the order of `story.interactions`.
There is no separate ordering, priority, sorting, or randomization rule in the
MVP.

## History

The current web reader stores visited interaction ids in first-visit order and
does not add duplicates when the same interaction is selected again.

The shared reader converts `visitedIds` to a set for condition checks. MVP
conditions therefore care only whether an interaction has been visited at least
once, not how many times it was visited or when it was visited.

## Repeated Interactions and Cycles

The MVP reader does not forbid cycles.

An interaction that has already been visited can be offered again if an eligible
trigger makes it available. Selecting it again does not add another duplicate id
to the current web reader history.

## Branch Ending

If no interaction is available after the current interaction, the branch ends.

The reader does not automatically restart, jump to another root interaction, or
select an interaction by itself.

This is not a permanent story-completion rule. Later versions should distinguish
between a branch that currently has no available interaction and an explicit
story ending, likely represented by a final interaction or a play-session
completion state.

## Out of Scope

The MVP reader does not support:

- variables or attributes;
- characters or places;
- timing;
- probabilities;
- automatic choices;
- final interactions;
- weighted or prioritized choices;
- persisted play sessions;
- ordered or repeated history semantics.

These can be added later only after the current Story / Interaction / Trigger /
Reader behavior is stable and covered by tests.

## Author Test Mode Direction

The author-facing test mode may expose more controls than the player reader. It
may eventually be presented as Simulation Mode.

Future test tooling may let authors start from any interaction, list relevant
unavailable interactions in a disabled state, explain failed trigger evaluation,
force an unavailable interaction for inspection, edit or jump back to the graph
from a tested interaction or trigger, and override visited preconditions
manually.

Simulation state should distinguish interactions actually selected during the
test journey from interactions manually marked as simulated preconditions. The
engine may evaluate availability against their union, but the UI should keep them
visually separate.

These controls are debugging and authoring tools. They should not change the
player reader contract unless the reader semantics are explicitly updated.
