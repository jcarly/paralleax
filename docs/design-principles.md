# Design Principles

## Simplicity First

The MVP must stay understandable for an author who is not a developer.

Every addition must be justified by a clear narrative need. Advanced concepts are documented, but they must not enter the code until the Story, Interaction, Trigger, and Reader core is stable.

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
