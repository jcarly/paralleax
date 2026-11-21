# Paralleax Story JSON, version 1

A Story file is a UTF-8 JSON document for transferring authored Paralleax
content to a new private Story in another installation. It is a product
exchange format, not a PostgreSQL dump or a React Flow graph. Export requires
an authenticated user with effective **edit** permission; read access alone
does not grant export. The source Story is never changed.

## Envelope and compatibility

```json
{
  "format": "paralleax.story",
  "version": 1,
  "story": {
    "title": "The door",
    "startDateTime": "2026-11-20T09:00",
    "interactions": [
      {
        "id": "opening",
        "title": "Opening",
        "body": "<p>The door opens.</p>",
        "position": { "x": 80, "y": 120 },
        "durationMinutes": 0,
        "triggers": [
          {
            "id": "start",
            "inputInteractionIds": [],
            "conditionGroups": [{ "id": "route", "conditions": [] }],
            "appearanceProbability": 100,
            "timerSeconds": null
          }
        ]
      }
    ]
  }
}
```

The envelope has exactly these three properties. Version is an integer and
version 1 is the only supported version. Unknown identifiers, versions and
properties are rejected. There is no implemented migration or compatibility
promise for future versions. Because v1 rejects unknown fields, adding a field
or changing its meaning requires a new version and an explicit migration or
reader; a newer file is never silently interpreted as v1.

## Authored content

`story` contains `title`, `interactions`, and optional `startDateTime`,
`locations`, `characters`, `statDefinitions`, `stats`, `itemDefinitions`,
`groups` and `graphDecorations`. Arrays retain their authored order. The
current Story model has no Story description field or configurable calendar;
location, character and item-definition descriptions are included. The start
date and time use `YYYY-MM-DDTHH:mm`, with the existing calendar rules.

- An **interaction** contains `id`, `title`, sanitized HTML `body`, `position`
  (`x`, `y`), `triggers`, and optional `locationId`, `characterIds`,
  `durationMinutes`, `statEffects`, `itemEffects` and `conditionalTextBlocks`.
  An effect targets a same-Story stat assignment or item, including an exact
  item instance when needed. A stat effect contains an operation and exactly one
  typed literal `value` or `expression`; an item effect identifies either an
  instance or definition and may identify a character.
- A **trigger** belongs to the interaction containing it and contains `id`,
  `inputInteractionIds`, optional `conditionGroups`, `appearanceProbability`,
  `timerSeconds`, `position` and `probabilityKey`. Inputs are alternative
  sources; conditions within a group are AND and groups are OR. Legacy v1
  input may use `conditions` instead of `conditionGroups`, but not both. A
  probability defaults to 100 and a timer to `null`.
- A **condition** is an interaction-visited, current-location, character-present,
  item-owned, typed-stat or temporal condition. Stat conditions use a literal,
  another assignment (optionally on an exact item), or an expression. Temporal
  conditions may contain dates, date ranges, weekdays and time slots. The
  existing editor and narrative rules determine valid values and references.
- Locations and characters contain `id`, `name`, `description`, optional
  `category`, `imageUrl`, stat assignments and item instances. Characters may
  additionally be playable. At most one character is playable.
- Stat definitions contain `id`, `name`, optional `valueType` (`number`,
  `boolean` or `string`), category, image URL and numeric `changePerHour`.
  Assignments contain `id`, `statDefinitionId` and a typed `initialValue`;
  they can belong to the Story, a character, a location or an item definition.
- Item definitions contain `id`, `name`, `description`, optional category,
  image URL and assignments. Item instances contain `id`, `itemDefinitionId`
  and optional `parentItemId`, `relationshipType` and `slotKey`. Roots are in a
  character or location inventory. Nested items remain in their root owner's
  inventory and reference their parent; cycles and missing parents are invalid.
- Groups contain `id`, `title`, `interactionIds` and optional `parentGroupId`.
  They form an acyclic hierarchy and each interaction has at most one direct
  group. Frame and text graph decorations preserve their position, color and
  respective dimensions or text typography.
- Rich text preserves supported HTML and its structured references. The
  `data-interaction-link-target`, legacy `data-conditional-text-target` and
  `data-conditional-text-link` attributes identify interactions;
  `data-conditional-text-block` identifies a block on the owning interaction;
  `data-stat-value` identifies a stat assignment and `data-stat-item` its exact
  item instance where required. Expressions use the shared expression grammar.
  Normal sanitizer additions such as an inert marker's `contenteditable` are
  allowed; unsafe or unsupported elements, attributes and URLs are rejected.

The exact allowed properties and primitive types are defined by
`nativeStoryContentSchema` in `packages/shared`. The API additionally applies
existing editor constraints, quotas, narrative rules and same-Story reference
checks. Unknown fields are not ignored. A file can reference external media
URLs, but the media itself is not embedded or copied.

## Identity and normalization

The file excludes the Story ID. Import creates a fresh Story ID and gives the
importing user ownership with private, owner-editable access. Entity IDs are
preserved when they do not collide with destination persistence IDs. Colliding
IDs are deterministically remapped for the new Story and destination occupancy;
all structured references, expressions and supported HTML markers follow the
mapping. Conditional block IDs are scoped to their interaction and condition
group IDs to their trigger. The remapping is revalidated before any insert.

A trigger whose ID changes retains its original probability identity in
`probabilityKey`, or retains an already present key. With the same run seed,
step and semantic choices this preserves its deterministic probability roll;
without a key, the Trigger ID is used. See [ADR-049](decisions/ADR-049-portable-trigger-probability.md).

Identifiers must be non-empty and cannot be `__proto__`, `prototype` or
`constructor`: existing runtime and history objects use IDs as keys. Strings
containing NUL are rejected because PostgreSQL cannot store them. A legacy
Story containing such an identifier cannot currently be imported. Expressions
are reserialized only when their references change; sanitized HTML may be
normalized while retaining its authored meaning. Existing persistence defaults
also normalize omitted values, such as duration zero, numeric stat type,
empty optional collections and the default start date. A legacy interaction
without a position receives the same stable default as an editor read.

A complete export uses fixed object-property order and the persisted order of
arrays. No canonical JSON byte representation is promised. Compare Stories by
semantic content after accounting for ID mappings, equivalent default values,
HTML normalization and a `probabilityKey` equal to its Trigger's original ID.

## Exclusions

Accounts, authentication, sessions, tokens, owners, capabilities, visibility
settings, collaborators and invitations are not included. Neither reader saves
and progress, collaborative comments, change history nor technical logs are
included. Comments can contain personal information and user references; they
are deliberately excluded rather than partially restored.

## API and limits

- `GET /api/stories/:storyId/export` returns a JSON attachment. Effective edit
  access is required and the response is private and non-cacheable.
- `POST /api/stories/imports/native/preview` validates a file and returns its
  title and entity counts without writing. `POST /api/stories/imports/native`
  validates it again and creates a new Story. Both accept an
  `application/octet-stream` body and require authentication.
- The upload limit is **33 MiB**. It applies only to these binary endpoints;
  the global JSON request limit remains 128 KiB. Configured Story quotas also
  apply, including the default 32 MiB serialized Story limit. The import is
  bounded and uses one transaction, not one HTTP request per entity.
- The production Nginx proxy keeps its global 128 KiB body limit and grants
  33 MiB only to the native preview and import routes. Those routes stream
  uploads through the proxy and allow up to one hour for the transfer and API
  response.
- Invalid structure, unsupported versions, duplicate IDs, missing references,
  invalid graph or stat data, unsafe content and quota failures return a stable
  error code and, when available, a JSON path. Database details and other
  users' identities are not returned. A failed transaction leaves no partial
  Story. Imports do not replace or merge an existing Story.

Native imports do not have a persisted idempotency key. If the connection is
lost after the server commits but before the browser receives the Story ID, the
library refreshes and the dialog asks the author to check for the new Story
before retrying. Repeating the import can create a second copy; exactly-once
recovery across interrupted requests would require additional persisted request
state and is not implemented.
