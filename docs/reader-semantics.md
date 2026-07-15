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

- a trigger with no inputs matches only when `currentInteractionId` is `null`;
- a trigger with inputs matches when `currentInteractionId` is one of its input
  interaction ids.

For conditions:

- every `hasBeenVisited: true` condition must be present in the visited history;
- every `hasBeenVisited: false` condition must be absent from the visited history;
- conditions on the same trigger are evaluated as AND.

Inputs on the same trigger are evaluated as OR.

## Starting Interactions

Starting interactions are interactions with at least one root trigger. A root
trigger has no input interactions.

Root triggers are evaluated only at the start of reading, when there is no
current interaction. They are not re-offered after the reader has selected an
interaction unless another linked trigger also makes the same interaction
available.

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

## Out of Scope

The MVP reader does not support:

- variables or attributes;
- characters or places;
- timing;
- probabilities;
- automatic choices;
- weighted or prioritized choices;
- persisted play sessions;
- ordered or repeated history semantics.

These can be added later only after the current Story / Interaction / Trigger /
Reader behavior is stable and covered by tests.
