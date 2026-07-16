# Design Principles

## Simplicity First

The MVP must stay understandable for an author who is not a developer.

Every addition must be justified by a clear narrative need. Advanced concepts are documented, but they must not enter the code until the Story, Interaction, Trigger, and Reader core is stable.

The interface should hide technical edge cases whenever the model can preserve
meaning automatically. For example, deleting the last input of a trigger or the
last trigger of an interaction should convert it into a root trigger instead of
forcing the author to understand why a delete action is disabled.

## Author-First Canvas

Paralleax should help authors think in narrative terms rather than graph
implementation terms.

The editor may use a graph internally and visually, but the primary experience
should feel like working with story moments, branches, choices, and consequences.
See [UX principles](ux-principles.md), [UI direction](ui-direction.md), and
[Story Canvas](story-canvas.md).

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
- default spacing should stay compact enough for authors to read small stories
  without excessive panning;
- a new output must not overlap existing outputs;
- links should help users understand triggers and should adapt visually to the
  relative position of interactions and trigger markers;
- links may later show visual hints: condition, timing, probability, automatic choice.
- actions should live where the author expects them, such as deleting a trigger
  input directly from its graph link.

## Visual Consistency

Paralleax needs a deliberate visual identity before the editor grows.

The design system should make the application calm and readable for long
authoring sessions. Color, spacing, typography, selection states, and graph
controls should be defined as reusable rules instead of one-off component
choices. See [Design system](design-system.md).

## Usable Data

A story must not be only an HTML rendering or text document.

It must stay structured so it can be read, tested, exported, and transformed by other tools.
