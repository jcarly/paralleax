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

## Choose the Interface Language

Use the language selector on the sign-in screen or in the authenticated header
to switch between English and French. Paralleax initially follows a supported
browser language and remembers an explicit selection in that browser. English
is used when the detected language is unsupported or a translation is missing.

This setting changes only the Paralleax interface: labels, actions, statuses,
accessibility text, and condition explanations. Story titles, interaction
content, and authored names and descriptions remain in the language in which
the author wrote them.

## Create a Story

1. Open the story list.
2. Select `New story`.
3. Enter a title and select `Create story`.
4. Open the story with `Edit`.

Use the library search, `Recently edited` / `Empty` filters, title or last-edited
sorting, and the grid/list controls to find stories without changing their
stored content.

Use `Generate demo` to create a populated local demo story with roots, branches,
multi-input triggers, and simple visited / not visited conditions. This is useful
for testing the editor and reader without manually building a graph.

Stories are persisted in PostgreSQL. Restarting the API keeps the
authored story data as long as the configured database or Docker volume remains
available.

## Consult the Design System

Select `Design system` in the main navigation or open
http://localhost:5173/design-system while signed in. This living reference
documents the product foundations, controls, forms, navigation rows, narrative
cards, empty trigger marker, effect layout, and feedback states used by the
application.

## Edit the Story Title

Use the title field at the top of the editor. The title is saved when the field loses focus.

Use **Story starts** beside it to choose the initial narrative date and time.
This is story-local time and does not change with the reader's device timezone.

The editor toolbar reports whether a save is pending, complete, or failed. If a
save is pending or failed, closing/reloading the browser or following an
internal application link asks for confirmation before discarding the local
state. Use the retry action after a failed save when you want to reload the last
persisted story.

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

The character indicator below the editor measures the stored HTML. It warns in
the final 10% of the 64,000-character allowance and reports when content is over
the limit and cannot be saved.

Use the link icon labelled **Add conditional text** to choose an interaction
connected by an outgoing trigger and insert an editable conditional frame. The
frame follows that trigger's conditions automatically. Removing the graph
connection keeps the authored text in the editor but hides it from players.
Simulation Mode still shows unavailable frames with reduced opacity and a reason.

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

Open any location, character, reusable stat, or reusable item and fill in
**Category** to organize it. The field suggests categories already used for the
same entity type, while still accepting a new name. The four context lists group
their rows by category and place entries without a category under
**Uncategorized**.

Use the search field at the top of **Story context** to filter all four lists by
entity name or category and find matching text in interaction titles and bodies. Each matching graph
card shows its number of text occurrences beside the title. The arrow buttons
move cyclically through matching interactions and center the selected card.

Selecting a location, character, stat, or item changes the same arrows to move
through interactions that reference that entity, including trigger conditions
and effects. Selecting a location or character also lowers the opacity of
unrelated interaction cards. The graph controls allow zooming out to 5% for
large stories.

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
several copies of the same item.

Locations may own exact item instances and nested item trees. Their inspector
shows the items rooted there; item placement can move a complete subtree between
a character, a location, or another item without changing its instance ids.
Location roots are authored world state and are not automatically part of a
reader character's inventory.

In an interaction inspector, use **Add item effect** to select one exact item
instance and choose **obtain** or **lose**. If a character has several copies,
the editor numbers them so the intended copy is explicit. The reader displays
the resulting inventory and saves it with progress. Items do not have trigger
conditions or equipment behavior yet.

### Item stats

Open an item definition and use **Add stat** to assign any reusable story stat
with an initial value. Every copy of that item starts from the definition value
but evolves independently during reading.

Open an interaction and use **Add item stat effect** to select one exact item
copy and one of its assigned stats. The effect can add a value or set the value
directly. The player inventory displays the current values for owned items.

### Item effects and conditions

Open an interaction and use **Add item effect** to obtain or lose any reusable
item definition in the story. The item does not need to be preassigned to a
character. Select the character who obtains or loses it. Repeating an obtain
effect creates another copy for that character; a lose effect removes one copy
owned by the selected character.

In the trigger editor, use **Add item condition** to require that the reader
owns, or does not own, at least one copy of an item definition.

In a character inspector, use the `x` button beside an assigned stat or item to
remove it. Removing an assignment also cleans interaction effects and conditions
that referenced that exact character stat or item instance.

Enable **Playable character** in a character inspector to make that character
the story protagonist. The current version supports one playable character; a
new selection replaces the previous one.

At the start of reading, select the playable character card. The reader then
shows that character's image, current stats, and inventory on the left. Other
characters present in the current interaction appear as encounter cards on the
right.

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

Select `Read` from the story library to open the player reader. Select `Test`
from the editor to open author Simulation Mode, either from the beginning or
from the currently selected interaction.

The reader starts with interactions that have root triggers. After each choice,
it shows the interactions made available by matching trigger inputs and
conditions. The scene header shows the current location, story time, and present
characters. When the story has a playable character, the left character sheet
shows that character's stats and inventory; the right panel shows the
other characters present in the current interaction.

The reader presents the options currently available to the player. Simulation
Mode additionally keeps unavailable options visible with reduced opacity and
their condition diagnostics. Enable **Force unavailable options** in the author
tools to test a blocked path deliberately; disabling the control restores normal
condition enforcement.

Authenticated reading automatically saves progress after every selected
interaction. Returning to the same story resumes the ordered journey, including
the current interaction, story time, location, stats, and owned item instances.
The status beside the reader controls reports saving, success, or failure.

Use `Restart` to clear the reading history, delete that story's saved progress,
and start again. Author Simulation Mode is separate and never loads or changes
reader progress. Simulation also provides `Back`, inline interaction editing,
and option creation without changing the reader's saved journey.

### Time-based stat changes

Open a stat from the **Stats** section and set **Change per story hour**. Use a
positive value for growth, a negative value for decay, or `0` to disable the
automatic change. The rate applies to every character using that reusable stat
and is prorated over each interaction's duration.
