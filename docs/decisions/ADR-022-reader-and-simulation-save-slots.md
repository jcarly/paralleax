# ADR-022: Reader and Simulation Save Slots

## Status

Accepted

## Context

ADR-012 introduced one versioned reader-progress snapshot per authenticated user
and story and deliberately kept author Simulation Mode out of that persistence
flow. The product now needs normal reader autosave, independently resumable author
simulation, and named situations that can move between reading and simulation for
debugging. Reusing the existing progress state and deterministic replay avoids a
parallel simulation-state model.

## Decision

Extend `story_reader_progress` from one row per user/story to one row per
user/story/slot. Keep the existing versioned JSONB state and add relational slot
metadata.

Reserve `reader-autosave` and `simulation-autosave` for the two automatic flows.
Each authenticated user may also create up to 20 UUID-identified manual slots
with names of at most 100 characters. Manual saves and both autosaves are listed
and loadable from either mode, but the Simulation Mode autosave endpoint requires
effective story edit permission.

Normal navigation writes only the active mode's autosave. Loading any slot replays
its journey against the current authored Story, then copies the resulting state
to the active mode's autosave. It never mutates the source slot. Restart deletes
only the active autosave. Existing pre-migration progress becomes the reader
autosave.

The API continues to treat the ordered journey as authoritative, validates
same-story references, and reconstructs materialized runtime state before every
write. Saves are user runtime data and remain separate from authored Story state.

## Consequences

- Reader and author testing can resume independently without duplicating runtime
  semantics or persistence tables.
- An author can load a reader or named save into Simulation Mode for debugging,
  while subsequent test navigation remains isolated in the simulation autosave.
- Manual saves survive restart and source slots survive cross-mode loading until
  explicitly overwritten or deleted.
- Story changes can make stored references stale; deterministic reconciliation on
  load remains the compatibility rule rather than binding saves to an immutable
  story revision.
- Anonymous and offline saves remain out of scope.
