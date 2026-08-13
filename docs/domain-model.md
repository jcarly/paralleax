# Domain Model

The model must distinguish the current MVP from the target model.

## MVP Model

### Story

A story groups the interactions of a scenario.

Main fields:

- `id`
- `title`
- `interactions`
- `locations`
- `characters`
- `statDefinitions`
- `itemDefinitions`
- `startDateTime`

### Interaction

An interaction is the main narrative building block. It represents what is displayed or triggered during the story flow.

Main MVP fields:

- `id`
- `title`
- `body`
- `position`
- `triggers`
- optional `locationId`
- `characterIds`
- `statEffects`
- `durationMinutes`

The title is used for choices and editor display. The body is used by the reader.
The sanitized body may contain conditional text blocks that reference one target
interaction by id. A block does not store conditions: it projects the outgoing
trigger availability between its owning interaction and that target.

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

### Condition

A condition checks the reader path or current location.

Examples:

- visited interaction;
- not visited interaction.
- current location;
- not current location.
- character present;
- character absent.
- character stat numeric comparison.
- story-local exact dates, inclusive date ranges, weekdays, and time slots.

The story clock is a deterministic floating calendar rather than the reader's
wall clock. Interaction durations advance it, and temporal conditions filter
trigger availability. See [Reader semantics](reader-semantics.md) for boundary
and replay rules.

### Location

A location is an authored story entity with an id, name, description, optional
category, and optional image URL.
Interactions may move the reader to a location, and triggers may test whether it
is or is not current. Locations are definitions in the story; the current
location is runtime reader state.

### Character

A character is a story-owned authored entity with an id, name, description,
optional category, optional portrait image URL, and zero or more assigned
numeric stats. Stat definitions belong to the story, may have a category and a
pictogram image URL, and
can be assigned to several characters without being recreated. Each assignment
has its own id and initial value.
Each reusable definition may also declare a positive or negative change per
story hour. Time-based changes apply to every character assignment of that
definition as interaction durations advance the narrative clock.
An interaction can involve several characters. Presence conditions inspect the
cast of the current interaction; presence is scene context, not persistent
play-session state. Interaction effects can add to or set a stat, while trigger
conditions compare its current runtime value.

### Item Definition

An item definition is a reusable story-owned description with an id, name,
description, optional category, optional image URL, and zero or more assignments
to the story's reusable stat definitions. Each assignment defines the initial
value inherited by every concrete instance. The definition describes a kind of
object and is not itself owned by a character.

Categories are story-local, type-scoped organizational labels. They group
locations, characters, stat definitions, or item definitions in the editor but
have no reader, trigger, ownership, or simulation semantics.

### Item Instance

An authored item instance has exactly one structural placement and references
one item definition from the same story. A root instance belongs to a character
or a location; a nested instance belongs beneath another item through a typed
structural relationship.

Adding the same definition several times creates separate instances with
distinct ids. Interactions can obtain or lose one exact item instance, allowing
repeated definitions to remain distinct. Reader replay resolves definitions
from character- and location-rooted authored instances and their descendants. Each instance
has independent runtime values for the stats assigned by its definition.
Interaction effects can add to or set one exact instance stat. Items do not have
equipment behavior yet.

See [Trigger semantics](triggers.md) for deletion rules and editor behavior.

### Reader Progress

Reader progress belongs to one authenticated user and one story. Relational
columns enforce ownership, uniqueness, timestamps, and cascading deletion. A
versioned JSON state stores the ordered journey, current interaction, unique
visits, story-local date/time, current location, stat values, and owned item
instances, including per-instance item stat values. Replayable values are
derived from the ordered journey by the API.

## Target Model

The long-term model may introduce the following concepts.

Future characters, groups, users, and assets should be identifiable
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

Later character increments may add playable points of view, attributes,
relationships, and character-specific narrative paths.

### Attribute

An attribute represents a typed value such as a relatively stable attribute,
changing resource, learned skill, flag, trait, or temporary status. Items and
relationships are separate entities rather than special attribute names.

It can be modified by an interaction and used as a trigger condition.

### Future Item Definition

An item definition describes the shared authoring model for one kind of object.
It is not an owned object in a play session.

Possible elements:

- name and type;
- reusable tags;
- stackability and maximum stack size;
- base value;
- optional equipment, consumable, or other behavior definitions.

Tags support flexible rules such as requiring any equipped item tagged
`formal`, without coupling the trigger to one exact dress definition.

### Future Item Instance

An item instance represents one concrete object in play-session state.

Possible elements:

- item definition id;
- owner or container id;
- quantity for stackable items;
- durability, quality, or other mutable state;
- optional custom name and constrained extension properties.

Definition and instance identity must remain separate so two instances of one
definition can have different ownership, wear, customization, or structural
placement.

### Inventory and Equipment

Character inventories and item containers own item instances. Equipment is a
relationship between a character, an item instance, and one or more allowed
slots. Equipment definitions may expose modifiers, coverage, or layers, but
advanced clothing simulation remains a later vertical.

The accepted target model is a recursive story-local item graph. Exact
instances can be rooted at a character or location, or linked beneath another instance
through a typed structural relationship such as `contained`, `equipped`,
`attached`, `part_of`, `installed`, `worn`, or `held`. Body parts, containers,
clothing, implants, and composite objects share this engine rather than
introducing parallel ownership systems. See
[ADR-013](decisions/ADR-013-recursive-item-instance-graph.md) and
[ADR-015](decisions/ADR-015-location-owned-item-roots.md).

The implementation projects authored instances and their descendants through
`Character.items` or `Location.items` according to their effective root owner.
PostgreSQL stores exact instances, character/location roots, and typed parent
relationships.

Items do not replace attributes. Equipment and item behavior contribute
modifiers to an effective value calculated from base, permanent, equipment,
temporary, and contextual modifiers. Derived values should not be persisted
when they can be recomputed deterministically.

### Conditions and Effects

Future conditions inspect narrative, world, and play-session state. Future
interaction effects modify that state after an interaction is selected.

The model may use a discriminated family of condition and effect types, but each
supported type must have a typed payload, validation, reader semantics, cleanup
rules, and tests. A generic `{ type, parameters }` storage envelope must not
become an unvalidated runtime contract.

Examples of later condition families include attribute comparison, item
ownership, equipment tags, place, and relationships. Examples of effects include
attribute modification, giving or removing an item, changing equipment,
movement, time advancement, and relationship modification.

The authoring foundation contains definitions and character-owned instances.
The playable item vertical includes a runtime inventory, reusable-definition
obtain/lose effects, and item-ownership trigger conditions. Durability, multiple
containers, procedural properties, layered clothing, shops, and economy remain
later increments.

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
- `body` contains sanitized rich HTML. It supports text formatting, links,
  images/GIFs, direct HTML5 video, and allowlisted YouTube/Vimeo embeds.
