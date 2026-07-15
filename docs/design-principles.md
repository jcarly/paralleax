# Design Principles

## Simplicity First

The MVP must stay understandable for an author who is not a developer.

Every addition must be justified by a clear narrative need. Advanced concepts are documented, but they must not enter the code until the Story, Interaction, Trigger, and Reader core is stable.

## Author-First Canvas

Paralleax should help authors think in narrative terms rather than graph
implementation terms.

The editor may use a graph internally and visually, but the primary experience
should feel like working with story moments, branches, choices, and consequences.
See [UI direction](ui-direction.md) for the target Story Canvas model.

## One Model, Several Focal Points

The story model is unique. The interface can change what it emphasizes.

Instead of building unrelated editors for story, graph, character, place, or
timeline views, Paralleax should favor one Story Canvas that can be filtered,
focused, collapsed, or highlighted from different points of view.

Characters, places, variables, media, groups, and timeline concerns remain
post-MVP concepts.

## Progressive Complexity

The tool should let users start with a simple graph, then progressively add conditions, multiple inputs, timing, probabilities, characters, or places.

A simple story should not force the user to understand every dimension of the target model.

## Independent Engine

Narrative logic must not depend on the UI.

This separation enables:

- a web reader;
- integration into another website;
- future integration into Unity or a game engine;
- exports or executables;
- more reliable tests.

## Readable Graph

The editor must make the narrative structure visible.

UX principles:

- directly linked interactions should be visually close;
- a new output must not overlap existing outputs;
- links should help users understand triggers;
- links may later show visual hints: condition, timing, probability, automatic choice.

## Usable Data

A story must not be only an HTML rendering or text document.

It must stay structured so it can be read, tested, exported, and transformed by other tools.
