# Open Questions

This page tracks design questions that are intentionally postponed. They should
not block the MVP unless a future implementation touches the affected area.

## Users and Permissions

- Define the permission hierarchy: decide whether `manage story settings`
  includes every other permission, whether `edit directly` includes `suggest
changes`, and whether every non-read permission implies `read`.
- Define public access semantics: decide whether public stories are accessible
  without an account or only by authenticated users.
- Define approval rules: decide who can approve pending suggestions, whether the
  creator always has override rights, whether several approvals can be required,
  and whether some permissions allow automatic approval.

## Change History and Suggestions

- Define event granularity: decide whether events are coarse, such as
  `interaction.updated`, or precise, such as `interaction.title.changed`,
  `trigger.input.added`, and `condition.removed`.
- Define how pending suggestions are previewed: decide whether users inspect a
  list of events, a temporary draft state, or both.
- Define how rejected suggestions are retained and whether they can be reopened.

## Story Format and Examples

- Define a stable `story-format.md` before durable persistence, migrations, JSON
  import/export, or external integrations depend on the story shape.
- Decide whether documented examples should include simplified JSON, expected
  reader results, and associated regression tests.
- Consider examples for simple branching, visited-history conditions, shared
  triggers, alternative triggers, and cycles.

## Story Translation

- Decide whether translating user-authored story content is worth implementing at
  all.
- If explored later, decide whether translations are separate linked stories,
  locale variants inside one story, or an external export/import workflow.
- Keep story translation separate from interface internationalization.

## Editor Technology

- Keep React Flow as a rendering and interaction layer while it fits the editor.
- Revisit the integration if trigger semantics or story operations start changing
  only to satisfy React Flow constraints.

## Documentation and Diagrams

- Decide whether to add a local command for previewing Mermaid or PlantUML
  diagrams.
- Keep generated diagram images out of version control unless the project gains a
  reliable regeneration command.
