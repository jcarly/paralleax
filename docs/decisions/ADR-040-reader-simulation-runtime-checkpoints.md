# ADR-040: Reader and Simulation Runtime Checkpoints

## Status

Accepted

## Context

[ADR-012](ADR-012-versioned-reader-progress-json.md) and
[ADR-022](ADR-022-reader-and-simulation-save-slots.md) make the ordered journey
the source from which saved runtime values are reconstructed. The current API
replays the journey while writing progress, and Reader and Simulation replay it
when loading a save. Simulation also replays its current journey after an
authored Story refresh.

Replaying a long journey on every save or load can repeat substantial work. It
also means that editing an effect on an already visited Interaction rewrites the
state that the author had already produced. The desired save behavior is to
resume at the saved Interaction with the saved runtime state in either mode.
Full replay remains useful as an explicit automated check that replaying a
journey yields the saved state.

## Decision

- A Reader or Simulation save is a versioned runtime checkpoint containing the
  ordered journey and the materialized state at its current Interaction.
- Loading any save restores that Interaction and checkpoint state directly in
  either mode. It copies the checkpoint into the active mode's autosave as
  specified by ADR-022 and leaves the source slot unchanged.
- Continuing from the checkpoint applies current authored Story behavior to
  subsequent Interactions. It does not reapply prior effects or recalculate
  state already represented by the checkpoint. This rule is shared by Reader
  and Simulation; effect editing has no Simulation-only revision policy.
- Simulation `Back` remains available after restoring a save and can return to
  Interactions before the saved current Interaction. It shortens the journey
  and moves the current Interaction, while preserving runtime values such as
  stats, inventory, story time, and location exactly as they are. Do not persist
  a separate runtime-state snapshot for every step. Continuing from this point
  uses the retained debug state as its base.
- Ordinary save and load operations do not replay the entire journey from its
  beginning. Full replay remains available for explicit automated validation:
  replay the journey and compare the result with the checkpoint without
  replacing or repairing the saved checkpoint.
- A new run remains deterministic from its initial state and ordered choices; a
  resumed run continues deterministically from its saved checkpoint and later
  ordered choices. A replay comparison must use the authored Story revision
  intended by the test and a replayable run without intentional debug-state
  changes. A difference after authored changes or a deliberate debug change does
  not by itself invalidate a checkpoint.

This decision settles product semantics. It does not prescribe how the API
validates and persists checkpoint values or how stale state references are
handled after authored entities change or disappear. Resolve those details
before implementation. See
[Open Questions](../open-questions.md#reader-and-simulation-saves).

## Consequences

- Reader and Simulation resume at the same saved Interaction with the same
  materialized runtime state, without replaying a potentially long prefix.
- Editing an already visited effect leaves state already produced intact; the
  current effect applies if that Interaction is reached again after the
  checkpoint.
- A journey remains available for explicit deterministic replay and diagnostics,
  but it is no longer the default restore mechanism.
- Simulation backtracking across a saved checkpoint is required without storing
  per-step runtime states; it preserves current runtime values even when they no
  longer follow from the shortened journey.
- Saves may intentionally differ from a full replay against a newer Story
  revision. Validation must distinguish authored changes from persistence
  defects.
- The current implementation does not yet meet this decision. Its replay-on-save,
  replay-on-load, and Simulation refresh behavior remain documented as current
  behavior until the checkpoint work is implemented.
