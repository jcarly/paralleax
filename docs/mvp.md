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

- An interaction can be available without input: it is then a starting point.
- An interaction should keep at least one trigger, including root interactions.
- An interaction can have one or more input interactions through its trigger.
- Several interactions can share the same input interaction: this creates a choice.
- MVP conditions only check whether an interaction has been visited or not.
- If no interaction is available in the reader, the branch stops.

## Stability Criteria

The MVP is considered stable when:

- the editor does not lose data while editing or moving interactions;
- automatically created outputs do not overlap;
- triggers accept several inputs;
- the reader respects inputs and conditions;
- unit, component, API, and Playwright tests pass in CI.
