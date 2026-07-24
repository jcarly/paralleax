# MVP

The MVP validated the narrative core before adding variables, AI, or advanced
exports. Locations and characters are the first post-MVP context verticals.

## Included

- Story: create, read, edit, and delete a scenario.
- Interaction: create, edit title and content, move in the editor, delete.
- Trigger: define input interactions and simple conditions.
- Reader: execute a story through successive choices.
- Story persistence: save authored stories in PostgreSQL.
- Authoring reliability: expose save progress and failures, confirm structural
  deletions, and make ambiguous trigger connections explicit.

Local accounts, sessions, and creator-only ownership were implemented as an
early supporting foundation. They are present in the product but are not part of
the narrative-core validation criteria.

## Out of Scope for Now

- Attributes and variables.
- Timing and probabilities.
- Automatic choices.
- Media.
- Final interactions.
- Persisted reader sessions and player saves.
- AI.
- Real-time collaboration.
- Story sharing and delegated permissions.
- Unity, executable, embeddable web app, or video exports.

Story permissions and collaboration remain post-MVP directions. The existing
local identity foundation does not imply that sharing or permission semantics
have been validated.

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
- authors explicitly choose between extending an existing trigger and creating a
  separate trigger when both are possible;
- saves expose in-progress, successful, and failed states, and a failed save can
  be recovered by reloading the persisted story;
- deleting an interaction or trigger requires confirmation;
- the reader respects inputs and conditions;
- unit, component, API, and Playwright tests pass in CI.
