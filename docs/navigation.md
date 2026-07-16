# Navigation

Navigation is a core Story Canvas concern.

As stories grow, authors need to find, inspect, and return to the right
interaction quickly. Zoom and pan are useful, but they are not enough.

## Navigation In The Model

Model navigation helps authors find objects in the authored story.

Examples:

- search interactions by title or content;
- jump to a selected interaction;
- bookmark important interactions;
- focus the inspector on the current selection;
- later, filter by groups, characters, places, tags, or orphan interactions.

Filters should not duplicate or fork the story model. They only change what is
visible, emphasized, or dimmed on the same Story Canvas.

There should not be a browser-like navigation history for canvas focus in the
first versions. A modification history is still important, but it belongs to
change tracking and undo/redo rather than navigation.

## Search

Selecting an interaction from search should:

- recenter the canvas on that interaction;
- zoom enough to make it readable;
- select the interaction;
- open the inspector.

Search is a navigation action, not a separate view of the story.

## Filters

Filtering should dim unrelated elements by default instead of hiding them.

This keeps the surrounding story context visible and avoids making authors feel
they switched to a different story. Connected path interactions should remain
visible when they help preserve the route between filtered results.

The first filter experience can stay simple, but future combined filters should
avoid complex checkbox matrices. A promising direction is tag-based filtering:
selecting `Alice` adds an `Alice` filter tag, selecting `Village` adds a
`Village` tag, and each tag can be removed independently. The exact semantics
still need validation.

Open questions:

- whether combining several filters is useful at first;
- whether combined filters should use AND or OR semantics;
- whether a separate isolation mode is needed later.

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

- `Down` moves to the first output interaction;
- `Left` and `Right` move between alternative outputs;
- `Up` moves to a previous input interaction;
- quick search opens from a stable shortcut;
- escape closes transient panels or clears selection.

When several previous inputs exist, `Up` should choose the leftmost previous
interaction, mirroring the bottom arrow's default preference.

`Enter` does not need to open the inspector because selecting an interaction
already opens it.

Exact shortcuts should still be validated in prototypes before implementation.

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
