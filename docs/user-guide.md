# User Guide

This guide covers the current MVP authoring workflow.

## Open the App

Start the local stack:

```bash
npm run dev
```

Then open http://localhost:5173.

## Create a Story

1. Open the story list.
2. Select `New story`.
3. Open the story with `Edit`.

Use `Generate demo` to create a populated local demo story with roots, branches,
multi-input triggers, and simple visited / not visited conditions. This is useful
for testing the editor and reader without manually building a graph.

Stories are stored in memory during the MVP. Restarting the API resets the data.

## Edit the Story Title

Use the title field at the top of the editor. The title is saved when the field loses focus.

## Create Interactions

- `Add root` on the canvas creates a starting interaction.
- Select an interaction, then `Add child` creates an output interaction linked to it.
- Hover an interaction and use the left `+` input handle to create a source interaction.
- Hover an interaction and use the right `+` output handle to create a child interaction.
- Drag from an interaction output `+` handle and release on empty canvas to create a linked child interaction.
- Drag from an interaction input `+` handle and release on empty canvas to create a source interaction that links into it.

New root interactions are placed below the lowest existing root. Hover-created linked interactions are placed near their source or target while avoiding existing interactions when possible. Drag-created interactions are placed where the connection is released.

## Edit Interaction Content

1. Select an interaction block on the canvas.
2. Edit `Title` and `Content` in the inspector.
3. Leave the field to save the change.

The title is used as the reader choice label. The content is displayed when the reader reaches that interaction.

## Move Interactions

Drag an interaction on the canvas. Its position is saved without changing its title, content, or triggers.

## Edit Triggers

A trigger defines when an interaction becomes available.

- A trigger with no input makes its interaction available at story start.
- A linked trigger has one or more input interactions.
- Several inputs on the same trigger act as alternatives: any input can make the output interaction reachable if conditions match.

To edit a linked trigger, select the trigger marker on the edge between two
interactions.

To edit a root trigger, select the root trigger marker on the interaction.

The graph shows trigger inputs and outputs, so the inspector only edits trigger
conditions and destructive actions such as deleting the selected link.

## Add Conditions

In the trigger inspector:

1. Select `Add condition`.
2. Choose the interaction to check.
3. Choose whether it must have been visited or not visited.

MVP conditions only check reading history. Variables, places, characters, and timing are intentionally not part of the current MVP.

## Delete Trigger Links

Select a trigger marker on an edge and choose `Delete link`.

If the trigger has several inputs, only the selected input link is removed. If the selected input was the last input, the trigger remains and becomes a root trigger with no input.

The last trigger of an interaction cannot be deleted.

## Test the Story

Select `Test` from the editor to open the reader.

The reader starts with interactions that have root triggers. After each choice, it shows the interactions made available by matching trigger inputs and conditions.

Use `Restart` to clear the reading history and start again.
