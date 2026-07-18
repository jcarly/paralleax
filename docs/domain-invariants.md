# Domain Invariants

These invariants protect the narrative model from UI or storage implementation
details. They should stay covered by tests as the editor grows.

## MVP Invariants

- A story contains zero or more interactions.
- An interaction should keep at least one trigger.
- An interaction should always have a canvas position. Loaded or incoming story
  data with a missing position is normalized with a stable default position.
- Story and interaction titles are required strings. Interaction bodies are
  stored as strings; an API body value of `null` is normalized to an empty
  string.
- A trigger belongs to exactly one output interaction.
- A trigger can have zero or more input interactions.
- Deleting the last trigger of an interaction keeps that trigger and turns it
  into an inputless trigger.
- An inputless trigger without conditions is a starting trigger.
- An inputless trigger with conditions is a contextual trigger evaluated during
  reading.
- Inputs on the same trigger are OR conditions: any one input can make the output
  interaction reachable if the trigger conditions also match.
- Conditions on the same trigger are AND conditions: all conditions must match.
- MVP conditions only check visited or not visited interactions.
- If no interaction is available in the reader, the current branch stops.

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

## Post-MVP Invariants To Preserve

- User identity and permissions must not enter the MVP implementation before the
  Story, Interaction, Trigger, and Reader core is stable.
- Story permissions are story-level capabilities, not global user types.
- The creator owns the story and story-specific permission overrides refine
  default access.
- Pending suggestions are visible to users who can review or approve suggestions
  for that story.
- Direct edits and pending suggestions should share an event-log foundation.
- Interface internationalization applies to product UI copy, not user-authored
  story content.
- Later, contextual inputless triggers may also depend on world state, not only
  visited / not visited interaction conditions.
- Story completion should be explicit, such as through a final interaction or
  play-session completion rule.
