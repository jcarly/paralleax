# MVP Test Scenarios

## Goal

Cover the critical MVP paths: Story, Interaction, Trigger, and Reader.

## Unit / Component Tests

- Shared: story operations delete only the intended trigger and preserve valid inputs.
- Shared: stale server merges cannot restore locally deleted triggers.
- Shared/API/Web: demo story generation creates roots, branches, multi-input triggers, and conditions.
- API: database migrations create schema state and skip already-applied
  migrations.
- API: story repository stores, reads, lists, and deletes persisted PostgreSQL
  story documents.
- Shared: child placement selects a non-overlapping vertical output position.
- Shared: root and parent placement select non-overlapping graph positions.
- Editor: editing an interaction title keeps the page visible and updates the block.
- Editor: rapid title and content edits are persisted in order so reopening the
  story keeps both values.
- Editor: moving an interaction saves only the position without clearing the title or body.
- API: updating only an interaction position keeps its persisted title and body.
- API: interaction PATCH requests reject null titles, null positions, and unknown
  fields, while a null body is persisted as an empty string.
- API/PostgreSQL: persisted story documents require story and interaction titles,
  interaction bodies, and numeric interaction positions.
- Editor: moving an interaction does not delete titles or content from other interactions.
- Editor graph mapping: interactions loaded without stored canvas positions use
  stable fallback coordinates instead of blanking the Story Canvas.
- Editor: creating an output from an interaction takes existing outputs into account and avoids overlap.
- Editor: hover action buttons create linked child and source interactions.
- Editor: interaction input and output controls also act as graph connection handles.
- Editor: dropping a source connection on empty canvas creates a linked child interaction at the drop position.
- Editor: dropping a target connection on empty canvas creates a source interaction linked to the target at the drop position.
- Editor: selecting an interaction without a trigger shows a controlled error state instead of a blank page.
- Editor: a trigger can accept several input interactions.
- Editor: trigger markers are visible on linked edges and on root interactions.
- Editor: vertical and horizontal trigger links use matching source and target
  sides so output arrows meet interactions with the correct orientation.
- Playwright: moving an interaction across its trigger reverses the output
  arrow's final horizontal direction and keeps it aligned with the target side.
- Editor/Reader: when an interaction is selected, the test action starts the
  reader from that interaction.
- Editor: selecting a linked trigger marker opens the trigger editor for that trigger.
- Editor: selecting a root trigger marker opens root trigger conditions without mixing them into interaction content editing.
- Editor: the inspector is hidden until an interaction or trigger is selected, and closing it or clicking the canvas background clears the selection.
- Editor: selecting a trigger marker visibly highlights that marker.
- Editor: deleting a trigger input link removes its edge and a later interaction
  move must not restore it from stale API data.
- Editor: deleting a trigger link and then creating another link must not restore the deleted link from stale API data.
- Editor: deleting one trigger input link removes only that input and keeps the
  trigger as a root trigger when no inputs remain.
- Editor/API: deleting the last trigger of an interaction turns it into a root
  trigger.
- Editor: creating a new canvas connection creates a dedicated trigger and does not mutate existing linked triggers.
- Editor: when connecting to an interaction with existing triggers, the author can choose whether to add the source as an input of an existing trigger or create a new trigger.
- Editor: dropping a connection on an existing trigger marker adds the source as
  another input of that trigger.
- Editor: dropping a connection on the empty interaction input handle creates a
  new trigger for that output interaction.
- Editor: adding a source to an existing trigger keeps the trigger conditions shared by all of its inputs.
- Editor/Reader: several triggers between the same interactions represent OR
  condition groups, show as one grouped route in the editor, and expose their
  OR variants in the trigger inspector.
- Editor: adding an OR condition group from the trigger inspector creates a new
  trigger with the same inputs behind the grouped visual route.
- Editor: the trigger inspector can delete one OR condition group or every OR
  group behind the selected visual route.
- Editor: deleting every OR group behind one visual route does not delete
  triggers that use a different input set for the same output interaction.
- Editor: root triggers cannot create OR condition groups because they are not
  linked visual routes.
- Editor: deleting a grouped visual trigger input link removes that input from
  every OR trigger variant behind the grouped route.
- Editor graph mapping: OR trigger variants are grouped only when they share the
  exact same input set, regardless of input order.
- Reader engine: an inputless trigger without conditions is available only at
  story start.
- Reader engine: an inputless trigger with conditions can become available during
  reading.
- Editor: deleting an interaction removes triggers that output to it.
- Editor: deleting an interaction removes it from trigger inputs and turns orphaned triggers into root triggers.
- Reader engine: an interaction without input is available at startup.
- Reader engine: an interaction with input is only available after the source interaction.
- Reader engine: visited / not visited conditions filter choices correctly.
- Simulation: the editor test action opens Simulation Mode instead of the player
  reader.
- Simulation: interactions reachable by trigger input logic are listed,
  condition-blocked interactions are dimmed, and selecting one forces it for the
  current simulation journey.
- Simulation: condition-blocked interactions explain the first failed visited /
  not visited condition.
- Simulation: authors can step back to the previous interaction in the current
  simulation journey.
- Simulation: authors can edit the current interaction title and content inline
  without opening the graph inspector.
- Simulation: authors can add a root option before selecting any interaction,
  edit the new option title immediately, and see the action below existing
  options.
- Simulation: authors can add an option from the current interaction, edit the
  new option title immediately, and open that option from the simulation choices.
- Simulation: authors can add an option from a newly created option even if the
  parent option has no stored canvas position yet.
- Simulation: root and output options created from simulation receive graph
  positions compatible with returning to the Story Canvas.

## Playwright Functional Tests

- Editor: open a story, select an interaction, rename its title, and verify that the canvas and inspector stay visible.
- Editor: move an interaction and verify that title and content remain visible after saving.
- Editor: edit root trigger path conditions from the root trigger marker.
- Editor: create a root interaction and verify that it appears on the canvas.
- Editor: create a child interaction from the selected interaction, then verify the trigger input link and absence of overlap with other outputs.
- Editor: configure several inputs on the same trigger and verify that graph links share the trigger marker.
- Editor: click a trigger marker, edit its conditions, close the editor, and
  verify that the marker remains attached to the same trigger.
- Editor: delete an interaction and verify that invalid trigger links are removed from the canvas.
- Reader: open a story, choose a starting interaction, and verify the following choices.
- Reader: restart resets history and choices to the initial state.

## Current Priority

1. Title editing stability.
2. Interaction movement stability.
3. Automatic output placement.
4. Triggers with several inputs.
5. Connection UX for choosing existing trigger inputs or new triggers.
6. Contextual inputless triggers.
7. OR condition groups through several triggers between the same interactions.
8. Trigger editing from graph markers.
9. Precise trigger link creation and deletion.
10. Direct graph creation from connection gestures.
11. Trigger deletion and stale-save stability.
12. Trigger cleanup when deleting interactions.
13. Reader non-regression.
