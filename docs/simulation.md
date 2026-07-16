# Simulation

Simulation Mode is the author-facing testing surface for a story.

It is separate from the final player reader. The player reader should only show
what a player can actually choose, while Simulation Mode can reveal unavailable
interactions, availability explanations, simulated state, and shortcuts back to
editing.

The main surface should stay close to a reader experience rather than keeping
the full canvas visible by default.

Edition and simulation should feel like two states of the same workspace, not
two different applications. Switching to simulation can change the central
surface while keeping the surrounding navigation and inspector mental model
stable.

## Purpose

Simulation Mode should answer:

- what can the reader do now?
- why are other interactions unavailable?
- what state was assumed for this test?
- how can the author jump back to editing the relevant object?

## Simulated State

Simulation state should distinguish:

- journey: interactions actually selected during the current simulation;
- simulated preconditions: interactions manually marked as already visited for
  this simulation;
- future variables or world state, once they exist after the MVP;
- future time state, once timing exists after the MVP.

MVP trigger evaluation may use the union of journey and simulated preconditions.

The first UI does not need to visually distinguish real journey entries from
simulated preconditions. The important behavior is that forcing or simulating an
interaction makes the test behave as if the relevant conditions had been
satisfied beforehand.

## Start From Anywhere

Authors should be able to start a simulation from any interaction.

Starting from an interaction means it becomes the first interaction of the
simulation with an empty journey. It must not imply that every previous
interaction has been visited.

## Resume With Assumptions

Authors should also be able to resume from an interaction with simulated
preconditions.

This is useful for testing a late branch without replaying the whole story.
Preconditions are temporary and do not modify the story.

## Availability Explanations

Simulation Mode should explain trigger evaluation.

For unavailable interactions, the reason can appear on hover instead of being
displayed permanently.

Possible explanations include:

- whether an input interaction matched;
- which required visited interaction is missing;
- which forbidden visited interaction failed;
- which condition group passed or failed.

The goal is to make trigger logic understandable while testing, without forcing
authors to read the underlying trigger structure first.

Hovering an unavailable option may also focus the inspector on the relevant
trigger explanation immediately. This keeps the reader-like surface clean while
still making condition details easy to inspect.

## Forced Interactions

Authors may need to inspect an unavailable interaction.

Simulation Mode may offer a secondary forced interaction action. Forced steps
should be visually marked so authors do not confuse them with valid reader
transitions.

Selecting a dimmed unavailable interaction may force it for debugging, behaving
as if its conditions had been fulfilled beforehand.

Forcing an interaction is a debugging shortcut, not a permanent change to engine
semantics or story data.

## Editing Loop

Simulation Mode should support:

```text
Test -> notice -> edit -> retest
```

Each listed interaction should eventually expose an action to open it in the
Story Canvas, focus it, select it, and open the inspector. Returning to
simulation should preserve enough state to retest the same situation.

Simulation Mode should also support direct lightweight edits:

- edit the current interaction title;
- edit the current interaction content;
- add output options directly from the simulation;
- open the inspector for available options when trigger details need inspection.

Inline editing is an important product direction. The author should be able to
write in the context of play: click the current title or body, edit it, confirm,
and continue the test. Adding a new option from the simulated reader should
create the underlying interaction and trigger without making the author leave
the writing flow.

After editing the current interaction, the simulation does not need a special
restart. Later stats or world-state changes can be applied when leaving the
interaction, so the current view remains stable while the author edits.

The simulation journey should support simple backtracking, such as a back arrow
above the reader area, so authors can try another branch without restarting the
whole test.

## First Useful Version

A first implementation can focus on:

- starting from any interaction;
- showing all available interactions;
- showing unavailable interactions dimmed when useful;
- explaining unavailable interactions on hover;
- forcing an unavailable interaction by selecting it;
- lightweight title and content editing;
- adding output options from the simulation;
- resetting simulation state;
- opening an interaction in the graph for editing.

## Current Implementation

The editor `Test` action opens the reader route with `mode=simulation`.

Current behavior:

- `/play` remains the player reader and only shows interactions that are
  available to the player;
- `/play?mode=simulation` enables the author-facing simulation surface;
- if an interaction is selected in the editor, the test route also receives
  `startInteractionId` so the simulation starts from that interaction;
- Simulation Mode lists interactions that are reachable from the current
  interaction according to trigger input logic;
- interactions that are reachable by input but blocked by conditions are dimmed
  but remain selectable;
- dimmed interactions show the first failed visited / not visited condition as
  a short reason;
- selecting a dimmed interaction forces it for the current simulation journey
  and does not change the story data or reader engine semantics;
- restart resets the simulation to the original starting interaction.

This first slice only explains MVP visited / not visited conditions. Richer hover
diagnostics and direct editing remain next steps.

Out of scope for the first version:

- full trigger editing inside Simulation Mode;
- variables, places, characters, or world state;
- saved simulation profiles;
- automatic exploration of every path.

Saving named simulation states is an open question. It may mean something close
to player saves, and should not be designed before play-session persistence is
clearer.
