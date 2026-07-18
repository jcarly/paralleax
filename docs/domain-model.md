# Domain Model

The model must distinguish the current MVP from the target model.

## MVP Model

### Story

A story groups the interactions of a scenario.

Main fields:

- `id`
- `title`
- `interactions`

### Interaction

An interaction is the main narrative building block. It represents what is displayed or triggered during the story flow.

Main MVP fields:

- `id`
- `title`
- `body`
- `position`
- `triggers`

The title is used for choices and editor display. The body is used by the reader.

### Trigger

A trigger determines when an interaction becomes available.

Main MVP fields:

- `id`
- `inputInteractionIds`
- `conditions`

`inputInteractionIds` can contain several interactions. An interaction is therefore not limited to a single input.

A trigger has exactly one output interaction: the interaction that owns the trigger. Its inputs are alternative sources. In other words, several input interactions on the same trigger represent an OR: any one of them can make the output interaction reachable, as long as the trigger conditions also match.

Every interaction should keep at least one trigger.

An inputless trigger without conditions is a starting trigger. An inputless
trigger with conditions is contextual: it does not depend on a previous
interaction input, but it can become available when its conditions match during
reading.

### MVP Condition

A condition checks whether an interaction has already been visited or not.

Examples:

- visited interaction;
- not visited interaction.

See [Trigger semantics](triggers.md) for deletion rules and editor behavior.

## Target Model

The long-term model may introduce the following concepts.

Future characters, places, groups, users, and assets should be identifiable
domain entities rather than decorative tags. Authors should be able to open,
edit, reference, and navigate to related interactions from those entities. This
direction does not move any of them into the MVP implementation.

### User

A user represents an account identity. Users do not have global author, reader,
reviewer, or editor types in the domain model. Those capabilities are story-level
permissions.

Current elements:

- unique normalized email address;
- password credentials stored only as a derived hash;
- owned stories through `Story.creatorUserId`;

Later elements:

- profile information;
- story-specific permission overrides;
- authored changes and suggestions.

The first post-MVP identity slice provides local accounts, server-side sessions,
and private story ownership. Collaboration and delegated permissions remain later
work because they require a durable identity foundation first.

### Story Permissions

Later, a story may define a default access level and optional per-user permission
overrides.

The story keeps the creator user id and a global access setting. The global
setting answers what users can do by default when they are not the creator and do
not have a specific permission entry.

Possible global access settings:

- private: users cannot read the story unless explicitly allowed;
- public read: users can read the story by default;
- public suggestions: users can read and suggest changes by default.

Specific user permissions can be represented by a join model such as
`UserStoryPermission`, with a `userId`, a `storyId`, and the permission granted
for that story.

Possible story-level permissions:

- read;
- suggest changes;
- review suggestions;
- edit directly;
- manage story settings.

The exact permission hierarchy is still to be defined. For example, the project
must decide whether `edit directly` includes `suggest changes` and `read`, and
whether `manage story settings` includes every other permission or only access
configuration rights.

The effective permission is resolved by checking story ownership first, then any
specific `UserStoryPermission`, then the story default access setting. For
example, a private story can still grant read access to selected users, and a
public-read story can still grant suggestion or direct editing rights only to
selected users.

Pending suggestions are not visible through a per-suggestion setting. Any user
with review or approval rights on a story can see all pending suggestions for
that story.

### Story Change Proposal

A story change proposal represents a suggested modification that may require
approval before it affects the canonical story.

Possible elements:

- proposed story, interaction, or trigger changes;
- author of the proposal;
- original change author for direct edits;
- approval requirement;
- status such as pending, accepted, or rejected;
- review history.

The target workflow should keep a history of story modifications so users can see
who changed what. A suggestion can use the same change history model, but with a
status that marks it as not applied yet.

An event log is the preferred direction for this history. Each event should record
who changed what, when it changed, and which story object was affected, such as a
story, interaction, trigger, trigger input, or condition. Suggestions can then be
represented as events that are pending and not applied to the canonical story
until approved.

Depending on the story settings and the user's effective permission, proposed
changes may be applied directly or wait for approval from the creator or a user
with review rights on that story.

Technically, the exact representation remains open: a proposal may be stored as a
diff, a draft branch, or a set of structured events. The important domain rule is
that proposed changes must remain inspectable before they affect the canonical
story.

### Story Change Event

A story change event represents one recorded modification in the story history.

Possible elements:

- user who made the change;
- target object type, such as story, interaction, trigger, trigger input, or condition;
- target object id;
- operation type;
- previous and next values when useful;
- timestamp;
- optional proposal id when the event belongs to a pending suggestion.

Accepted direct edits and pending suggestions should use the same event-log
foundation. The difference is whether the event has already been applied to the
canonical story.

### Interface Internationalization

Interface internationalization concerns application UI copy only: labels,
buttons, menus, messages, and other product text should be extracted into
translation keys or variables.

Story titles, interaction titles, and interaction bodies are user-authored
content. They are not part of interface internationalization. Translating story
content is a separate product question and may not be worth implementing. If it
is explored later, it should not be coupled to UI translation infrastructure.

### World

The world contains places, characters, and the current time state.

Possible elements:

- available places;
- characters;
- current date and time.

### Group

A group is a neutral logical grouping of interactions.

It should not force a specific narrative vocabulary such as chapter, quest, arc,
or scene sequence. Those labels may be author-facing choices later.

Possible elements:

- title;
- description;
- included interactions;
- display order or canvas focus metadata.

Groups are not part of the MVP implementation.

### Annotation

An annotation is authoring metadata.

It can attach to a story object, a text range, or a canvas area, but it never
participates in reader execution or trigger evaluation.

Possible elements:

- note on an interaction;
- note on a trigger or condition;
- annotation on interaction text;
- free canvas note;
- author and visibility metadata later when users exist.

Annotations are not part of the MVP implementation.

### Character

A character can be playable or non-playable.

Possible elements:

- current place;
- attributes;
- relationships with other characters;
- own narrative path.

### Attribute

An attribute represents a statistic, item, relationship, or narrative property.

It can be modified by an interaction and used as a trigger condition.

### Place

A place represents a scene, location, or context where interactions can trigger.

### Target Interaction

Later, an interaction may contain:

- involved characters;
- visual attitude or posture;
- speaking indicator;
- place;
- delay added to the timeline;
- attribute impacts;
- media;
- final interaction flag;
- conditional content or display pseudo-code.

### Target Trigger

Later, a trigger may take into account:

- triggering characters;
- place;
- time period or schedule;
- attribute values;
- input interactions;
- required or forbidden interactions in history;
- appearance probability;
- automatic trigger probability;
- availability timing.

An inputless trigger in the target model does not necessarily mean "available
only at story start." The MVP already uses the same base distinction: inputless
triggers without conditions are starting triggers, while inputless triggers with
conditions can be evaluated during reading. Later conditions may include context,
such as being in a place or meeting a character.

### Play Session

Later, a play session may persist reader progress.

Possible elements:

- current interaction;
- visited interactions;
- current world state;
- available save points or autosave state;
- completion status.

Player saves are separate from story authoring persistence. Story persistence
stores the authored scenario; play-session persistence stores a reader's progress
through that scenario.

## Target Narrative Rules

- If several interactions are available after an interaction, the reader offers a choice.
- A choice may become automatic if a trigger probability is defined.
- Timing may make an option unavailable after expiration.
- An inputless trigger may start a story or become available later through world
  context, such as a place, time period, or character.
- If no interaction is available, the current branch may pause or stop, but the
  whole story is not necessarily complete.
- A story is explicitly complete when the reader reaches a final interaction or a
  later completion rule marks the play session as complete.
