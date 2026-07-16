# Annotations

Annotations are authoring notes attached to the story model or canvas.

They are not part of story execution. They should never affect reader
availability, trigger evaluation, or exported runtime behavior unless a future
export explicitly includes authoring metadata.

## Possible Annotation Types

Future annotation types may include:

- note on an interaction;
- note on a trigger;
- note on a condition;
- annotation on a text range inside an interaction body;
- free note on the canvas.

## Rules

- An annotation is authoring metadata.
- An annotation does not change the story path.
- An annotation does not satisfy or fail trigger conditions.
- An annotation may be private, shared, or review-related later when users and
  permissions exist.
- A suggestion or review comment may reuse annotation-like UI, but accepted story
  changes should still be represented by story change events.

## MVP Boundary

Annotations are not part of the MVP implementation.

They are documented as a target authoring concept because they may become useful
for collaboration, review, and planning.
