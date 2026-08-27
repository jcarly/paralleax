# ADR-021 - Generalize Stats into Typed Story Variables

## Status

Accepted.

## Context

Numeric character and item stats already provide reusable definitions, authored
initial values, deterministic interaction effects, trigger comparisons, and
reader replay. Imports and broader authoring need the same behavior for story,
character, location, and item-definition state, including boolean and string
values.

Creating a second attribute model would duplicate definitions, assignments,
effects, conditions, persistence, API operations, reader replay, and editor
controls. The product requirement is to extend the existing stat model instead.

## Decision

Generalize the existing stat model into the canonical stored-variable engine:

- `StatDefinition` remains the single reusable definition and gains one immutable
  `number`, `boolean`, or `string` value type; its id is the canonical identity,
  while its author-facing name may change and does not need to be unique;
- the existing character-stat assignment becomes a generic `StatAssignment`
  owned by the Story, a character, a location, or an item definition;
- a character-owned assignment remains a character characteristic in the user
  experience, but it is not a second domain or persistence concept;
- every assignment has its own id and authored initial value;
- an item-definition assignment is a template, so every exact authored or
  runtime item instance receives an independent replayed value;
- stat effects and conditions target the assignment id and additionally require
  an exact item instance id when the assignment belongs to an item definition.

`set` is valid for every declared type. `add`, ordered comparisons, and hourly
change are valid only for numbers. Equality and inequality are valid for every
matching scalar type. Missing or ill-typed values do not silently become zero.

PostgreSQL evolves the existing `stat_definitions`, `character_stats`, and
`interaction_stat_effects` structures. `character_stats` becomes generic stat
assignments; existing item-stat assignments and effects are migrated into that
same relational model. No parallel `attribute_*` tables or runtime path are
introduced.

Reader progress version 2 stores typed stat values while the ordered journey
remains authoritative. Version 1 numeric snapshots remain readable and are
reconstructed from the journey.

Imported ChoiceScript variables map to story-owned stat assignments. `*temp` variables
use namespaced definitions and explicit `set` effects on scene-entry
interactions, preserving source scope without adding a ChoiceScript-specific
lifetime to the Paralleax engine.

ChoiceScript identifiers are held only in the importer's transient lookup map
while expressions, effects, conditions, and interpolations are lowered to
Paralleax assignment ids. The canonical Story does not retain source identifiers
or promise incremental re-import or ChoiceScript re-export.

Rich-text interpolation references a stat assignment through inert structured
markup and never evaluates arbitrary expressions.
The author-facing `{{owner.variable}}` shorthand is resolved against one unique
same-story assignment during body sanitization and lowered to that markup. The
shorthand is not a second runtime reference model: valid saved content keeps the
assignment id and optional exact item-instance id, while unresolved shorthand is
inert and renders as empty text.

## Consequences

- Variables and characteristics share one definition, assignment, effect,
  condition, replay, API, and persistence model.
- Existing numeric character and item stats remain valid after migration.
- The editor may present a character assignment as a characteristic and a
  story-owned assignment as a variable without changing canonical semantics.
- Definitions, assignments, runtime values, and exact item instances remain
  distinct and validate same-story references.
- Calculated values, formulas, dependency graphs, and cycle handling remain out
  of scope. A future calculated stat will be read-only and derived from stored
  assignments rather than persisted as another mutable value.
