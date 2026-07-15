# MVP

The MVP validates the narrative core before adding characters, places, variables, AI, or advanced exports.

## Included

- Story: create, read, edit, and delete a scenario.
- Interaction: create, edit title and content, move in the editor, delete.
- Trigger: define input interactions and simple conditions.
- Reader: execute a story through successive choices.

## Out of Scope for Now

- Characters.
- Places.
- Attributes and variables.
- Timing and probabilities.
- Automatic choices.
- Media.
- Final interactions.
- Persisted reader sessions and player saves.
- AI.
- Real-time collaboration.
- Authentication.
- User accounts and story permissions.
- SQL persistence.
- Unity, executable, embeddable web app, or video exports.

Authentication, user accounts, story permissions, and collaboration are grouped
as a post-MVP direction because they depend on durable identity and persistence.
They should not enter the code until the Story, Interaction, Trigger, and Reader
core is validated.

## MVP Rules

- An inputless trigger without conditions is a starting trigger.
- An inputless trigger with conditions is a contextual trigger evaluated during
  reading.
- An interaction should keep at least one trigger, including root interactions.
- An interaction can have one or more input interactions through its trigger.
- Several interactions can share the same input interaction: this creates a choice.
- Several triggers can connect the same input interaction to the same output
  interaction to represent OR condition groups.
- MVP conditions only check whether an interaction has been visited or not.
- If no interaction is available in the reader, the current branch stops. In the
  MVP, this is the only ending signal; later versions may distinguish a stopped
  branch from an explicitly completed story.

## Stability Criteria

The MVP is considered stable when:

- the editor does not lose data while editing or moving interactions;
- automatically created outputs do not overlap;
- triggers accept several inputs;
- inputless triggers can be either starting triggers or contextual triggers based
  on whether they have conditions;
- authors can express OR condition groups through several triggers between the
  same interactions;
- the reader respects inputs and conditions;
- unit, component, API, and Playwright tests pass in CI.
