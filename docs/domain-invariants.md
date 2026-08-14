# Domain Invariants

These invariants protect the narrative model from UI or storage implementation
details. They should stay covered by tests as the editor grows.

## MVP Invariants

- A story contains zero or more interactions.
- Review comment threads are story-scoped collaboration metadata, not authored
  story state. They never change reader evaluation, progress, or exports.
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
- A conditional body block stores only its target interaction id. Its visibility
  is derived from outgoing triggers and it cannot define independent conditions.
- Disconnecting its target preserves the conditional body content but hides it
  from readers. Simulation Mode keeps it visible with unavailable styling and an
  explanation.
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
- Conditions on the same trigger are AND conditions: all conditions must match.
- Conditions can check visited interactions, the current location, character
  presence in the current interaction, a numeric character stat, or the
  story-local calendar.
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
- A stat definition belongs to exactly one story and can be assigned to several
  characters.
- A stat definition has a finite hourly change rate. Zero disables time-based
  change; positive and negative rates affect every assignment of the definition.
- A character stat assignment belongs to exactly one character, references one
  same-story stat definition, has a finite numeric initial value, and may only
  be referenced inside that story.
- A character cannot receive the same stat definition twice.
- A story has at most one playable character in the current reader vertical.
  Selecting a new playable character clears the previous selection.
- Removing a character stat also removes interaction stat effects and trigger
  conditions that reference that assignment.
- An item definition belongs to exactly one story.
- An item definition may assign each same-story stat definition at most once,
  with a finite numeric initial value inherited by every item instance.
- Locations, characters, stat definitions, and item definitions may reference
  an optional image URL. An empty value means that no image is configured.
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
  exact-instance inventory effects and item-stat effects that reference it.
- Interaction inventory effects normally reference any same-story item
  definition and may target one same-story character; obtaining creates a new
  runtime instance owned by that character and losing removes one of that
  character's instances. Legacy effects without a character remain readable.
- Runtime item stat values are independent per item instance, even when several
  instances share one item definition.
- An item stat effect references one exact item instance and one stat assigned
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
- Removing a stat assignment from an item definition removes interaction
  item-stat effects that would otherwise reference that unassigned stat.
- An interaction has at most one effect per stat. An effect either adds a finite
  value to the current value or replaces it.
- Selecting an interaction first applies time-based stat changes for its
  duration, then its explicit stat effects, before the next choices are
  evaluated. Replaying the journey reconstructs the same stat state.
- If no interaction is available in the reader, the current branch stops.
- Reader progress belongs to exactly one authenticated user and one story.
- Its JSON state is versioned and keeps the ordered journey, including repeated
  visits, plus a materialized runtime snapshot.
- Current interaction, unique visits, story time, location, and stats are
  reconstructed from the ordered journey before persistence.
- Saved owned item ids reference distinct authored or deterministic runtime item
  instances and are reconstructed by replaying interaction item effects.
- Saved item stat values are reconstructed from definition defaults, elapsed
  story time, and ordered interaction effects rather than trusted from clients.
- An interaction has at most one inventory effect per item definition. Every
  obtain creates another instance; losing an absent definition is a no-op.
- An item trigger condition references one same-story item definition and tests
  whether at least one instance is currently owned.
- Author Simulation Mode never loads, updates, or deletes player progress.

## Editor Projection Invariants

- The narrative model is the source of truth; React Flow is only a canvas
  projection.
- A graph edge represents one trigger input, not necessarily the whole trigger.
- A trigger with several inputs appears as several graph edges that share the same
  trigger id.
- Several triggers between the same source and target should be displayed as a
  grouped edge with several route variants, while remaining distinct triggers in
  the domain model.
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
- A story is denied by default: new and legacy stories resolve to private,
  owner-only editing with comments disabled unless explicit settings say otherwise.
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
- The comment policy is persisted before comments exist. A later comment API must
  enforce it server-side rather than infer permission from interface visibility.

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
