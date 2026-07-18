# UI Direction

Paralleax should feel like an authoring workshop, not only a node editor.

The central product idea is that authors work on one narrative model and change
their point of view on that model. The interface may filter, highlight, collapse,
or project the story differently, but it should not create separate mental models
for each view.

## Story Canvas

The long-term authoring surface is a Story Canvas.

It keeps the interaction graph as the source of truth, but presents it in a way
that helps authors think in narrative terms: moments, branches, choices, groups,
and consequences.

The Graph View is therefore not a separate product direction. It is one technical
projection of the same Story Canvas, useful for inspecting links, trigger
structure, root triggers, and complex branching.

Current canvas UX rules and tuning points live in
[Story Canvas](story-canvas.md).

## Layout Direction

The target editor layout is:

- left panel: navigation, search, and filters;
- center canvas: the story projection;
- right inspector: contextual editing for the current selection.

The center canvas remains the main navigation and structural orientation area.
The left panel changes what is visible or emphasized. The right inspector is the
primary editing workspace for the selected object.

## Left Panel

The left panel should be collapsible.

When a new story is created, the left panel should be open by default because it
will later host creation and navigation for important story entities. If the
author collapses it, the editor should remember that preference for the next
opening.

The panel does not need to be resizable at first. A fixed width keeps the layout
predictable and avoids making the editor too configurable too early.

In the MVP, it should stay limited to concepts that already exist, such as
search and interaction-oriented navigation.

After the MVP, it may expose tabs for target concepts:

- characters;
- places;
- search.

These tabs should filter or focus the Story Canvas instead of replacing it with a
different editor. For example, selecting a character later could dim unrelated
interactions and reveal the part of the story involving that character.

## Groups Instead of Chapters

"Chapter" is too linear as a default concept for Paralleax.

A future grouping concept should be neutral enough to represent:

- a quest;
- a chapter;
- an arc;
- a scene sequence;
- a political intrigue;
- a companion storyline.

The author-facing label may be configurable later, but the domain concept should
not force a book-like or RPG-like structure too early.

Groups are not part of the MVP.

## Inspector

The inspector should be unique and contextual.

It should open directly when an object is selected.

Depending on the selection, it may edit:

- an interaction;
- a trigger;
- a future group;
- a future character;
- a future place;
- a future variable;
- future media metadata.

The editor should avoid duplicating relationship lists that are already clearer
on the canvas. For example, trigger inputs and outputs should primarily be read
through graph links, with the inspector focused on properties that need editing.

When nothing is selected, the inspector should stay closed for now. Story-level
properties can be introduced later when the story has meaningful editable
settings.

Inspector interactions should avoid unnecessary modals and route changes. The
author should be able to open an object, edit it, follow a related interaction,
and return while preserving canvas context.

## Narrative Projection

A future narrative projection may present the same Story / Interaction / Trigger
model as an editable reading-oriented sequence of moments and choices rather
than a graph. It must remain a synchronized projection, not a converted document
or second source of truth. This is post-MVP exploration and should be validated
against focus and simulation workflows before becoming a separate surface.

## Focus Mode

For larger stories, a focus mode should keep the active interaction, its direct
predecessors, successors, and trigger routes prominent while strongly dimming
unrelated canvas content. Focus should preserve spatial context instead of
hiding objects as a filter would. The first implementation can derive visual
distance from existing interaction and trigger relationships without changing
the domain model.

## Simulation Mode

The reader used by authors should become a simulation and narrative debugging
surface, not only a player preview.

This mode must remain separate from the final player reader. The player reader
should only show what the player can actually choose, while Simulation Mode can
reveal unavailable interactions, trigger diagnostics, and state controls.

The transition between editing and simulation should be nearly invisible. The
author should feel they are still inside the same workspace, with the active
interaction and inspector context preserved as much as possible.

Detailed Simulation Mode rules live in [Simulation](simulation.md).

## Future Drag and Drop

Future target entities should be useful for creation, not only filtering.

Examples:

- dragging a character onto an interaction could add that character as a
  participant;
- dragging a place onto an interaction could assign that location;
- dragging a character or place onto a trigger could create a related condition.

These workflows are target-model ideas. They must not introduce characters,
places, variables, or media into the MVP implementation.

## MVP Boundary

The MVP remains Story, Interaction, Trigger, and Reader only.

The current graph editor can evolve toward the Story Canvas, but implementation
must avoid adding target-model entities before the core is validated. UI work
before the MVP is stable should focus on making interactions and triggers easier
to understand, connect, inspect, and test in the reader.
