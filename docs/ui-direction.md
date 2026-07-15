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

The author-facing button may still be labeled "Test", but the opened view should
be understood as a Story Simulation. Its goal is to answer three questions:

- what can the player do now?
- why are other interactions unavailable?
- how can the author immediately adjust either the story or the simulated state?

This mode must remain separate from the final player reader. The player reader
should only show what the player can actually choose, while Simulation Mode can
reveal unavailable interactions, trigger diagnostics, and state controls.

## Simulation Layout

The target Simulation Mode layout has three areas:

- left panel: simulation state, starting point, journey, and simulated
  preconditions;
- center panel: the current interaction, close to the final reader experience;
- right panel: available and unavailable interactions, with explanations.

The center panel keeps the author close to the player experience. The side
panels add testing and debugging tools.

## Interaction Availability Diagnostics

Simulation Mode should not only list available choices.

It should distinguish:

- next interactions: interactions directly connected to the current
  interaction;
- contextual interactions: interactions without a direct input link that can be
  evaluated in the current state;
- all interactions: a collapsed or searchable section for inspecting or forcing
  any interaction.

Unavailable interactions should be dimmed but still inspectable. Selecting or
hovering an unavailable interaction should explain why it is unavailable by
showing trigger evaluation details:

- satisfied previous interaction input;
- missing required visited interaction;
- failed forbidden visited interaction;
- satisfied or failed condition group.

This turns trigger evaluation into an author-facing debugging workflow instead
of a hidden engine result.

## Starting and Resuming Simulations

Authors should be able to start a simulation from any interaction.

Two actions must stay distinct:

- start here: the selected interaction becomes the first interaction with an
  empty journey;
- resume here with simulated state: the selected interaction becomes the current
  interaction while the author also defines which interactions should count as
  already visited.

Starting near the end of a branch must not imply that every previous interaction
has been visited.

## Journey and Simulated Preconditions

Simulation state should distinguish between:

- journey: interactions actually selected during the current simulation;
- simulated preconditions: interactions artificially marked as visited for this
  simulation.

The reader engine may evaluate triggers against the union of both sets, but the
UI should show them separately so authors understand what happened during this
test and what was manually assumed.

Checking a simulated precondition must not play the interaction, trigger its
content, or modify the story. It only means: "for this simulation, consider this
interaction as already visited."

The state panel should make this temporary nature explicit: simulation changes
do not change the Story.

## Test Time Travel

The simulation journey should be navigable.

Clicking a previous step should restore the simulation to that moment. Later
steps may be discarded or treated as a temporary branch. The goal is to let
authors try several choices from the same state without replaying the whole
story.

## Editing Loop

Simulation Mode should support a fast loop:

```text
Test -> notice -> edit -> retest
```

Each interaction should provide an action to open it in the graph editor. That
action should:

- leave Simulation Mode or move to a split authoring view;
- focus the graph on the interaction;
- select the interaction;
- open the inspector;
- preserve the simulation state enough to return and retest.

Direct editing inside Simulation Mode should stay limited at first. Quick edits
may include interaction title, body, notes, and simulated preconditions. Structural
changes such as trigger constraints, links, and branching should keep using the
graph editor to avoid duplicating the full editor inside the test surface.

## Forced Interactions

Authors may need to inspect an interaction even when it is unavailable.

Simulation Mode may offer a secondary "Force interaction" action. Forced choices
should be visually marked in the journey so authors do not confuse them with
valid reader transitions.

Forcing an interaction is a test shortcut, not a change to engine semantics.

## Simulation MVP Direction

A first useful version of Simulation Mode could include:

- starting from any interaction;
- showing directly relevant interactions as available or unavailable;
- explaining satisfied and failed trigger conditions;
- searching all interactions;
- marking interactions as simulated preconditions;
- resetting the simulation;
- returning to a previous journey step;
- forcing an unavailable interaction with a visible warning;
- opening an interaction in the graph for editing;
- returning to the simulation while preserving state when possible.

Out of scope for the first simulation iteration:

- complete trigger editing inside Simulation Mode;
- variables or attributes;
- saved simulation profiles;
- comparison between simulations;
- automatic exploration of every path.

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
