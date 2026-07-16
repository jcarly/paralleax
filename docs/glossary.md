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

### Starting Trigger

An inputless trigger without conditions. It makes its output interaction
available at the beginning of the story.

### Contextual Trigger

An inputless trigger with conditions. It has no previous-interaction input, but
it can become available during reading when its conditions match.

### Condition

An additional rule checked by a trigger. MVP conditions only check whether an
interaction has been visited or not.

### OR Condition Group

A route variant represented by a distinct trigger. Conditions inside one trigger
are AND, while several triggers for the same route represent OR between condition
groups.

### Reader

The execution layer that evaluates the story and offers available interactions to
the user reading or testing it.

### Simulation Mode

The author-facing testing surface. It can reveal unavailable interactions,
trigger diagnostics, and temporary simulated state, unlike the final player
reader.

### Graph Edge

The editor representation of one trigger input. A trigger with several inputs is
shown as several edges that share the same trigger id.

## Post-MVP Terms

### Final Interaction

An interaction that explicitly completes the story or play session.

### Play Session

A reader's progress through a story, including the current interaction, visited
history, and later world state or save data.

### Group

A neutral logical grouping of interactions. A group may represent a quest,
chapter, arc, scene sequence, or another author-defined structure later.

### Annotation

Authoring metadata attached to a story object, text range, or canvas area. It
does not participate in story execution.

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
