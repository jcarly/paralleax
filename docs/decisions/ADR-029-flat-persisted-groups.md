# ADR-029: Flat Persisted Groups

Status: Accepted

Date: 2026-10-06

## Context

Authors need a first durable way to organize selected Interactions, while the
full Workbench design still leaves Group nesting, collapse, focus, navigation,
and per-author view state open.

## Decision

Persist a neutral, flat `Group` with a stable id, title, and explicitly ordered
many-to-many Interaction membership. An author creates it from at least one
selected Interaction. One Interaction may belong to several Groups.

The initial schema has no Group-to-Group relationship. Deleting an Interaction
removes its membership and leaves the Group intact, so it may become empty.
Groups are included in the authored Story change history and use the existing
Story editor authorization, persistence, invalidation, and mutation paths.

## Consequences

- Groups remain unavailable to the Reader and Simulation engine; they cannot
  affect Trigger evaluation, progress, or output.
- Graph decorations and transient rectangular selection remain separate from
  Group membership.
- Later nesting requires an explicit follow-up decision and migration, including
  its acyclicity, parent cardinality, deletion, and collaboration semantics.
