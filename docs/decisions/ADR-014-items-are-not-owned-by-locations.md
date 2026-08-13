# ADR-014: Items Are Not Owned by Locations

Status: Superseded by [ADR-015](ADR-015-location-owned-item-roots.md)

Date: 2026-08-09

## Context

Allowing locations to own exact item instances creates a second inventory
system. Paralleax would then need rules for discovery, visibility, pickup,
dropping, persistence, duplication, container behavior, replay, and movement of
world objects.

Those mechanics are not required for the narrative cases Paralleax currently
needs to support.

## Decision

Locations do not own item instances.

A root item belongs to a character. Items may be nested below other items
through the recursive relationship model from ADR-013.

When an object can be found or acquired in a place, this is authored through an
interaction and its conditions:

```text
Interaction: Take the kitchen key

Conditions:
- current location = Kitchen
- Key is not owned

Effects:
- obtain Key for Camille
```

The location is narrative context, not structural item ownership.

## Rationale

This avoids two competing ways to author the same behavior:

1. move a location-owned item into a character inventory;
2. use a location-conditioned interaction that grants the item.

Paralleax keeps the second, simpler model.

Recursive item nesting remains justified for bags and containers, wallets and
cards, clothing and equipment, body parts, implants and prostheses, and
composite objects.

## Consequences

- Location inspectors do not contain item trees.
- Reader state does not require a persistent world-item map.
- Item ownership stays character-centered.
- Acquisition and loss stay interaction effects.
- Importers map "item found here" to conditions and effects.
- Persistent dropped world objects are not directly modeled.

If that capability is needed later, it requires a new ADR based on concrete
story requirements rather than being implicit in the generic item graph.

## Migration

The implementation removes location roots as one forward-only change:

1. delete every existing item subtree whose root belongs to a location;
2. preserve character-rooted instances, their ids, descendants, stats, and
   exact-effect references;
3. remove location ownership from item domain and API types;
4. remove location item trees and moves to locations from the editor;
5. remove the `owner_location_id` persistence column and its supporting
   constraints, trigger branches, foreign key, and index;
6. update reader reconstruction, fixtures, tests, and imports.

Deleting the old location-rooted subtrees is intentional for this migration.
The application does not attempt to invent an interaction or target character
for those instances.

## Superseded Part of ADR-013

This ADR supersedes only the parts of ADR-013 that allowed root item instances
to belong to locations.

Recursive item graphs, typed relationships, cycle prevention, item stats,
containers, body parts, clothing, equipment, and character-owned roots remain
accepted.
