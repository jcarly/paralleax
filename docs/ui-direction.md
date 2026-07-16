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

The center canvas remains the main working area. The left panel changes what is
visible or emphasized. The right inspector edits the selected object.

## Left Panel

The left panel should be collapsible.

In the MVP, it should stay limited to concepts that already exist, such as story
navigation, search, and interaction-oriented filters.

After the MVP, it may expose tabs for target concepts:

- groups;
- characters;
- places;
- variables;
- media.

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

## Simulation Mode

The reader used by authors should become a simulation and narrative debugging
surface, not only a player preview.

This mode must remain separate from the final player reader. The player reader
should only show what the player can actually choose, while Simulation Mode can
reveal unavailable interactions, trigger diagnostics, and state controls.

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
