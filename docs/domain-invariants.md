# Domain Invariants

These invariants protect the narrative model from UI or storage implementation
details. They should stay covered by tests as the editor grows.

## MVP Invariants

- A story contains zero or more interactions.
- Review comment threads are story-scoped collaboration metadata, not authored
  story state. They never change reader evaluation, progress, or exports.
- Every reversible canonical Story-content mutation creates a new Story revision
  and one durable authored-change event in the same transaction. An undo or redo
  appends another inverse event and revision; it never deletes prior history.
- Global undo selects the current author's latest active normal or redo event;
  redo selects that author's latest active undo event. A reversal preserves
  unrelated later changes and must fail rather than overwrite a changed affected
  value or create invalid same-Story references.
- Story access settings, collaborators, review comments, reader/simulation saves,
  Story creation/import, and whole-Story deletion are outside authored-content
  undo history because their ownership and lifecycles differ.
- Reader-visible discussions are limited to the current interaction. Displaying
  or writing them never changes the ordered journey or runtime evaluation.
- A comment anchor is either a graph position, a same-story target entity, or a
  supported text field on a same-story target. Missing or changed text detaches
  the anchor without deleting its preserved quote or discussion.
- An interaction should keep at least one trigger.
- An interaction should always have a canvas position. Loaded or incoming story
  data with a missing position is normalized with a stable default position.
- Story and interaction titles are required strings. Interaction bodies are
  stored as sanitized rich HTML strings; an API body value of `null` is
  normalized to an empty string and authored HTML is limited to 64,000
  characters. Scripts, event handlers, unsafe protocols, and non-allowlisted
  iframe hosts are removed before persistence.
- A structured conditional body frame stores only a stable block id in sanitized
  HTML. Its owning interaction stores the referenced conditional block and one or
  more conditions from the same typed family used by Triggers. Those references
  belong to the same Story and conditions in one block are AND.
- Removing the last condition through rich-text authoring unwraps the conditional
  frame while preserving its body content. Editor-only condition controls are
  never persisted.
- Legacy conditional frames store only a target interaction id. Their visibility
  remains derived from outgoing Triggers and they cannot define independent
  conditions.
- An inline interaction link stores authored display text and one same-Story
  target interaction id in inert allowlisted markup. Activating it in the reader
  selects the target only when normal trigger evaluation exposes that interaction
  as an available choice; a text link never bypasses narrative availability.
- A rich-text variable marker stores only same-story assignment and optional
  exact item-instance ids in inert allowlisted attributes. It cannot evaluate an
  expression or execute authored code.
- The author shorthand `{{owner.variable}}` is resolved only when owner and
  variable identify one unique same-story target. A valid shorthand is lowered
  to the existing stable marker when the body is saved; an unresolved shorthand
  remains editable but renders as empty text to readers.
- A structured conditional frame is visible to readers only while all its
  conditions match replayed state. Simulation Mode keeps unmatched structured
  frames visible with unavailable styling and an explanation. Disconnecting a
  legacy frame target preserves its content but hides it from readers and keeps
  it visible with equivalent diagnostics in Simulation Mode.
- A trigger belongs to exactly one output interaction.
- Trigger inputs, outputs, and all condition references must belong to the same
  story as their trigger.
- A trigger can have zero or more input interactions.
- Deleting the last trigger of an interaction keeps that trigger and turns it
  into an inputless trigger.
- An inputless trigger without conditions is a starting trigger.
- An inputless trigger with conditions is a contextual trigger evaluated during
  reading.
- Inputs on the same trigger are OR conditions: any one input can make the output
  interaction reachable if the trigger conditions also match.
- A trigger owns one or more condition groups. Conditions inside a group are AND;
  groups are OR. At least one complete group must match.
- A trigger owns one appearance probability from 0 through 100, defaulting to 100. Input and condition-group rules are evaluated before one deterministic
  probability roll is applied for that trigger and narrative step.
- Several triggers targeting one interaction remain independent eligibility and
  probability gates. The interaction is available when at least one succeeds.
- Conditions can check visited interactions, the current location, character
  presence in the current interaction, a typed stat assignment, item ownership,
  or the story-local calendar.
- A story has a valid floating `YYYY-MM-DDTHH:mm` start date and time.
- An interaction duration is a non-negative integer number of minutes. Selecting
  an interaction advances time before evaluating its outgoing choices.
- Temporal date ranges are inclusive and ordered. Time-slot starts are
  inclusive, ends are exclusive, equal bounds are invalid, and a reversed slot
  crosses midnight.
- Temporal alternatives within dates/ranges, weekdays, or time slots are OR;
  non-empty temporal categories and separate trigger conditions are AND.
- A location belongs to exactly one story. An interaction may reference one
  location from that story.
- Selecting a localized interaction changes the reader's current location;
  selecting an unlocalized interaction preserves it.
- A character belongs to exactly one story. An interaction may reference several
  characters from that story without duplicates.
- Character presence is scoped to the current interaction and does not carry
  over to the next interaction.
- A stat definition belongs to exactly one story and has one immutable scalar
  type (`number`, `boolean`, or `string`). Its technical id is the only canonical
  identity; its author-facing name may change and does not need to be unique.
- A stat assignment belongs to exactly one Story, character, location, or item
  definition, references a definition from the same Story, and has an initial
  value matching that definition's type. One owner cannot assign the same
  definition twice. A character assignment is presented as a characteristic,
  but remains the same domain and persistence model.
- A numeric stat definition has a finite hourly change rate. Zero disables
  time-based change; positive and negative rates affect every assignment of the
  definition. Boolean and string stats cannot change automatically with time.
- A story has at most one playable character in the current reader vertical.
  Selecting a new playable character clears the previous selection.
- Removing a stat assignment or definition removes interaction stat effects and
  trigger conditions that reference it.
- `set` stat effects preserve the declared type. `add` and ordered
  comparisons are numeric only; equality and inequality require matching types.
  Missing or ill-typed runtime values never default to zero.
- Effects and conditions target an assignment id. An item-definition assignment
  additionally requires an exact instance of that definition.
- Removing an item instance also removes stat effects and conditions targeting
  that exact instance.
- Reader and Simulation progress preserve the probability seed. Reloading or
  stepping backward replays the same rolls; starting a new run creates a new seed.
- Numeric stat hourly changes are prorated by interaction duration and applied
  before ordered explicit effects.
- An item definition belongs to exactly one story.
- An item definition may assign each same-story stat definition at most once,
  with a correctly typed initial value inherited independently by every item instance.
- Locations, characters, stat definitions, and item definitions may
  reference an optional image URL. An empty value means that no image is configured.
- Locations, characters, stat definitions, and item definitions may have one
  optional category label. Categories organize entities of the same type and do
  not affect reader evaluation or ownership.
- An authored item instance has one structural placement and references one item
  definition from the same story. A root belongs to one character or one
  location; a nested instance has one structural parent item.
- Reader replay resolves each definition and character or location root through the authored
  item relationship tree.
- Several item instances owned by one character may reference the same item
  definition; every instance keeps a distinct id.
- Removing an authored character item instance also removes legacy
  exact-instance inventory effects and stat effects that reference it.
- Interaction inventory effects normally reference any same-story item
  definition and may target one same-story character; obtaining creates a new
  runtime instance owned by that character and losing removes one of that
  character's instances. Legacy effects without a character remain readable.
- Runtime item stat values are independent per item instance, even when several
  instances share one item definition.
- An item-targeted stat effect references one exact item instance and one stat assigned
  by that instance's definition. An interaction can affect that pair at most
  once, using finite `add` or `set` semantics.
- Accepted recursive-item target invariants are documented in ADR-013. An item
  will have one structural placement, relationships will stay within one story,
  cycles will be rejected, and moving a container will preserve its descendant
  subtree. These are target constraints, not claims that the current flat
  `Character.items` implementation already supports nesting.
- Implemented relationship foundation: a projected item has at most one parent,
  parent and child are distinct same-story instances, and relationship types are
  limited to the ADR-013 set. The service rejects ancestor cycles. Moving a root
  between characters, locations, or item containers preserves its
  complete projected subtree without changing ids; deleting a non-empty
  container is rejected.
- Removing a stat assignment from an item definition removes interaction stat
  effects that would otherwise reference that unassigned stat.
- An interaction has at most one effect per non-item assignment or exact
  item-instance/assignment pair. An effect either adds a finite numeric value or
  replaces the value with one of the definition's declared type.
- Selecting an interaction first applies time-based stat changes for its
  duration, then its explicit stat effects, before the next choices are
  evaluated. Replaying the journey reconstructs the same stat state.
- If no interaction is available in the reader, the current branch stops.
- A reader save belongs to exactly one authenticated user, one story, and one
  slot. The two reserved slot ids represent the reader and Simulation Mode
  autosaves; every other slot is a named manual save.
- Each user/story pair has at most one autosave per mode and at most 20 manual
  saves. Manual saves are readable and writable from either authorized mode.
- Its JSON state is versioned and keeps the ordered journey, including repeated
  visits, plus a materialized runtime snapshot.
- Current interaction, unique visits, story time, location, and typed stats are
  reconstructed from the ordered journey before persistence.
- Saved owned item ids reference distinct authored or deterministic runtime item
  instances and are reconstructed by replaying interaction item effects.
- Saved item stat values are reconstructed from definition defaults, elapsed
  story time, and ordered interaction effects rather than trusted from clients.
- An interaction has at most one inventory effect per item definition. Every
  obtain creates another instance; losing an absent definition is a no-op.
- An item trigger condition references one same-story item definition and tests
  whether at least one instance is currently owned.
- Normal reader navigation writes only the reader autosave. Normal Simulation
  Mode navigation writes only the simulation autosave and requires effective
  edit permission. Loading another slot copies its replayed state into the
  current mode's autosave without mutating the source slot.

## Editor Projection Invariants

- The narrative model is the source of truth; React Flow is only a canvas
  projection.
- A rectangular graph selection is transient editor state. It never creates a
  persisted Group, changes trigger ownership, or gives semantic meaning to a
  decoration frame that overlaps the selected nodes.
- Graph decorations are authored presentation metadata only. They never affect
  trigger eligibility, interaction ownership, reader output, or progress replay.
- A decoration frame is not a semantic group. Moving or resizing it never moves
  or mutates interactions and triggers that visually overlap it.
- Decoration nodes render behind interaction and trigger nodes. Their persisted
  position, frame dimensions, color, text, and typography remain independent from
  React Flow's transient node state.
- A graph edge represents one trigger input, not necessarily the whole trigger.
- A trigger with several inputs appears as several graph edges that share the same
  trigger id.
- A linked trigger position is optional authoring projection metadata and never
  changes trigger or reader semantics. Missing positions use stable automatic
  placement.
- Several triggers between the same source and target should be displayed as a
  grouped edge with several route variants, while remaining distinct triggers in
  the domain model.
- Moving a grouped trigger marker saves the same position on every represented
  trigger variant so deleting one variant does not unexpectedly move the group.
- Editing a linked trigger should happen from the graph trigger marker
  representing the relationship.
- Editing a root trigger should happen from a visible root trigger marker rather
  than from the interaction content inspector.
- Interaction input and output lists should not be duplicated in the inspector
  when the graph already represents them.
- When connecting interactions, the editor must let the author choose between
  adding the source as an input to an existing trigger and creating a new trigger
  when both are possible.
- Adding an input to an existing trigger preserves one trigger with shared
  conditions across several inputs.
- Creating a new trigger creates a separate condition group for the same output
  interaction.
- Interaction editing should stay focused on interaction content and root trigger
  behavior.
- Creating or deleting one edge must not silently mutate unrelated trigger inputs.
- Deleting a trigger input link removes only that input when other inputs remain.
- Removing the last input from a trigger turns it into a root trigger instead of
  deleting the interaction's last availability rule.

## Access Control Invariants

- Authentication uses opaque, revocable server-side sessions. Raw session tokens
  and passwords must never be persisted.
- Every story has exactly one creator. Its creator and a global administrator can
  always read, edit, manage, and delete it.
- Global roles are limited to operational account roles (`user` and `admin`).
  Ordinary reading, editing, management, and future comment capabilities are
  resolved per story.
- A story is denied for reading by default: new stories resolve to private,
  owner-only editing, with commenting enabled for editors. A forward migration
  maps the removed `disabled` policy to `editors` and `authenticated` to `readers`.
- Public visibility permits anonymous reading. Authenticated visibility permits
  any signed-in user to read. Invitation visibility requires a story-specific
  viewer or editor grant.
- A private story ignores collaborator grants until its visibility changes. A
  stale grant must never bypass private visibility.
- An editor grant implies reading only when the story is not private. The
  authenticated edit policy implies reading and editing for signed-in users.
- Only the story creator or a global administrator can manage access settings,
  collaborators, or deletion. An ordinary editor cannot grant itself management.
- Every API read and mutation checks effective access; knowledge of an entity or
  story id never grants access.
- Reader progress remains owned by one authenticated user and is available only
  while that user can read the corresponding story.
- The last global administrator cannot be demoted, and first-administrator
  selection is serialized with administrator-role changes.
- Comment policy is either `editors` or `readers`. The latter grants commenting
  only to authenticated users who already have effective read permission.
- The API enforces comment capability server-side rather than inferring it from
  interface visibility.
- The graph editor and Simulation Mode require effective edit permission. A
  reader-only comment capability never grants either authoring surface.

## Post-MVP Invariants To Preserve

- Pending suggestions are visible to users who can review or approve suggestions
  for that story.
- Direct edits and pending suggestions should share an event-log foundation.
- Interface internationalization applies to product UI copy, not user-authored
  story content.
- Later, contextual inputless triggers may also depend on world state, not only
  visited / not visited interaction conditions.
- Story completion should be explicit, such as through a final interaction or
  play-session completion rule.
