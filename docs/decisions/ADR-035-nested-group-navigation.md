# ADR-035: Nested Group Navigation

Status: Accepted; direct membership revised by [ADR-036](ADR-036-exclusive-group-membership.md)

Date: 2026-10-19

## Context

The requested completion of interaction Groups requires a navigable tree and
membership management. ADR-029 already provides canonical Groups, many-to-many
Interaction membership, relational persistence and authored change history.

## Decision

Extend that Group with one optional `parentGroupId`. Parents belong to the same
Story; self-parentage, missing parents and ancestor cycles are rejected. This
is an organizational tree, not React Flow containment or narrative ownership.
Direct Interaction membership remains ordered and many-to-many. Recursive
navigation shows the unique union of direct and descendant members.

Deleting a Group promotes its direct children to its own parent, or to the root.
All Interactions and subgroups survive. The shared operation participates in the
existing atomic authored change history, so undo restores both the Group and
the former parentage. History replay rejects invalid memberships and cycles
that would result from intervening edits.

Migration `202610190042_nested_story_groups` adds a nullable parent column and
a same-Story composite foreign key, deferred until transaction completion so
authoring order and history restoration need not insert parents first. Existing
Groups migrate as roots. Cycle validation belongs to shared deterministic code.

The existing left context navigation exposes collapse, recursive highlight,
explicit viewport centering, rename, deletion and membership editing. Collapse
and selected Group state remain local to the editor and do not enter Story
history. Selecting a Group never selects draggable graph nodes or opens an
Interaction inspector. Shift/Alt rectangles compose the transient selection;
Ctrl+click toggles Interactions and Ctrl+G focuses the existing creation form.
Editable controls keep their native shortcuts.

## Consequences

No parallel Group model, membership store, graph node type or reader rule is
introduced. Flat Stories and existing Groups remain compatible. Deployments must
run the migration before starting the updated API. DAGs with several Group
parents and persisted per-author view preferences remain outside this contract.
