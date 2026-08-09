# ADR-013: Recursive Item Instance Graph

Status: Accepted. Location-root portions superseded by
[ADR-014](ADR-014-items-are-not-owned-by-locations.md).

Date: 2026-08-02

## Amendment (2026-08-09)

ADR-014 removes location-owned roots from the accepted model. A root item
belongs to a character, while a nested item belongs beneath another item through
a typed structural relationship. References to location roots below record the
original decision and are no longer normative. The recursive graph, typed
relationships, cycle prevention, stable instance ids, item stats, and
subtree-preserving character/container moves remain accepted.

## Context

The current authored item model separates reusable definitions from exact
instances, but every instance is stored directly under one character. This is
enough for a flat inventory and independent item stats, but it cannot represent
items placed at locations, containers, equipment, clothing, body parts,
implants, or composite objects without parallel special-purpose models.

Replacing `character_items` in one migration would put existing stories,
interaction effects, trigger conditions, and reader-progress snapshots at risk.
The target therefore needs one coherent model and an incremental compatibility
path.

## Decision

Paralleax will model concrete items as a story-local graph built from three
conceptual stores:

- `item_definitions`: reusable authoring definitions;
- `item_instances`: exact authored or runtime objects;
- `item_instance_relationships`: structural parent/child relationships between
  exact instances.

An item instance may be rooted directly at one character or one location, or it
may have one active structural parent relationship. Its effective owner and
location are inherited through its ancestor chain. Relationships target
instances, never definitions.

Supported relationship semantics will start with `contained`, `equipped`,
`attached`, `part_of`, `installed`, `worn`, and `held`. A relationship may carry
a `slotKey` and stable `sortOrder`.

Item definitions may expose functional kinds such as `object`, `body_part`,
`container`, `clothing`, `equipment`, and `implant`. Kinds guide authoring
interfaces; they do not create separate runtime models.

Body parts use the same instance and stat system. A body structure is therefore
a `part_of` tree whose nodes may expose stats and accept attached, worn, held,
or installed children. Definition-level composition templates may instantiate
such trees later, but templates are not concrete runtime relationships.

## Structural Invariants

- Every instance and both ends of every relationship belong to one story.
- An instance has exactly one structural placement: a character root, a
  location root, or one parent relationship.
- A child has at most one active structural parent.
- Self-links and ancestor cycles are rejected by the domain service and the
  persistence boundary.
- Moving a parent moves its complete descendant subtree without rewriting its
  descendants.
- Losing or transferring a container does not delete its descendants.
- Deleting an instance with descendants requires an explicit subtree policy;
  silent cascading is not an authoring operation.
- Slot compatibility and capacity are validated once definitions expose slots.
- Reader snapshots store placements and relationships by instance id so item
  stats remain independent and replay stays deterministic.

## Trigger and Effect Projection

The authoring UI should expose narrative phrases such as “Camille wears the red
dress” or “the key is in the backpack”. These compile to structural predicates
over definition ids, instance ancestry, relationship type, slot, effective
owner, and item stats. Authors should not need to manipulate graph payloads for
common conditions.

Interaction effects move an existing subtree or create an instance at a root or
under a parent. Obtain and lose remain compatibility shortcuts for root
placement changes until existing stories have migrated.

## Migration Sequence

Steps 1 through 3 and the tree-authoring portion of step 4 are implemented. PostgreSQL now
uses `item_instances`, existing ids and character ownership are copied, location
roots are structurally valid, exact item effects reference the new table, and
the API continues to project character roots through `Character.items`. The
legacy rows remain archived as `character_items_legacy` until parity gates allow
their removal. Typed parent relationships, cycle-safe subtree moves between
characters, locations, and containers are available, alongside a shared tree
editor in character and location inspectors. Reader relationship state and
relationship-aware interaction effects remain later increments.

1. Introduce `item_instances` and copy every `character_items` row while
   preserving ids, story ids, definitions, owners, and order.
2. Point exact-instance effects and stat values at `item_instances`; keep API
   compatibility projections for `Character.items` during the transition.
3. Add location roots and structural relationships with same-story, single
   placement, and cycle validation.
4. Add tree authoring and move effects, then persist relationship state in
   versioned reader progress.
5. Add relationship-aware trigger conditions and simple narrative presets.
6. Add definition kinds, slots, capacities, and optional composition templates.
7. Remove the archived `character_items_legacy` table only after migration tests
   prove complete parity and no supported client depends on the compatibility
   projection.

Each database migration is forward-only and preserves existing ids. Migration
execution stays outside request paths.

## Consequences

One engine can represent inventories, nested containers, clothing, body parts,
prostheses, vehicles, and composite equipment. The cost is stronger graph
validation, more explicit deletion semantics, and a tree-focused editor. The
flat inventory remains the default authoring experience until an author opts
into structure.
