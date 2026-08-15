# Trigger Semantics

This page defines how triggers should behave in the MVP editor and reader.

## Definition

A trigger determines when an output interaction becomes available.

In the current MVP model, a trigger belongs to one output interaction and contains:

- one trigger id;
- zero, one, or several input interaction ids;
- zero or several conditions.

## Inputs

A trigger can have several input interactions.

Several inputs on the same trigger represent an OR:

- if the reader is currently on any one of those input interactions, the trigger input rule matches;
- the trigger is still available only if all conditions also match.

Example:

```text
A ----\
      Trigger T ----> C
B ----/
```

Here, interaction `C` can become available after `A` or after `B`, depending on the rest of the trigger conditions.

## Conditions

Conditions on the same trigger represent an AND:

- every "visited" condition must be present in the reader history;
- every "not visited" condition must be absent from the reader history.
- every "current location" condition must match the reader location;
- every "not current location" condition must not match it.
- every "present character" condition must belong to the current interaction's cast;
- every "absent character" condition must not belong to that cast.
- every stat comparison must match the current numeric value using `=`, `<`,
  `<=`, `>`, or `>=`.
- every temporal condition must match each non-empty calendar category; entries
  within its dates/date ranges, weekdays, or time slots are alternatives.

Inputs answer "where can this trigger come from?"

Conditions answer "what must already be true about the path or reader context?"

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
the same condition set. Creating a new trigger means the route has its own
condition group.

Graphically, a linked trigger is represented as a circular marker between its
inputs and its output interaction. When a trigger has several inputs, their links
all meet at the same marker, then one output link goes from that marker to the
output interaction. Dropping a connection on an existing trigger marker adds the
source as another input of that trigger. Dropping a connection on the empty input
handle of an interaction creates a separate trigger for that output interaction.

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
interaction. This is useful when the same route should be available through
alternative condition groups.

Example:

```text
A --> Trigger 1 --> C  if X has been visited
A --> Trigger 2 --> C  if Y has not been visited
```

This represents an OR between condition groups:

- Trigger 1 conditions must all match; or
- Trigger 2 conditions must all match.

This belongs in the MVP because it lets authors express path logic such as "if
the reader has visited A OR if the reader has visited B" while preserving the
simple rule that conditions inside one trigger are AND.

The editor should prefer a grouped visual edge for several triggers between the
same source and target. The graph can show one link between the two interactions,
while the trigger inspector exposes several route variants. Adding an "OR
condition group" in that inspector creates another trigger behind the same visual
link.

When adding an OR condition group from the inspector, the editor creates a new
trigger with the same inputs as the selected grouped route. The new trigger is a
separate domain trigger, even though it shares the same visual marker.

The grouped inspector should also support deleting variants at two levels:
delete one OR condition group, or delete all OR condition groups behind the
selected visual marker. If deleting all variants would remove the last trigger of
an interaction, the existing invariant still applies: the last trigger becomes an
inputless root trigger instead of leaving the interaction without a trigger.

The domain model should still keep those variants as distinct triggers. The
grouped edge is a display and editing convenience, not a different trigger
semantics.
