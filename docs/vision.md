# Vision

Paralleax is a collaborative platform for designing, exploring, testing, and
sharing interactive stories.

The name combines "parallel" and "parallax": several narrative paths can coexist, cross each other, and be read from different points of view.

## Problem to Solve

Existing tools often let authors create interactive stories, but they tend to be either too close to enriched text or too close to algorithmic tooling. Paralleax aims to let authors write a scenario while keeping a structure that other software can use.

An author should be able to:

- define simple narrative interactions;
- create several branches from the same interaction;
- condition the availability of an interaction based on the path already taken;
- explore the same story through several points of view without duplicating the
  data model;
- visualize the narrative structure without having to think like a developer;
- test and debug story availability rules;
- share and publish stories directly on the platform later;
- export or reuse the structure in other formats.

## Product Direction

The core of Paralleax is the narrative model, not the graph.

The graph is one useful representation of the story. It helps authors inspect
links, triggers, roots, and branches, but it must not become the product itself.
The real product is the structured narrative model and the different ways to
explore, edit, test, review, and share it.

The interaction is the central building block of the system. It represents a narrative moment: a choice, a scene, an action, a dialogue, a video, or a game state.

An interaction becomes available through one or more triggers. In the MVP, a trigger mostly relies on input interactions and "visited / not visited interaction" conditions. Later, it may also take characters, places, time periods, attributes, probabilities, and timing into account.

Collaboration is a long-term direction. It should include not only simultaneous
editing, but also contribution workflows: proposing an interaction, suggesting a
branch, reviewing changes, accepting them, or rejecting them before they affect
the canonical story.

## Inspirations and Observed Limits

- Twine: accessible for interactive fiction, but the structure is tightly coupled to text and hard to reuse elsewhere.
- Celestory: closer to a node-based tool, but still complex for users who are not familiar with algorithms.
- Yo Scenario: interesting UX, but transition conditions seem limited.
- Serious Factory, Near-Life, and Articy: references to analyze for professional workflows, exports, and narrative structure.

## Target Uses

- Sharing playable interactive stories on the Paralleax platform.
- Interactive books and storyboarding.
- Interactive films with videos and waiting loops.
- Visual novels or point-and-click games.
- Unity or game engine integration.
- Preparation and evolving support for tabletop RPGs.

These uses remain long-term directions. The project must first stabilize the Story, Interaction, Trigger, and Reader MVP.
