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
If a session expires while the app is open, Paralleax returns to the sign-in
screen with an explanation instead of leaving an editor action in an ambiguous
error state.

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

Use **Story starts** beside it to choose the initial narrative date and time.
This is story-local time and does not change with the reader's device timezone.

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

The interaction **Content** field is a WYSIWYG editor. Its toolbar formats text,
headings, and lists, and inserts images or animated GIFs by URL. **Video**
accepts direct video URLs plus YouTube and Vimeo links. Media is referenced
externally; Paralleax does not upload or host the file yet.

1. Select an interaction block on the canvas.
2. Edit `Title` and `Content` in the inspector.
3. Set `Duration (minutes)` to define how much story time passes when it is selected.
4. Leave the field to save the change.

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

1. Select the action for the condition type you need.
2. Choose the interaction, location, character, assigned character stat, or date/time rule to check.
3. Choose its operator and, for a stat, the numeric comparison value.

Conditions can check reading history, current location, characters present in
the current interaction, compare a character stat, or filter the story-local
calendar. A date/time condition can contain several exact dates, inclusive date
ranges, weekdays, and time slots. Entries of one kind are alternatives; the
non-empty kinds must all match. A time slot ending before it starts crosses
midnight.

## Character Stats

Create a reusable definition from the collapsible **Stats** list in **Story
context**. Then open a character, choose that definition, and use **Add stat**
to assign it with an initial value. The same definition can be assigned to
several characters, with an independent value for each.

The **Locations**, **Characters**, **Stats**, and **Items** lists can be collapsed
independently. Collapse or expand the whole story context menu from the control
in its top-right corner.

Locations, characters, reusable items, and reusable stats accept an optional
image URL in their inspector. The editor previews the image and displays a
thumbnail in the context lists. Stat images are intended to work as compact
pictograms.

Select a trigger marker and use **Add stat condition** to compare the current
value with a threshold. The reader applies an interaction's effects before it
evaluates the next available interactions.

## Character Items

Create a reusable item definition from the collapsible **Items** list in
**Story context**. Item definitions currently have a name and description.

Open a character, choose a definition under **Items**, and use **Add item**.
Every addition creates a separate owned instance, so the same character can own
several copies of the same item. Items do not have stats, effects, conditions,
equipment behavior, or reader state yet.

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

Authenticated reading automatically saves progress after every selected
interaction. Returning to the same story resumes the ordered journey, including
the current interaction, story time, location, stats, and owned item instances.
The status beside the reader controls reports saving, success, or failure.

Use `Restart` to clear the reading history, delete that story's saved progress,
and start again. Author Simulation Mode is separate and never loads or changes
reader progress.
