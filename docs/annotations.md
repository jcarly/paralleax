# Annotations

Standalone annotations would be authoring notes attached to the Story model or
canvas. They are not currently implemented. The existing anchored review
discussions and graph post-its are collaboration comments, not a separate
private-note model.

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
- Each annotation should later keep its `userId`, making personal or team
  filtering possible.
- A suggestion or review comment may reuse annotation-like UI, but accepted story
  changes should still be represented by story change events.

## Canvas Representation

Annotations may be represented by an icon on the canvas.

This icon must stay visually quiet so it does not overload the graph. Exact
placement and icon style should be decided during visual design work.

Free canvas notes may exist without being attached to a specific story object.
They behave like authoring post-its and still do not affect story execution.

## States

Simple personal notes can start as free text later.

Collaborative notes or suggestions may need states, such as open, resolved, or
review-related statuses. This should be aligned with the future suggestion and
review workflow rather than implemented as an isolated notes system.

## Scope Boundary

Do not treat this proposal as the specification for the implemented review
discussion system. Any future standalone notes should have an explicit purpose
and lifecycle before implementation.
