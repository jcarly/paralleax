# Story Change Batches

A change batch is an ordered list of editorial operations on one Story. It is
previewed without writing anything, then committed atomically against the
revision it was previewed on. Design: [ADR-050](decisions/ADR-050-editorial-change-batches.md).
The contract lives in `packages/shared/src/story-changes` and does not depend on
the MCP adapter or any assistant.

## Operations (version 1)

```json
{
  "version": 1,
  "baseRevision": 12,
  "operations": [
    {
      "type": "create_interaction",
      "ref": "message",
      "inputInteractions": ["<existing interaction id>"],
      "fields": { "title": "The encrypted message", "body": "<p>A signal.</p>" }
    },
    {
      "type": "create_interaction",
      "ref": "decode",
      "inputInteractions": [{ "ref": "message" }],
      "fields": { "title": "Decode it" },
      "defaultTrigger": { "ref": "decodeChoice" }
    },
    {
      "type": "update_trigger",
      "trigger": { "ref": "decodeChoice" },
      "fields": {
        "conditionGroups": [
          { "conditions": [{ "interactionId": { "ref": "message" }, "hasBeenVisited": true }] }
        ]
      }
    }
  ]
}
```

| Operation            | Required                | Optional                                                                   |
| -------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `create_interaction` | -                       | `ref`, `inputInteractions`, `fields`, `defaultTrigger`                     |
| `update_interaction` | `interaction`, `fields` | -                                                                          |
| `create_trigger`     | `interaction` (output)  | `ref`, `inputInteractions`, `fields`                                       |
| `update_trigger`     | `trigger`               | `interaction` (required for an existing ID), `inputInteractions`, `fields` |
| `create_character`   | `fields.name`           | `ref`, other `fields`                                                      |
| `update_character`   | `character`, `fields`   | -                                                                          |
| `create_location`    | `fields.name`           | `ref`, other `fields`                                                      |
| `update_location`    | `location`, `fields`    | -                                                                          |

| Operation                | Required                                         | Optional |
| ------------------------ | ------------------------------------------------ | -------- |
| `create_stat_definition` | `fields.name`, `fields.valueType`                | `ref`    |
| `update_stat_definition` | `statDefinition`, `fields`                       | -        |
| `create_stat_assignment` | `statDefinition`, `owner`, `fields.initialValue` | `ref`    |
| `update_stat_assignment` | `assignment`, `fields.initialValue`              | -        |

- Interaction `fields`: `title`, `body` (HTML, sanitized), `position`,
  `locationId`, `characterIds`, `statEffects`, `itemEffects`,
  `conditionalTextBlocks`, `durationMinutes`. Omitted fields keep their value;
  lists replace the current list. They follow the same rules and limits as
  `PATCH /stories/:id/interactions/:interactionId`.
- Trigger `fields`: `conditionGroups` (replaces every group; groups are OR,
  conditions in a group are AND), `appearanceProbability`, `timerSeconds`,
  `position`. `inputInteractions` replaces the inputs.
- `create_interaction` creates the Interaction with its default Trigger, whose
  inputs are `inputInteractions` (a branch from each of them). `defaultTrigger`
  sets that Trigger's fields and may name it with `ref`. Without `position`, the
  editor placement rule places it below its first input, or in the root column.
- Condition group and conditional text block IDs may be omitted; they are
  generated.
- Character `fields`: `name`, `description`, `category`, `imageUrl`,
  `isPlayable`. Location `fields`: `name`, `description`, `category`,
  `imageUrl`. They follow the same rules and limits as
  `POST/PATCH /stories/:id/characters` and `/locations` (the same DTOs and the
  same functions): `name` is required and at most 200 characters, `category` at
  most 100, `imageUrl` at most 2,048, strings are trimmed, an empty `category`
  removes it, a new character defaults to `isPlayable: false`, and making a
  character playable clears the flag of every other character (that change shows
  as an update of those characters in the summary). Omitted fields keep their
  value. Stats and items of a character or location are not set by these
  operations.
- Stat definitions and assignments ([ADR-021](decisions/ADR-021-typed-story-stats.md),
  [ADR-050 amendment](decisions/ADR-050-editorial-change-batches.md)): a
  **definition** is a reusable, Story-owned name with one immutable value type; an
  **assignment** gives one owner its own initial value of that type. Both follow
  the rules and limits of `POST/PATCH /stories/:id/stat-definitions` and
  `/stats` (the same DTOs and the same `story-stats` functions): names are
  trimmed and at most 200 characters, `category` at most 100, `imageUrl` at most
  2,048, `changePerHour` is for numeric definitions only (0 removes it), the
  initial value must have the definition's type (no conversion), and one owner
  assigns a definition at most once. Two assignments of one definition, on two
  owners, keep independent values. Unlike the editor endpoint, a batch **requires
  `valueType`** (`number`, `boolean` or `string`) and never assumes `number`.
  - `owner` is `{ "type": "story" }`, `{ "type": "character", "id": … }`,
    `{ "type": "location", "id": … }` or `{ "type": "itemDefinition", "id": … }`.
    A character or location is an existing ID or a reference to an earlier
    creation; an item definition is an existing ID (batches create no item
    definitions or instances). An assignment on an item definition is a template:
    every instance of the definition starts from its value.
  - `update_stat_assignment` changes the authored initial value only. It never
    touches the value reached while reading or simulating, which is replayed from
    the journey. The type of a definition, the owner of an assignment and its
    definition cannot change; deletion is not supported.
  - Interaction `statEffects` (`add` or `set`, a literal `value`) and stat
    conditions (`statId`, a literal `value` or a `comparisonStatId`) in Trigger
    groups and conditional text blocks apply the existing rules unchanged:
    `add` and ordered comparisons for numbers only, one effect per target and
    interaction, comparisons between assignments of the same type. `statEffects`
    replaces the interaction's list.
  - Expressions (`expression`) and exact item instances (`itemId`,
    `comparisonItemId`) accept existing IDs only; references to batch entities
    inside expressions are not supported yet.
- Deletion, groups and items are not supported yet. New operation types extend
  the same union.

## References and IDs

- An existing entity is named by its ID string. Whether it exists and belongs to
  the Story is checked when the operation is applied, with the editor rules: a
  reference to another Story is refused.
- `ref` names the entity an operation creates. Names start with a letter and
  contain up to 64 letters, digits, `_` or `-`. They are unique in the batch,
  across entity kinds.
- `{ "ref": "name" }` refers to an entity declared by an **earlier** operation,
  never a later one or its own. The kind is checked: a Trigger reference cannot
  stand for an Interaction, a Character for a Location, and so on
  (`REFERENCE_KIND_MISMATCH`).
- A reference is accepted where the field names an entity of a known kind:

  | Where                                                                                                                  | Kind            |
  | ---------------------------------------------------------------------------------------------------------------------- | --------------- |
  | `inputInteractions`, `interaction`, condition `interactionId`                                                          | Interaction     |
  | `trigger`                                                                                                              | Trigger         |
  | `update_character.character`, interaction `characterIds`, condition `characterId`, stat `owner.id` of type `character` | Character       |
  | `update_location.location`, interaction `locationId`, condition `locationId`, stat `owner.id` of type `location`       | Location        |
  | `update_stat_definition.statDefinition`, `create_stat_assignment.statDefinition`                                       | Stat definition |
  | `update_stat_assignment.assignment`, effect `statEffects[].statId`, condition `statId` and `comparisonStatId`          | Stat assignment |

  Conditions are those of Trigger condition groups and of conditional text
  blocks. Other IDs inside a batch (items, item definitions, effect item
  instances, IDs inside expressions) are existing IDs only. The condition fields
  are listed in one table (`STORY_CHANGE_CONDITION_REFERENCE_KINDS`).

- A reference to a stat definition is **never** a reference to an assignment:
  effects and conditions target the assignment (ADR-021), so a definition `ref`
  in `statId` fails with `REFERENCE_KIND_MISMATCH`, as does an assignment `ref`
  in `statDefinition`. Names are shared by every kind, so give them distinct
  names (for example `reserveDef` and `reserve`).

- `update_trigger` may omit `interaction` when `trigger` is a reference: the
  owner is known. Given with another owner, it fails (`TRIGGER_OWNER_MISMATCH`).
- Resolution is deterministic: operations are resolved in order and IDs are
  allocated in a fixed order. Preview IDs are provisional. The commit allocates
  the final IDs (random UUIDs) and returns them with their `ref` in
  `createdEntities`, including the default Trigger of each created Interaction.

## Preview

`POST /api/stories/:storyId/changes/preview` with the batch. Requires edit
access: a reader receives 403, a user without access 404, with no Story data.

The API reads one consistent snapshot, checks each operation's shape and
fields, resolves references, applies the operations in order to a copy with
the editor rules, then checks the whole result: it must change the Story
(`NO_CHANGES`) and fit the Story quotas. If `baseRevision` is given and differs
from the current revision, the preview fails with `409 STORY_REVISION_CONFLICT`.

The response (`200`):

| Field             | Meaning                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `valid`           | Whether the batch can be committed as is.                                                                                                                                                                                               |
| `proposalId`      | Present when valid: the server-issued ID of the stored proposal. Commit with it.                                                                                                                                                        |
| `expiresAt`       | When the proposal can no longer be committed (one hour after the preview).                                                                                                                                                              |
| `baseRevision`    | The revision the batch was applied to; the commit requires it unchanged.                                                                                                                                                                |
| `createdEntities` | Entities the batch creates (`kind`: `interaction`, `trigger`, `character`, `location`, `statDefinition` or `statAssignment`), with provisional IDs and their `ref`.                                                                     |
| `summary`         | Counts; every field of added interactions, Triggers, characters and locations and the changed fields of updated ones, with old and new values; added and removed connections (`source → target` per Trigger). `provisionalIds` is true. |
| `diagnostics`     | `{ severity, operationIndex, code, message, path?, details? }`; `operationIndex` is `null` for the batch as a whole.                                                                                                                    |

Shape, reference and field errors are reported for every operation. Applying
stops at the first operation that breaks an editor rule, since later operations
may depend on it. Warnings (`EMPTY_TITLE`, `NO_INPUT_INTERACTION`) do not
prevent a commit.

The summary shows what an author must review: for a created interaction its
body, effects, conditional text, location, characters and position; for a
created Trigger its condition groups, probability and timer, with its inputs and
condition count. Strings beyond 2,000 characters are cut and structured values
beyond 4,000 serialized characters are replaced by a size marker, both flagged
`truncated: true`; the commit applies the full values.

In a preview every created entity has a provisional ID. The summary marks it
twice: `provisionalIds: true`, and, for each field value that names an entity
created by the batch (for example an interaction's `characterIds` or
`locationId`), `references: [{ id, ref }]`, so a reviewer reads `alya` rather
than a UUID. After the commit, `provisionalIds` is false and the IDs are final.
Characters and locations list `name`, `ref` and every authored field of a new
one, or the changed fields of an updated one, with the same truncation rules.

`statDefinitions` lists each added or updated definition (`name`, `valueType`,
`ref`, authored fields). `statAssignments` lists **every** added or updated
assignment, whoever owns it (the Story, a character, a location or an item
definition), with its `definition` (`name`, `valueType`, `ref`), its `owner`
(`type`, `name`, `ref`) and the `initialValue` (before and after for an update,
including `0`, `false` and an empty string). The stats of characters, locations
and item definitions are not repeated as raw fields of those entities, so
nothing is shown twice and nothing is left out. Effects and conditions name the
assignment they use through `references`.

A valid preview stores the proposal: the exact operations, the user, the Story,
the base revision and an expiry, outside the authored Story. It writes no
authored data, no revision and no history entry, and sends no live notification
to open editors. Each user keeps at most 20 unexpired proposals; older ones are
removed.

## Commit

`POST /api/stories/:storyId/changes/commit` with `{ "version": 1, "proposalId": "…" }`.
The commit carries no operations: the server applies the stored ones.

1. In one transaction, the API checks edit access and locks the Story row (403
   or 404 otherwise, so revoked access is respected).
2. It finds the proposal: issued by a preview of this user, for this Story, and
   not expired (`404 STORY_CHANGE_PROPOSAL_NOT_FOUND` otherwise). A client
   cannot forge one or commit operations it did not preview.
3. It compares the current revision with the proposal's base revision under the
   lock (`409 STORY_REVISION_CONFLICT`, `details: { expectedRevision, currentRevision }`).
4. It plans and applies the stored operations again with the same rules, checks
   the result, persists it, records one history event and deletes the proposal.
   Any failure (`400 STORY_CHANGES_INVALID` with `details.diagnostics`, quotas)
   rolls back the whole batch.
5. After the transaction, open editors receive the usual `story-changed`
   notification.

The response (`200`) has `status: "committed"`, the new `revision`, the final
`createdEntities` and the `summary`. A valid batch always creates exactly one
revision.

### Retries and concurrency

| Situation                                                       | Result                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The same commit again (for example after a lost response)       | `200`, `status: "already_applied"`, the original `revision` and `createdEntities`; nothing is written. `reverted: true` if the batch was undone since. |
| The Story changed between preview and commit                    | `409 STORY_REVISION_CONFLICT`; nothing is written. Read the Story again and preview a new batch.                                                       |
| Two commits on the same revision at the same time               | They are serialized by the row lock: the first applies, the second gets `STORY_REVISION_CONFLICT`.                                                     |
| An unknown, expired, another user's or another Story's proposal | `404 STORY_CHANGE_PROPOSAL_NOT_FOUND`; preview again.                                                                                                  |

The ID of a committed proposal is stored with its history event in PostgreSQL,
so the replay survives restarts and the proposal's expiry. A proposal is bound
to its base revision: once committed, it can never be applied again, even after
an undo.

## History

A committed batch is one history event with the operation
`story.changes.committed` ("Grouped changes applied" in the editor). Undo
reverts the whole batch and redo restores it, with the usual conflict checks of
[ADR-023](decisions/ADR-023-durable-story-change-history.md): unrelated later
edits survive, an overlapping one makes the undo report a conflict.

## Limits

- At most 100 operations and 100 references per batch, and the API's 128 KiB
  request body; at most 200 diagnostics per response.
- Story quotas apply to the result of the whole batch.
- The usual per-route rate limit of Story mutations applies to both operations.
- A preview loads the complete Story.

## Errors

Errors use the API error body `{ status, code, message, requestId, details? }`.

| Code                              | Status | When                                                     |
| --------------------------------- | ------ | -------------------------------------------------------- |
| `BAD_REQUEST`                     | 400    | The envelope is malformed (version, list size).          |
| `STORY_CHANGES_INVALID`           | 400    | The batch is invalid at commit.                          |
| `FORBIDDEN`                       | 403    | The user can read but not edit the Story.                |
| `NOT_FOUND`                       | 404    | The Story does not exist or is not visible.              |
| `STORY_REVISION_CONFLICT`         | 409    | The Story changed since `baseRevision`.                  |
| `STORY_CHANGE_PROPOSAL_NOT_FOUND` | 404    | No unexpired preview of this user and Story has this ID. |
| `STORY_QUOTA_EXCEEDED`            | 422    | Reported as a diagnostic at preview.                     |

Diagnostic codes include `INVALID_OPERATION`, `UNSUPPORTED_OPERATION`,
`UNKNOWN_FIELD`, `REQUIRED_FIELD`, `INVALID_FIELD`, `INVALID_REFERENCE`,
`UNKNOWN_REFERENCE`, `DUPLICATE_REFERENCE`, `REFERENCE_KIND_MISMATCH` (also for
a Character or Location reference of the wrong kind),
`TRIGGER_OWNER_REQUIRED`, `TRIGGER_OWNER_MISMATCH`, `REFERENCE_NOT_FOUND`,
`TRIGGER_CONNECTION_EXISTS`, `NO_CHANGES` and `STORY_QUOTA_EXCEEDED`.

## Use from an MCP client

See [MCP prototype](mcp.md#tools): `preview_story_changes` and
`commit_story_changes` wrap these two operations.
