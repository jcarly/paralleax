# Navigation

Navigation is a core Story Canvas concern.

As stories grow, authors need to find, inspect, and return to the right
interaction quickly. Zoom and pan are useful, but they are not enough.

## Navigation In The Model

Model navigation helps authors find objects in the authored story.

Examples:

- search interactions by title or content;
- jump to a selected interaction;
- return to recently selected objects;
- bookmark important interactions;
- focus the inspector on the current selection;
- later, filter by groups, characters, places, tags, or orphan interactions.

Filters should not duplicate or fork the story model. They only change what is
visible, emphasized, or dimmed on the same Story Canvas.

## Navigation In The Story

Story navigation helps authors follow possible narrative paths.

Examples:

- go to previous input interactions;
- go to next output interactions;
- inspect root interactions;
- inspect available exits from the selected interaction;
- follow a simulation journey;
- return from a simulation result to the graph.

## Keyboard Navigation

Keyboard navigation should become part of the authoring workflow once the canvas
is stable.

Initial directions:

- arrow keys move between related interactions;
- `Enter` opens or focuses the selected object;
- quick search opens from a stable shortcut;
- escape closes transient panels or clears selection.

Exact shortcuts should be defined when implementation begins.

## Recentering

The editor should support recentering without hiding the rest of the story.

Potential targets:

- an interaction;
- a trigger;
- a future group;
- a future character or place focus;
- a search result;
- a simulation step.

Recentered views may dim unrelated objects, but should avoid making authors feel
they switched to a different model.
