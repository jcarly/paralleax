# Domain Invariants

These invariants protect the narrative model from UI or storage implementation
details. They should stay covered by tests as the editor grows.

## MVP Invariants

- A story contains zero or more interactions.
- An interaction should keep at least one trigger.
- A trigger belongs to exactly one output interaction.
- A trigger can have zero or more input interactions.
- A trigger with no inputs is a root trigger.
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
- Editing a linked trigger should happen from the graph edge representing the
  relationship.
- Interaction editing should stay focused on interaction content and root trigger
  behavior.
- Creating or deleting one edge must not silently mutate unrelated trigger inputs.
- Deleting a selected trigger edge removes only that input when other inputs
  remain.
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
