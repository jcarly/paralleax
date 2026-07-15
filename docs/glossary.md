# Glossary

This glossary keeps project vocabulary stable across product notes, code, tests,
and UI copy.

## MVP Terms

### Story

A scenario that groups interactions and their trigger rules.

### Interaction

A narrative moment displayed or offered to the reader. It can represent a scene,
choice, action, dialogue, video moment, or game state.

### Trigger

The rule that makes one output interaction available. In the MVP, a trigger
belongs to exactly one output interaction and can have several input
interactions.

### Input Interaction

An interaction that can lead to a trigger's output interaction. Several inputs on
the same trigger are alternatives: any one of them can satisfy the input rule.

### Root Trigger

A trigger with no input interactions. It makes its output interaction available
at the beginning of the story.

### Condition

An additional rule checked by a trigger. MVP conditions only check whether an
interaction has been visited or not.

### Reader

The execution layer that evaluates the story and offers available interactions to
the user reading or testing it.

### Graph Edge

The editor representation of one trigger input. A trigger with several inputs is
shown as several edges that share the same trigger id.

## Post-MVP Terms

### User

An account identity. Users do not have global author, reader, reviewer, or editor
types in the domain model; those capabilities are story-level permissions.

### Story Permission

A permission that applies to a user for a specific story, such as reading,
suggesting changes, reviewing suggestions, direct editing, or managing settings.

### Story Default Access

The access level applied when a user is not the creator and has no specific
permission override for a story.

### Story Change Proposal

A suggested modification that may wait for approval before it affects the
canonical story.

### Story Change Event

One recorded modification in the story history, including who changed what, when,
and which story object was affected.

### Interface Internationalization

The translation infrastructure for application UI copy only. Story titles,
interaction titles, and interaction bodies are user-authored content and are not
part of interface internationalization.
