# Story Canvas

This document captures the current UX direction for the MVP graph editor as it
evolves toward the Story Canvas described in [UI direction](ui-direction.md).

The Story Canvas remains a projection of the same Story, Interaction, Trigger,
and Reader model. It should make the narrative structure easier to author
without introducing new domain concepts before the MVP is validated.

Static visual references live in
[Story Canvas mockups](mockups/story-canvas.html).

## UX Goals

- Keep interactions visually close by default so small stories feel compact.
- Make the direction of reading clear without forcing every story into a rigid
  tree.
- Keep trigger markers understandable without making authors manipulate graph
  implementation details.
- Prefer direct manipulation on the canvas when the action concerns a visible
  relationship.
- Keep inspectors focused on properties, not duplicated relationship lists.

## Default Density

The default graph layout should be denser than a technical node editor.

Interactions created through buttons should appear close enough to preserve a
visible narrative chain. The canvas should avoid large empty gaps unless the
author deliberately moves nodes apart.

Default placement should still avoid overlap. Compact does not mean cramped:
titles, handles, trigger markers, and delete controls must stay readable and
easy to target.

Open tuning points:

- default vertical distance between interactions;
- default horizontal offset for parallel branches;
- minimum spacing around trigger markers;
- behavior when several branches converge on the same interaction.

## Edge Routing

Edges should adapt to the relative position of their source, trigger marker, and
target interaction.

The editor should avoid a fixed handle rule when it creates visually awkward
curves. Top and bottom handles are a good default for vertical flows, but the
edge renderer should eventually choose the cleanest side or curve based on node
positions.

Target behavior:

- vertical chains should read cleanly from top to bottom;
- nearby branches should not create unnecessary loops;
- edges should avoid crossing interaction content when possible;
- trigger marker placement should minimize visual bends;
- arrows should point to the meaningful interaction input action, not to an
  invisible or secondary handle.

The model must not change to satisfy edge routing. Routing is a canvas
projection concern.

## Trigger Markers

Linked triggers should stay visible as circular markers between their input
interactions and their output interaction.

The marker represents the trigger itself. Links from input interactions represent
trigger inputs. The link from the marker to the output interaction represents
the trigger's output interaction.

UX rules:

- selecting a trigger should happen through the trigger marker;
- deleting a trigger input should happen from the input link;
- deleting the last input should convert the trigger into a root trigger;
- connecting to an existing marker should add another input to that trigger;
- connecting to the empty interaction input should create a separate trigger.

Open tuning points:

- marker placement for multi-input triggers;
- marker placement when inputs are above, below, or beside the output;
- whether root triggers should visually align with linked trigger markers;
- hover affordances for link deletion near the marker.

## Interaction Handles

The visible interaction handles should communicate author actions.

The primary input and output actions should be obvious and stable. Secondary
drop targets, such as the empty input used to create a separate trigger, should
remain available but visually quieter than the main author action.

Current direction:

- the primary input action is the blue `+` near the top of the interaction;
- the primary output action is the blue `+` near the bottom of the interaction;
- trigger output arrows should point to the primary input action;
- the empty input handle is a precise drop target for creating a new trigger.

## Inspector Behavior

The inspector should appear only when the author selects an interaction or a
trigger.

Canvas relationships should be visible on the graph. The inspector should edit
content, conditions, and trigger-level actions rather than repeating input and
output lists.

## Next UX Iteration

Before adding more narrative features, the next canvas iteration should focus on:

- reducing default spacing between automatically placed interactions;
- improving adaptive edge routing for trigger markers;
- refining trigger marker placement for vertical and converging flows;
- defining the visual identity in [Design system](design-system.md);
- checking the result with representative small and branching stories.
