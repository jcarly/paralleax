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
  currentLocationId?: string | null,
  currentCharacterIds?: string[],
  statValues?: Readonly<Record<string, number>>,
  currentDateTime?: string,
): Interaction[];
```

`currentInteractionId` is `null` before the reader has selected an interaction.
`visitedIds` is the list of interactions already chosen by the reader.
`currentLocationId` is the reader's current authored location, or `null` before
one has been established.
`currentCharacterIds` lists the characters present in the current interaction.
`statValues` contains the current numeric value of each character stat.
`currentDateTime` is the current story-local calendar value. When omitted, the
story's authored `startDateTime` is used.

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
- every `isCurrentLocation: true` condition must reference the current location;
- every `isCurrentLocation: false` condition must reference a different location;
- every `isPresent: true` condition must reference a character in the current
  interaction;
- every `isPresent: false` condition must reference a character absent from the
  current interaction;
- stat conditions compare the current value with `=`, `<`, `<=`, `>`, or `>=`;
- temporal conditions compare the current story-local date, weekday, and time
  with their authored alternatives;
- conditions on the same trigger are evaluated as AND.

Inputs on the same trigger are evaluated as OR.

## Inputless Triggers

Inputless triggers have no input interactions. The MVP distinguishes two cases:

- an inputless trigger without conditions is a starting trigger;
- an inputless trigger with conditions is a contextual trigger.

Starting triggers are evaluated only at the start of reading, when there is no
current interaction. They are not re-offered after the reader has selected an
interaction unless another trigger also makes the same interaction available.

Contextual inputless triggers are evaluated during reading. They can use visited
history, the current authored location, and the current interaction's cast.

## Current Location

Selecting an interaction with a `locationId` changes the reader's current
location to that location. Selecting an interaction without a location preserves
the previous current location. Starting directly from an interaction in
simulation initializes the current location from that interaction, if present.

Stepping backward reconstructs the location by scanning the remaining journey
and taking the most recent interaction that defines one.

## Character Presence

Each interaction has an authored set of present characters. Unlike location,
presence does not carry over: the reader evaluates character conditions against
the current interaction only. Before an interaction has been selected, the
current cast is empty.

## Character Stats

Reader stat state starts from every authored stat's `initialValue`. Selecting an
interaction applies each stat definition's positive or negative hourly change
for the interaction duration. It then applies explicit effects in authored
order: `add` increments the current value and `set` replaces it. The next choices
are evaluated against the resulting values. A rate is prorated by minutes, so
`-2` per hour changes a stat by `-0.5` during a 15-minute interaction.

Starting simulation from a specific interaction applies that interaction's
time-based change and effects. Restart rebuilds the initial state, and stepping
backward replays the remaining journey so changes are reversible without
maintaining an inverse log.

## Item Stats

Every item instance starts with an independent copy of the initial values
assigned by its item definition. Reusing one definition for several instances
does not share their runtime values. The reusable stat definition's hourly rate
is applied to every matching instance as story time advances, then the selected
interaction applies its ordered item-stat `add` or `set` effects.

Item stat effects target an exact item instance and one stat exposed by that
instance's definition. The values are replayed for the complete authored set of
instances; the inventory only decides which instances are currently displayed
to the player.

## Story Time

Every story has an authored `startDateTime` in `YYYY-MM-DDTHH:mm` form. It is a
floating narrative calendar value, not an instant in the reader's system time:
the engine does not apply a browser timezone, daylight-saving transition, or
locale conversion.

Every interaction has a non-negative integer `durationMinutes`. Selecting an
interaction advances story time by that duration before the following choices
are evaluated. The first choices are evaluated at `startDateTime`. Starting
simulation directly from an interaction includes that interaction's duration.
Restart resets the clock, and stepping backward reconstructs it by replaying the
remaining journey. Repeated visits advance time on every selection even though
visited-history conditions retain set semantics.

A temporal trigger condition can contain:

- exact dates;
- inclusive date ranges;
- weekdays;
- time slots.

Entries inside one category are OR alternatives. Non-empty categories are ANDed:
for example, a Monday/Tuesday filter plus 09:00-12:00 and 14:00-18:00 slots
means either slot, but only on Monday or Tuesday. Exact dates and date ranges
form one calendar-date category and are alternatives to each other.

Time-slot starts are inclusive and ends are exclusive. A slot whose end is
earlier than its start crosses midnight. Equal start and end values are invalid,
rather than implicitly meaning either zero time or a full day.

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

## Conditional Body Text

An interaction body can contain a conditional block linked to one outgoing
target interaction. In player reading, the block is rendered only when that
target is connected from the current interaction and is currently available
under the target's trigger conditions.

Simulation Mode always renders stored conditional blocks. A disconnected or
condition-blocked block is dimmed and exposes the reason. Simulation choice
buttons expose their condition summary on hover whether they are available or
blocked.

## History

The current web reader stores visited interaction ids in first-visit order and
does not add duplicates when the same interaction is selected again.

The shared reader converts `visitedIds` to a set for condition checks. MVP
conditions therefore care only whether an interaction has been visited at least
once, not how many times it was visited or when it was visited.

## Persisted Reader Progress

Authenticated player reading, unlike author Simulation Mode, stores one
versioned progress snapshot per user and story. The snapshot is JSON because the
runtime state evolves as typed conditions and effects are added, while
`user_id`, `story_id`, and `updated_at` remain relational columns.

Version 1 stores:

- the complete ordered journey, including repeated interaction visits;
- the current interaction and unique visited-interaction list;
- current story-local date and time;
- current location;
- current character-stat values;
- owned item-instance ids.
- current item-stat values, keyed independently by item instance and stat
  definition.

The ordered journey is authoritative for state that can currently be replayed.
The API derives current interaction, visited ids, story time, location, and stats
from that journey before writing JSON; clients cannot provide trusted derived
values. Owned item ids are validated against item instances in the same story.
Interaction item effects obtain or lose an exact story item instance. Replaying
the ordered journey reconstructs the inventory from an empty starting state.
Obtaining an already owned instance or losing an absent instance is a no-op.
The same replay reconstructs item stat values from their definition defaults,
time-based rates, and explicit interaction effects.

The reader reconciles loaded progress with the authored story it fetched:
interaction and item ids that no longer exist are removed, and replayable
derived values are rebuilt without a second full-graph API read. Restart deletes
the saved snapshot and returns to the authored starting state. Stepping backward
in Simulation Mode remains an author-only operation and never reads or writes
player progress.

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

- generic story variables or non-character attributes;
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
