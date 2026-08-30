# Story Canvas

This document captures the current UX direction for the MVP graph editor as it
evolves toward the Story Canvas described in [UI direction](ui-direction.md).

The Story Canvas remains a projection of the same Story, Interaction, Trigger,
and Reader model. It should make the narrative structure easier to author
without introducing new domain concepts before the MVP is validated.

Static visual references live in
[Story Canvas mockups](mockups/story-canvas.html).

Auto-organization rules live in [Auto layout](auto-layout.md).

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

- default vertical distance between interactions, currently tuned to `132px`
  for automatic creation;
- default horizontal offset for parallel branches;
- minimum spacing around trigger markers;
- behavior when several branches converge on the same interaction.

## Interaction Cards

Interaction cards should keep a standard size by default. Free resizing would
add too many layout possibilities and could make graph navigation harder.

Cards should stay visually neutral. They are the readable narrative material,
not the color-coding system. Concept badges and contextual accents can carry
meaning without turning the graph into a mosaic.

The information visible on a card should prioritize:

- title;
- short content excerpt;
- future character indicator;
- future place indicator.

Notes may appear later, but they need a specific visual rule so they do not make
the graph noisy.

Several zoom detail levels may be useful later. For example, distant zoom could
show mostly titles, while closer zoom could reveal excerpts and metadata. This
should be explored before implementation rather than assumed for the MVP.

## Creating Interactions

Button or handle-based creation should place the new interaction automatically.

If the author clicks and drags while creating, the interaction may be placed
where it is dropped. This keeps quick creation simple while still allowing
manual placement when the author wants control.

Interaction title and content editing should continue through the inspector in
the editor canvas.

Creating from an empty canvas area should use a deliberate command, such as a
context menu, rather than accidental double-click creation.

The empty-story state should be useful and instructional. It should explain the
first narrative action and offer creation of an MVP interaction directly; it
must not prompt for future characters, places, or other out-of-scope entities.

A contextual canvas menu is a strong candidate for frequent local actions such
as creating an interaction, creating or connecting a trigger, duplicating,
deleting, and later organizing the nearby graph. Commands should appear only
when their meaning is unambiguous for the clicked canvas object or empty area.

## Edge Routing

Narrative edges always leave the bottom-center output of their source
interaction and enter the top-center input of their target interaction. Trigger
markers and orthogonal routing lanes adapt between those fixed semantic handles.

Target behavior:

- vertical chains should read cleanly from top to bottom;
- nearby branches should not create unnecessary loops;
- edges should avoid crossing interaction content when possible;
- trigger marker placement should minimize visual bends;
- arrows should point to the meaningful interaction input action, not to an
  invisible or secondary handle.
- routing should use free horizontal lanes and vertical approaches to minimize
  crossings and avoid unrelated cards and Trigger markers where possible.

The model must not change to satisfy edge routing. Routing is a canvas
projection concern.

## Trigger Markers

Triggers should always stay visible as markers between their input interactions
and their output interaction.

The marker represents the trigger itself. Links from input interactions represent
trigger inputs. The link from the marker to the output interaction represents
the trigger's output interaction.

UX rules:

- selecting a trigger should happen through the trigger marker;
- links are not selectable by themselves;
- deleting a trigger input should happen from the input link;
- deleting the last input should convert the trigger into a root trigger;
- connecting to an existing marker should add another input to that trigger;
- connecting to the empty interaction input should create a separate trigger;
- interactions with several distinct trigger routes should show several trigger
  markers so each route remains editable;
- several triggers with the same inputs and output should be grouped behind one
  visual marker, with their alternative condition groups shown as `OR` variants
  in the inspector.
- adding an `OR` condition group from the inspector should create another trigger
  with the same inputs behind the same visual marker.
- the inspector should let authors delete one OR group at a time, or delete every
  OR group behind the selected visual marker in one action.

When the author hovers a trigger marker, local action icons may appear around
it. These icons can expose trigger actions such as editing conditions, deleting
the trigger, or adding related affordances without selecting graph links.

The exact marker shape is a visual design decision. A diamond or small hexagon
may be clearer than a circle because it separates triggers from interaction
handles and reinforces that a trigger is a decision point on a path.

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
- the empty input handle is a precise drop target for creating a new trigger;
- the empty input handle should stay hidden until the author is actively
  dragging a connection, so normal reading of the graph is not overloaded.

## Inspector Behavior

The inspector should appear only when the author selects an interaction or a
trigger.

The selected object should be treated as the active object across the workspace:
the canvas highlights it, the inspector edits it, and simulation can jump back
to it without changing the underlying story model.

Canvas relationships should be visible on the graph. The inspector should edit
content, conditions, and trigger-level actions rather than repeating input and
output lists.

The inspector may include compact navigation shortcuts for the selected
interaction, such as previous inputs and next outputs. These shortcuts are for
movement and focus, not for editing the trigger structure.

## Next UX Iteration

Before adding more narrative features, the next canvas iteration should focus on:

- testing compact automatic placement on representative author stories;
- refining adaptive edge routing for trigger markers after real use;
- refining trigger marker placement for vertical and converging flows;
- expanding the MVP canvas rules in [Design system](design-system.md);
- checking the result with representative small and branching stories.
- evaluating a focus mode that dims interactions outside the active
  interaction's immediate narrative neighborhood;
- defining a small initial keyboard set for deletion, search, recentering, and
  undo/redo without conflicting with browser or text-editing shortcuts;
- testing an instructional empty-story state and a contextual canvas menu.
