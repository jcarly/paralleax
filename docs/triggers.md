# Trigger Semantics

This page defines how triggers should behave in the MVP editor and reader.

## Definition

A trigger determines when an output interaction becomes available.

In the current MVP model, a trigger belongs to one output interaction and contains:

- one trigger id;
- zero, one, or several input interaction ids;
- one or more condition groups, each containing zero or several conditions;
- one appearance probability from 0 through 100, defaulting to 100.
- one nullable non-negative timer in seconds, defaulting to no timer.

## Inputs

A trigger can have several input interactions.

Several inputs on the same trigger represent an OR:

- if the reader is currently on any one of those input interactions, the trigger input rule matches;
- the trigger is still available only if one complete condition group matches
  and its appearance roll succeeds.

Example:

```text
A ----\
      Trigger T ----> C
B ----/
```

Here, interaction `C` can become available after `A` or after `B`, depending on the rest of the trigger conditions.

## Conditions

Conditions inside one group represent an AND. Groups on the same Trigger
represent an OR:

- every "visited" condition must be present in the reader history;
- every "not visited" condition must be absent from the reader history.
- every "current location" condition must match the reader location;
- every "not current location" condition must not match it.
- every "present character" condition must belong to the current interaction's cast;
- every "absent character" condition must not belong to that cast.
- every typed stat comparison must use a matching runtime type. Numbers
  support `=`, `!=`, `<`, `<=`, `>`, and `>=`; booleans and strings support
  `=` and `!=`. A missing value never defaults to zero.
- every temporal condition must match each non-empty calendar category; entries
  within its dates/date ranges, weekdays, or time slots are alternatives.

Inputs answer "where can this trigger come from?"

Conditions answer "what must already be true about the path or reader context?"

After input and condition-group evaluation, the reader makes one deterministic
appearance roll for the Trigger. The roll uses the saved run seed, narrative
step, and Trigger id. It is therefore stable across rendering, reload, backward
replay, and Simulation diagnostics. Separate Triggers always roll separately.

After those gates succeed, a configured timer keeps the Trigger active only for
the specified wall-clock duration of the current choice step. `null` means no
timer; zero expires immediately. Reloading and closing do not pause an
authenticated saved session. A draining bar appears above a timed option. On
expiry the reader removes it, while Simulation keeps it disabled and explains
the expiration. Simulation backward navigation restores the original step time.

If several Triggers target the same interaction, any active one keeps the option
available. One eligible untimed Trigger means the option has no countdown;
otherwise the displayed bar uses the longest remaining eligible window.

Temporal trigger conditions use the story-local clock. Exact dates and inclusive
date ranges are alternatives in one calendar-date category. Weekdays form
another category. Time slots form a third category, use inclusive starts and
exclusive ends, and may cross midnight when the end is earlier than the start.
Non-empty categories are combined with AND. Authors can therefore express
several dates, several weekdays, and several daily slots without creating an OR
trigger variant for every combination.

## Inputless Triggers

A trigger with no inputs has no previous-interaction requirement.

In the MVP, this has two meanings:

- if the trigger has no conditions, it is a starting trigger and makes its output
  interaction available at the beginning of the story;
- if the trigger has conditions, it is a contextual trigger and can become
  available during reading when its conditions match.

This keeps the generic trigger model while allowing "start here" and "available
from context" to share the same inputless trigger shape.

Every interaction should keep at least one trigger. A starting interaction is not
a special interaction type; it is an interaction whose availability comes from an
inputless trigger without conditions.

## Visual Decorations

Frames and text placed behind triggers and interactions are graph decorations,
not triggers. Visual overlap with a decoration does not create an input, output,
condition group, or ownership relationship. Moving, resizing, editing, or deleting
a decoration therefore cannot change trigger evaluation.

## Item Ownership Conditions

An item condition references a reusable item definition in the same story. It
can require that at least one instance is owned or that no instance is owned.
The condition uses the replayed inventory, including items obtained dynamically
without being preassigned to a character.

## Deleting Interactions

When an interaction is deleted, cleanup must preserve narrative meaning.

If the deleted interaction is the trigger output:

- delete the trigger;
- the trigger has no reason to exist without its output interaction.

If the deleted interaction is one of the trigger inputs:

- remove that input from the trigger;
- if the trigger has no remaining inputs, keep the trigger as an inputless
  trigger.

This keeps the model generic: an interaction remains available only through triggers, including root interactions.

If the deleted interaction appears in trigger conditions:

- remove those conditions;
- a later version may instead mark the trigger invalid and ask the user to resolve it, but the MVP should favor a simple cleanup rule.

## Editing UX

Conditional text embedded in an interaction body references an interaction
reachable through an outgoing trigger. It reuses that trigger's complete input
and condition semantics; the body block never owns another condition set. If all
outgoing trigger connections to the referenced target are removed, the stored
block remains editable but is no longer rendered to readers.

Triggers should be edited from their visible graph marker, not primarily from the
interaction inspector.

Expected editor behavior:

1. The user clicks a trigger marker on a link, or the root trigger marker on an
   interaction.
2. The trigger editor opens for the selected trigger.
3. The user can edit conditions for that trigger.
4. The user can delete a trigger input directly from the link between the input
   interaction and the trigger marker.
5. The marker remains attached to the same trigger after editing.

The inspector exposes one **Add condition** action per condition group. It then
asks for the condition type and renders only the fields relevant to that type.
Alternative OR groups use a prominent plus action; when several groups exist,
**OR** appears between them and each group has an accessible delete cross in its
top-right corner. A new alternative group is added to the selected Trigger and
starts without conditions. Unavailable types explain their missing prerequisite
on hover or keyboard focus. Deleting one group is immediate and keeps the Trigger
inspector open. The same inspector edits the single 0–100 appearance probability
and an optional integer timer in seconds.

The interaction inspector should stay focused on interaction content. Trigger
inputs and outputs are represented by the graph itself, so the trigger inspector
does not need to repeat input or output lists.

An edge represents one trigger input, not necessarily the whole trigger. If a
trigger has several input interactions, it appears as several edges that share
the same trigger id and marker identity.

A root trigger should also have a visible marker, even though it has no input
edge. This keeps root trigger editing visually separate from interaction content
editing.

Deleting a link should happen directly on the graph, through a small control on
the link between the input interaction and the trigger marker. It removes only
that input from the trigger. If that input was the last input of a linked
trigger, the trigger remains and becomes an empty root trigger.

Deleting the last trigger of an interaction should also keep that trigger and
turn it into an empty root trigger. This preserves the invariant that every
interaction has at least one availability rule while keeping the UI simple: the
author can delete without having to understand why an action is disabled.

Creating a new canvas connection should create a dedicated linked trigger for that source and output interaction by default. It must not silently mutate an unrelated existing trigger, because existing triggers may carry different conditions.

When an output interaction already has one or more triggers, the editor must let
the author choose between two actions while connecting:

- add the source interaction as another input of an existing trigger;
- create a new trigger for the same output interaction.

A normal canvas connection opens this choice when at least one existing trigger
can accept the source. Dropping directly on a visible trigger marker remains an
intentional shortcut that adds the source to that trigger without opening the
choice.

Adding the source to an existing trigger means every input on that trigger shares
the same condition groups, probability, and timer. Creating a new trigger means
the route has its own condition group.

Graphically, a linked trigger is represented as a circular marker between its
inputs and its output interaction. When a trigger has several inputs, their links
all meet at the same marker, then one output link goes from that marker to the
output interaction. Dropping a connection on an existing trigger marker adds the
source as another input of that trigger. Dropping a connection on the empty input
handle of an interaction creates a separate trigger for that output interaction.

When an interaction moves, automatically placed linked trigger markers and their
edge paths are projected from the transient drag position. This live preview does
not write authored state during the gesture. A trigger with an explicitly saved
position follows the movement through an elastic attachment to its automatic
midpoint. The editor compares the old and transient midpoints, then applies part
of that displacement to the saved position. Markers close to their midpoint
follow more strongly; markers placed farther away follow more lightly, preserving
deliberate manual layouts. With several inputs, the midpoint uses their average,
so moving one source has a proportionally smaller effect. The preview updates
only connected marker nodes and edge handles; unrelated interactions,
decorations, comments, trigger markers, and edges retain their existing graph
projection during the gesture. The final drag frame, interaction position, and
adjusted saved marker positions are applied before persistence, so releasing the
interaction does not change marker or arrow routing. Automatic markers remain
automatic and do not gain a saved position from this behavior.

Dropping a connection on empty canvas is a creation shortcut:

- dragging from an output handle creates a linked child interaction when dropped
  on empty canvas;
- dragging from an input handle creates a source interaction and links it to the
  target interaction when dropped on empty canvas.

New interactions created by dropping a connection on empty canvas should be placed where the connection is released. Hover action buttons can use automatic placement to keep linked interactions readable.

## Multiple Triggers for One Output

An interaction can have several triggers.

This allows several alternative condition sets for the same output interaction.

Example:

```text
A --> Trigger 1 --> C
B --> Trigger 2 --> C
```

This is different from a single trigger with several inputs:

```text
A ----\
      Trigger 1 --> C
B ----/
```

Use a single trigger with several inputs when the same conditions apply to every input.

Use several triggers when each route to the same output needs different conditions.

Several triggers may also connect the same input interaction to the same output
interaction, but they remain separate reachability and probability gates.

Example:

```text
A --> Trigger 1 (30%) --> C
A --> Trigger 2 (80%) --> C
```

Use condition groups inside one Trigger when inputs, probability, and timer are shared
and only the alternative conditions differ. The inspector adds and removes those
groups directly on the Trigger. Use several Triggers only when the route requires
independent inputs, probability gates, comments, or lifecycle. Even with identical
inputs, each Trigger keeps its own graph marker.
