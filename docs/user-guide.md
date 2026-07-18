# User Guide

This guide covers the current MVP authoring workflow.

## Open the App

Start the local stack:

```bash
npm run dev
```

Then open http://localhost:5173.

On first use, select `Create account` and register with an email address and a
password of at least eight characters. Later visits restore the session from an
HTTP-only cookie. Use `Sign out` in the header to end the current session.

Stories are private to the account that creates them. Another account cannot
list, open, edit, or delete them.

## Create a Story

1. Open the story list.
2. Select `New story`.
3. Open the story with `Edit`.

Use `Generate demo` to create a populated local demo story with roots, branches,
multi-input triggers, and simple visited / not visited conditions. This is useful
for testing the editor and reader without manually building a graph.

Stories are persisted in PostgreSQL. Restarting the API keeps the
authored story data as long as the configured database or Docker volume remains
available.

## Edit the Story Title

Use the title field at the top of the editor. The title is saved when the field loses focus.

## Create Interactions

- `Add root` on the canvas creates a starting interaction.
- Select an interaction, then `Add child` creates an output interaction linked to it.
- Use the visible top `+` input handle to create a source interaction.
- Use the visible bottom `+` output handle to create a child interaction.
- Drag from an interaction output `+` handle and release on empty canvas to create a linked child interaction.
- Drag from an interaction input `+` handle and release on empty canvas to create a source interaction that links into it.

New root interactions are placed below the lowest existing root. Button-created
child interactions are placed below their source by default, while
button-created source interactions are placed above their target. These default
placements avoid existing interactions when possible. Drag-created interactions
are placed where the connection is released.

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
conditions and trigger-level actions.

## Add Conditions

In the trigger inspector:

1. Select `Add condition`.
2. Choose the interaction to check.
3. Choose whether it must have been visited or not visited.

MVP conditions only check reading history. Variables, places, characters, and timing are intentionally not part of the current MVP.

## Delete Trigger Links

Use the `x` control that appears on the link between an input interaction and
the trigger marker.

If the trigger has several inputs, only that input link is removed. If the link
was the last input, the trigger remains and becomes a root trigger with no input.

Deleting the last trigger of an interaction also keeps the trigger and converts
it into a root trigger. This keeps the interface simple: the author can delete
links and triggers without first reasoning about whether the interaction would be
left without an availability rule.

## Test the Story

Select `Test` from the editor to open the reader.

The reader starts with interactions that have root triggers. After each choice, it shows the interactions made available by matching trigger inputs and conditions.

Use `Restart` to clear the reading history and start again.
