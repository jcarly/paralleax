# ADR-015: Restore Location-Owned Item Roots

Status: Accepted

Date: 2026-08-13

## Context

ADR-014 removed location-owned item instances to avoid introducing a second
inventory system without a concrete product need. A concrete authoring need now
exists: a place such as a home can own supplies, furniture, containers, and
other exact objects independently of a character inventory.

Modeling these objects only as location-conditioned character acquisition loses
their stable identity and their structural relationship with the place. It also
prevents the recursive item graph from representing persistent household or
world contents.

## Decision

Paralleax restores location-owned item roots from ADR-013.

An authored item instance has exactly one structural placement: one character
root, one location root, or one typed parent-item relationship. A location-owned
root and its complete descendant subtree are projected through `Location.items`.
Moves between characters, locations, and item containers preserve instance ids,
descendants, exact effects, and item stat identity.

Location roots are authored story state. They are not automatically part of a
reader character's owned inventory. Location-targeted runtime purchase, drop,
and transfer effects require an explicit reader-state extension and are not
introduced by this rollback.

## Persistence and Compatibility

Migration `202608090023_remove_location_item_roots` remains immutable because it
may already be deployed. A new forward-only migration reintroduces
`owner_location_id`, its same-story foreign key and index, and the single-
placement validation branches.

Location-rooted subtrees deleted by the historical migration cannot be inferred
or restored. Existing character roots, nested relationships, reader progress,
and stories without location items remain compatible.

## Consequences

- Locations and characters can both own exact root instances.
- Location inspectors expose their item tree again.
- The API accepts a same-story `locationId` as an item placement target.
- Reader replay resolves definitions and item stats through either root kind.
- Importers may preserve stable world and household item placement.
- Runtime location-targeted economy effects remain follow-up work.

## Superseded Decision

This ADR supersedes ADR-014 and restores the location-root portions of ADR-013.
