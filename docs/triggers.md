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

Inputs answer "where can this trigger come from?"

Conditions answer "what must already be true about the path?"

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

Triggers should be edited from their visible graph marker, not primarily from the
interaction inspector.

Expected editor behavior:

1. The user clicks a trigger marker on a link, or the root trigger marker on an
   interaction.
2. The trigger editor opens for the selected trigger.
3. The user can edit conditions for that trigger.
4. The user can delete the selected input link when the trigger was selected
   through a linked route.
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

Deleting an edge should remove only the selected input from the trigger. If that input was the last input of a linked trigger, the trigger remains and becomes an empty root trigger.

The last trigger of an interaction cannot be deleted. This preserves the invariant that every interaction has at least one availability rule.

Creating a new canvas connection should create a dedicated linked trigger for that source and output interaction by default. It must not silently mutate an unrelated existing trigger, because existing triggers may carry different conditions.

When an output interaction already has one or more triggers, the editor must let
the author choose between two actions while connecting:

- add the source interaction as another input of an existing trigger;
- create a new trigger for the same output interaction.

Adding the source to an existing trigger means every input on that trigger shares
the same condition set. Creating a new trigger means the route has its own
condition group.

Graphically, the editor should support a split or merge connection gesture for
multi-input triggers. For example, while a connection is being dragged toward an
interaction, the graph may reveal a trigger marker or drop target in addition to
the normal interaction target. Dropping on the trigger target adds the source as
another input of that trigger. Dropping on the interaction or a "new route"
affordance creates a separate trigger.

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

The domain model should still keep those variants as distinct triggers. The
grouped edge is a display and editing convenience, not a different trigger
semantics.
