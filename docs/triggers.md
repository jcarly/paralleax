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

## Starting Interactions

A trigger with no inputs makes its output interaction available at the beginning of the story.

This is intentional for explicit starting interactions, but it must not happen accidentally after deleting another interaction.

## Deleting Interactions

When an interaction is deleted, cleanup must preserve narrative meaning.

If the deleted interaction is the trigger output:

- delete the trigger;
- the trigger has no reason to exist without its output interaction.

If the deleted interaction is one of the trigger inputs:

- remove that input from the trigger;
- if the trigger has no remaining inputs, delete the trigger unless it is explicitly meant to be a starting trigger.

This avoids accidentally turning a child interaction into a starting interaction.

If the deleted interaction appears in trigger conditions:

- remove those conditions;
- a later version may instead mark the trigger invalid and ask the user to resolve it, but the MVP should favor a simple cleanup rule.

## Editing UX

Triggers should be edited from the graph edge, not primarily from the interaction inspector.

Expected editor behavior:

1. The user clicks an edge between two interactions.
2. The trigger editor opens for the trigger represented by that edge.
3. The user can edit conditions for that trigger.
4. The user can see and manage the trigger inputs.
5. The edge remains attached to the same trigger after editing.

The interaction inspector may still show trigger information as a convenience, but the canonical editing surface for a trigger is the edge because the edge is the visible representation of the trigger relationship.

An edge represents one trigger input, not necessarily the whole trigger. If a trigger has several input interactions, it appears as several edges that share the same trigger id.

Deleting an edge should remove only the selected input from the trigger. If that input was the last input of a linked trigger, the trigger can be deleted because it no longer has a source.

Creating a new canvas connection should create a dedicated linked trigger for that source and output interaction. It must not silently mutate an unrelated existing trigger, because existing triggers may carry different conditions.

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
