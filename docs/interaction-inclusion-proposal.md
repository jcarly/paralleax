# Interaction Inclusion Proposal

Status: proposed, not implemented or accepted as a domain decision.

The current [QSP adapter](qsp-import.md#static-subroutine-paths) maps a limited
static `GS` / `GOSUB` subset through ordinary interactions, typed return stats,
and conditional Triggers. That interactive traversal does not implement this
proposal or provide QSP screen composition.

## Goal

Allow authored content to include an existing Interaction at an exact position
inside another Interaction. This is a generic Paralleax composition capability;
static QSP `GS` and `GOSUB` calls are an important adapter use case, not the
specification for the core model.

An inclusion would reference an existing same-Story Interaction rather than copy
it or introduce a parallel `Subroutine` entity. The included Interaction could
remain reachable through ordinary Triggers and could be referenced by several
parents.

## Proposed semantics

When an inclusion is evaluated:

- its text is inserted at the inclusion's position in the caller's ordered
  content;
- compatible effects run in that same ordered execution context;
- declared actions become available but their effects and transitions do not run
  until the reader selects them;
- nested inclusions are evaluated recursively;
- the included Interaction's entry Triggers do not gate the call;
- the reader remains in the calling Interaction, with no additional visit or
  journey step;
- location, present characters, and the included Interaction's duration do not
  change merely because of the inclusion;
- explicit state mutations produced by included effects remain effective.

This ordering is material. Rendering all prose first and applying all effects
afterward is not equivalent when later content or action creation observes
earlier state changes.

## Authoring direction

The rich-text editor would expose an `Include interaction` command that inserts a
structured reference token at the cursor. Authors could search for a target,
open it, replace it, or remove the reference. The parent editor would not embed a
duplicate editable copy of the target.

The Workbench graph would continue to show narrative reachability only. Inclusion
dependencies would not create React Flow edges. A discreet node marker and an
inspector section listing direct incoming usages could provide navigation without
conflating content dependencies with Triggers.

Persistence and editing must preserve stable target ids, copy/paste behavior,
durable undo/redo, old Story compatibility, same-Story ownership, and cleanup or
explicit diagnostics when a referenced Interaction is deleted.

## Runtime safety and determinism

The shared reader engine, API validation, reader, and Simulation Mode must use one
deterministic inclusion evaluator. It must:

- detect or reject direct and indirect inclusion cycles;
- enforce defensive depth and operation limits;
- distinguish direct from transitive references;
- apply effects exactly once for one committed narrative step, including after
  reload, rewind, save reconstruction, or Simulation replay;
- preserve action-creation time semantics instead of silently treating created
  actions as permanently reevaluated Triggers;
- report missing or invalid references without silently corrupting the caller.

Arguments may eventually be typed per call, with a scoped execution frame that
is restored after nested inclusion. A general local-variable system, return
values, or a QSP-compatible call stack must not be invented incidentally.

## QSP mapping direction

Only statically resolved `GS` or `GOSUB` calls whose behavior is representable
should become inclusion references. A QSP location remains the same imported
Interaction whether reached by navigation or inclusion. Static typed arguments
may be retained once the native execution model defines them.

The compatibility report must continue to distinguish complete, partial, and
unsupported conversion. Dynamic targets, unsupported argument expressions,
`EXIT`, automatic `GOTO`, mutable action-list commands such as `CLA` and
`DELACT`, and other unrepresentable control flow must keep precise diagnostics.
Recognizing a subroutine call is not sufficient reason to remove its warning.

Large-game validation, including Girl Life where legally available, must measure
diagnostic reduction, conversion time, runtime resolution, and Workbench cost.
The implementation must use id references and suitable indexes rather than
duplicating content, effects, or graph edges.

## Required design decisions before implementation

1. Define an ordered executable content representation that can interleave prose,
   inclusions, effects, and action declarations without breaking existing rich
   content.
2. Define whether inclusion arguments are part of that content node, a separate
   authored operation, or a later extension.
3. Define action identity, ordering, duplicate handling, and evaluation timing
   when actions originate from nested inclusions.
4. Define deletion behavior for referenced targets and the validation boundary
   for old or imported Stories with missing references.
5. Define depth and operation limits and whether cycles are rejected at authoring,
   validation, execution, or all three.
6. Decide the migration and compatibility strategy for persisted Stories and
   reader-progress versions.

These decisions affect the shared domain, reader semantics, persistence, API,
rich-text editor, Workbench projection, Simulation Mode, imports, and tests. They
require an ADR before implementation.

## Suggested delivery sequence

1. Model and ADR: ordered execution, reference shape, arguments, validation, and
   compatibility.
2. Native behavior: persistence, rich-text authoring, deterministic evaluation,
   nested calls, and cycle protection.
3. Workbench navigation: discreet usage marker and indexed direct callers, with
   no graph edge.
4. QSP adapter: safe static `GS`/`GOSUB` conversion and precise gap reporting.
5. Validation: unit, API, persistence, reader/Simulation replay, browser, import,
   and large-corpus performance coverage.
