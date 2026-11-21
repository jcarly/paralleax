# ADR-049 - Portable Trigger Probability Identity

Status: Accepted

Date: 2026-11-20

## Context

ADR-025 derives a Trigger's deterministic probability roll from the reader seed,
step and Trigger ID. Trigger IDs are globally unique in PostgreSQL. Importing a
Story into a database that already contains it therefore requires changing those
IDs; doing so also changes its probability rolls, even when the seed and choices
are identical. Story JSON must preserve narrative behavior across that collision.

## Decision

Give a Trigger an optional stable probability identity, separate from its
persistence ID. If absent, the engine uses its current Trigger ID, preserving
existing behavior and reader saves. When an import must remap a Trigger ID, it
retains the original probability identity, using the original ID if the source
has none. Subsequent exports and imports preserve this value. Normal Trigger
creation continues to use its own ID; the value is not an authoring control.

Persist the optional value on the Trigger row through a migration and carry it
through all full, editor, runtime and native-format projections. It must survive
edits and history replay. Imported values are subject to the Story's overall
size limits. The Story format documents the field and its default.
This is a narrative input, not a user identity, permission or database key.

## Consequences

The same seed and semantic journey retain the same probability rolls after a
collision remap. Old Stories and saves keep their previous rolls. A schema
change is necessary because the value must survive editing and another export.
All reading and writing paths must carry it before native import is enabled;
partially deploying this decision would silently change behavior.

Changing Trigger primary keys to Story-scoped keys was considered. Existing
queries and foreign keys assume global uniqueness, so that approach would require
a broader and riskier persistence change. Using the new ID as the roll input
was rejected because it violates the transfer's runtime-fidelity requirement.
