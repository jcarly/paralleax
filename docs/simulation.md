# Simulation

Simulation Mode is the author-facing testing surface for a story.

It is separate from the final player reader. The player reader should only show
what a player can actually choose, while Simulation Mode can reveal unavailable
interactions, trigger diagnostics, simulated state, and shortcuts back to
editing.

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

MVP trigger evaluation may use the union of journey and simulated preconditions,
but the UI should show them separately so authors understand what was played and
what was assumed.

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

## Trigger Diagnostics

Simulation Mode should explain trigger evaluation.

For each relevant unavailable interaction, it should eventually show:

- whether an input interaction matched;
- which required visited interaction is missing;
- which forbidden visited interaction failed;
- which condition group passed or failed.

The goal is to turn trigger logic into an author-facing debugging workflow.

## Forced Interactions

Authors may need to inspect an unavailable interaction.

Simulation Mode may offer a secondary forced interaction action. Forced steps
should be visually marked so authors do not confuse them with valid reader
transitions.

Forcing an interaction is a debugging shortcut, not a change to engine
semantics.

## Editing Loop

Simulation Mode should support:

```text
Test -> notice -> edit -> retest
```

Each listed interaction should eventually expose an action to open it in the
Story Canvas, focus it, select it, and open the inspector. Returning to
simulation should preserve enough state to retest the same situation.

## First Useful Version

A first implementation can focus on:

- starting from any interaction;
- showing available and unavailable relevant interactions;
- explaining simple visited / not visited trigger conditions;
- marking simulated preconditions;
- resetting simulation state;
- forcing an unavailable interaction with a visible warning;
- opening an interaction in the graph for editing.

Out of scope for the first version:

- full trigger editing inside Simulation Mode;
- variables, places, characters, or world state;
- saved simulation profiles;
- automatic exploration of every path.
