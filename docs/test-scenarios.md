# MVP Test Scenarios

## Goal

Cover the critical MVP paths: Story, Interaction, Trigger, and Reader.

## Unit / Component Tests

- Shared: story operations delete only the intended trigger and preserve valid inputs.
- Shared: stale server merges cannot restore locally deleted triggers.
- Shared/API/Web: demo story generation creates roots, branches, multi-input triggers, and conditions.
- Shared: child placement selects a non-overlapping output position.
- Shared: root and parent placement select non-overlapping graph positions.
- Editor: editing an interaction title keeps the page visible and updates the block.
- Editor: moving an interaction saves only the position without clearing the title or body.
- Editor: moving an interaction does not delete titles or content from other interactions.
- Editor: creating an output from an interaction takes existing outputs into account and avoids overlap.
- Editor: hover action buttons create linked child and source interactions.
- Editor: dropping a source connection on empty canvas creates a linked child interaction at the drop position.
- Editor: dropping a target connection on empty canvas creates a source interaction linked to the target at the drop position.
- Editor: selecting an interaction without a trigger shows a controlled error state instead of a blank page.
- Editor: a trigger can accept several input interactions.
- Editor: selecting a graph edge opens the trigger editor for that edge.
- Editor: selecting a graph edge visibly highlights that edge.
- Editor: deleting a trigger removes its edge and a later interaction move must not restore it from stale API data.
- Editor: deleting a trigger link and then creating another link must not restore the deleted link from stale API data.
- Editor: deleting one edge removes only that input link and keeps the trigger as a root trigger when no inputs remain.
- Editor/API: the last trigger of an interaction cannot be deleted.
- Editor: creating a new canvas connection creates a dedicated trigger and does not mutate existing linked triggers.
- Editor: deleting an interaction removes triggers that output to it.
- Editor: deleting an interaction removes it from trigger inputs and turns orphaned triggers into root triggers.
- Reader engine: an interaction without input is available at startup.
- Reader engine: an interaction with input is only available after the source interaction.
- Reader engine: visited / not visited conditions filter choices correctly.

## Playwright Functional Tests

- Editor: open a story, select an interaction, rename its title, and verify that the canvas and inspector stay visible.
- Editor: move an interaction and verify that title and content remain visible after saving.
- Editor: edit root trigger path conditions from the interaction inspector.
- Editor: create a root interaction and verify that it appears on the canvas.
- Editor: create a child interaction from the selected interaction, then verify the trigger input link and absence of overlap with other outputs.
- Editor: configure several inputs on the same trigger and verify that all inputs remain checked.
- Editor: click an edge, edit its conditions, close the editor, and verify that the edge remains attached to the same trigger.
- Editor: delete an interaction and verify that invalid trigger links are removed from the canvas.
- Reader: open a story, choose a starting interaction, and verify the following choices.
- Reader: restart resets history and choices to the initial state.

## Current Priority

1. Title editing stability.
2. Interaction movement stability.
3. Automatic output placement.
4. Triggers with several inputs.
5. Trigger editing from graph edges.
6. Precise trigger link creation and deletion.
7. Direct graph creation from connection gestures.
8. Trigger deletion and stale-save stability.
9. Trigger cleanup when deleting interactions.
10. Reader non-regression.
