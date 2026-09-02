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
- `stats`
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
- `itemEffects`
- `conditionalTextBlocks`
- `durationMinutes`

The title is used for choices and editor display. The body is used by the reader.
The sanitized body may contain conditional text frames. New frames reference a
same-interaction `ConditionalTextBlock` by stable id; that structured block owns
one or more of the exact condition variants also used by Triggers. Conditions in
one block are AND. The reader evaluates them against the same replayed state as
Trigger conditions. Legacy frames that reference one target interaction remain
readable and continue to project the outgoing Trigger availability between their
owning interaction and that target.

### Trigger

A trigger determines when an interaction becomes available.

Main MVP fields:

- `id`
- `inputInteractionIds`
- `conditionGroups`
- `appearanceProbability` (0–100, default 100)
- `timerSeconds` (nullable non-negative integer, default `null`)
- optional `position` for the linked editor marker

`inputInteractionIds` can contain several interactions. An interaction is therefore not limited to a single input.

A trigger has exactly one output interaction: the interaction that owns the trigger.
Its inputs are alternative sources. Several input interactions on the same trigger
represent an OR. Conditions inside one group are AND, while the groups owned by
the trigger are OR. Once an input and one complete group match, one deterministic
appearance roll is made for the trigger.

After those gates succeed, a non-null timer limits availability to the configured
number of wall-clock seconds in the current choice step. Zero expires immediately.

The optional position is authoring projection metadata. It changes only where a
linked trigger marker appears on the canvas and never affects reachability or
reader evaluation. A missing position uses a deterministic automatic placement.
When a connected interaction moves, the editor may elastically adjust an existing
saved position relative to that automatic placement; this remains visual metadata.

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
- typed stat equality/inequality and numeric comparison.
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
typed stats. Stat definitions belong to the story, may have a category and a
pictogram image URL, and
can be assigned to several characters without being recreated. Each assignment
has its own id and initial value.
Each reusable definition may also declare a positive or negative change per
story hour when its value type is numeric. Time-based changes apply to every
assignment of that definition as interaction durations advance the narrative clock.
An interaction can involve several characters. Presence conditions inspect the
cast of the current interaction; presence is scene context, not persistent
play-session state. Interaction effects can add to or set a stat, while trigger
conditions compare its current runtime value. The editor presents a stat assigned
to a character as a characteristic; this is a presentation of the same assignment
model, not a second domain concept.

### Stat / Variable

A stat definition is story-owned and has a technical id, an author-facing name,
and one `number`, `boolean`, or `string` value type. A stat assignment attaches
that definition to the Story, a character, a location, or an item definition and
provides its authored initial value. The assignment id, not the reusable
definition id, is the effect and condition target.

An interaction may `set` any assigned stat or `add` to a numeric one.
Trigger conditions support equality and inequality for all matching types and
ordered comparisons for numbers. A missing or ill-typed runtime value never
silently becomes zero. Item-definition assignments are templates: every exact
item instance receives an independent runtime value.

The body sanitizer permits inert `span` markers that identify an assignment and,
for item stats, an exact instance. The reader replaces their text content
from replayed values without evaluating source expressions or arbitrary code.
Authors may type `{{owner.variable}}` in interaction content. On save, a unique
Story, character, location, or exact authored item-instance reference is lowered
to the same stable marker. Unknown or ambiguous references remain visible for
correction in the editor and render as empty text in the reader.
See [ADR-021](decisions/ADR-021-typed-story-stats.md).

### Item Definition

An item definition is a reusable story-owned description with an id, name,
description, optional category, optional image URL, and zero or more assignments
to the story's reusable stat definitions. Each assignment defines
the initial value inherited by every concrete instance. The definition describes
a kind of object and is not itself owned by a character.

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

Reader saves belong to one authenticated user, one story, and one slot.
Relational columns enforce ownership, slot uniqueness, timestamps, and cascading
deletion. Two reserved slots store the reader and Simulation Mode autosaves; up
to 20 additional slots may have user-facing names and are shared between the two
modes. A versioned JSON state stores the ordered journey, current interaction,
unique visits, story-local date/time, current location, typed stat values, and
owned item instances, including per-instance item stat values. Replayable values
are derived from the ordered journey by the API. Version 2 stores typed stat
snapshots, version 3 adds the deterministic probability seed, and version 4 adds
one wall-clock choice-step start before the journey plus one after every selected
interaction. Versions 1–3 remain readable for existing saves.

## Target Model

The long-term model may introduce the following concepts.

Future characters, groups, users, and assets should be identifiable
domain entities rather than decorative tags. Authors should be able to open,
edit, reference, and navigate to related interactions from those entities. This
direction does not move any of them into the MVP implementation.

### User

A user represents an account identity. Users do not have global author, reader,
reviewer, or editor types in the domain model. Those capabilities are story-level
permissions. The global `admin` role is an operational exception that grants
installation-wide account and story management.

Current elements:

- unique normalized email address;
- password credentials stored only as a derived hash;
- owned stories through `Story.creatorUserId`;
- a global `user` or `admin` role;
- story-specific viewer/editor grants;

Later elements:

- profile information;
- authored changes and suggestions.

Local accounts, server-side sessions, administration, story visibility, and
delegated reading/editing are implemented. Suggestions and review remain later
work.

### Story Permissions

Stories define default access policies and optional per-user permission overrides.

The story keeps the creator user id and a global access setting. The global
setting answers what users can do by default when they are not the creator and do
not have a specific permission entry.

Implemented visibility settings:

- private: only the creator and administrators can read;
- authenticated: every signed-in user can read;
- public: anonymous and authenticated users can read;
- invitation: explicitly granted users can read.

Specific permissions are stored in `story_user_permissions`, with a `userId`, a
`storyId`, and a `viewer` or `editor` role.

Resolved story capabilities are:

- read;
- edit directly;
- manage story settings;
- comment, using either the editor-only or signed-in-reader policy.

The creator and administrators receive all capabilities. An editor can read and
edit but cannot manage settings or delete. Private visibility ignores collaborator
grants. The explicit authenticated-edit policy implies read and edit for every
signed-in account.

The effective permission is resolved from administrator status, story ownership,
story policies, authentication, and the direct grant. All API object operations
apply that resolution. New stories default to private owner-only editing with
comments enabled for editors. Choosing the reader policy extends comments to
every signed-in account that can read the story.

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

### Graph Decoration

A graph decoration is authored visual layout metadata stored with a story. It is
either a colored frame with a position and dimensions, or a text label with a
position, color, size, font family, weight, and style.

Decorations are deliberately independent from interactions and triggers. A frame
does not group, own, target, or change the reachability of elements inside it, and
a text decoration is not narrative content shown to readers. Both kinds are
projected behind narrative graph elements and never participate in reader
execution, trigger evaluation, or progress replay.

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

Later character increments may add playable points of view, relationships, and
character-specific narrative paths.

### Future Calculated Stats

Stored typed stats are implemented. A later increment may add read-only values
calculated from other stats and explicit factors. Formula validation,
dependency ordering, cycle detection, and rounding rules must be defined before
those values become part of the runtime contract.

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

Items do not replace stats. Equipment and item behavior contribute
modifiers to an effective value calculated from base, permanent, equipment,
temporary, and contextual modifiers. Derived values should not be persisted
when they can be recomputed deterministically.

### Review Comments

Review comments are story-scoped collaboration resources stored separately from
the authored `Story`. A thread has an immutable identity, an anchor, an author,
ordered messages, timestamps, and an open or resolved status. Resolving a thread
preserves its messages.

An anchor targets one of:

- a position on the story graph;
- a same-story Interaction, Trigger, Character, Location, Item Definition, or
  Stat Definition;
- a supported title, body, name, or description selection on one of those
  entities.

Text anchors preserve the selected quote, surrounding prefix/suffix, original
offsets, and a source hash. The quote and context allow a thread to follow nearby
text edits. When the target or quote can no longer be located unambiguously, the
thread becomes detached instead of being deleted. Comments are authoring/review
metadata: the reader engine, reader progress, and future story exports do not
consume them.

Editors use the complete graph-anchored review projection. Authorized signed-in
readers use a contextual player projection that lists interaction and interaction-
text threads only for the scene currently being read and creates new threads on
that interaction. This presentation does not put comments into reader state.

### Conditions and Effects

Current conditions inspect narrative, world, and replayed reader state. Current
interaction effects modify typed stats and inventory after an
interaction is selected. Later families may extend that state.

The model may use a discriminated family of condition and effect types, but each
supported type must have a typed payload, validation, reader semantics, cleanup
rules, and tests. A generic `{ type, parameters }` storage envelope must not
become an unvalidated runtime contract.

Implemented families include stat comparison, item ownership, place,
history, character presence, and story-local time. Implemented effects include
stat modification, giving or removing an item, movement, and time
advancement. Equipment tags, changing equipment, and relationship conditions or
effects remain later work.

The authoring foundation contains definitions and character-owned instances.
The playable item vertical includes a runtime inventory, reusable-definition
obtain/lose effects, and item-ownership trigger conditions. Durability, multiple
containers, procedural properties, layered clothing, shops, and economy remain
later increments.

### Target Interaction

Later, an interaction may additionally contain:

- involved characters;
- visual attitude or posture;
- speaking indicator;
- media;
- final interaction flag;
- conditional content or display pseudo-code.

### Target Trigger

Later, a trigger may additionally take into account:

- equipment tags and relationships;
- availability timing.

An inputless trigger in the target model does not necessarily mean "available
only at story start." The MVP already uses the same base distinction: inputless
triggers without conditions are starting triggers, while inputless triggers with
conditions can be evaluated during reading. Later conditions may include context,
such as being in a place or meeting a character.

### Play Session

Database-backed reader and Simulation Mode autosaves plus named manual saves are
implemented for authenticated users. Later play-session increments may add:

Possible elements:

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
