# Author Guide

_Version française : [Guide de l'auteur](author-guide.fr.md)._

This guide is for people who write Stories in Paralleax. It needs no technical
knowledge. It explains the ideas behind the editor, then walks you through a
small Story in about twenty minutes.

For every control and shortcut, see the detailed [User guide](user-guide.md).
Words in **bold** are the labels you see in the interface (English interface).

> **Alpha notice.** Paralleax is in a guided private alpha. Use test projects
> only, not work you cannot afford to lose. Your Story cannot be exported yet.

## The ideas in five minutes

**A Story is made of Interactions.** An Interaction is one moment: a scene, a
choice, a line of dialogue, an action. It has a **Title**, which the reader sees
as the choice that leads there, and a **Content**, which the reader sees on
arriving.

**Triggers decide when an Interaction becomes available.** On the graph, a
Trigger is the small marker on the arrow that enters an Interaction. A Trigger
answers two questions:

- _From where?_ Its inputs: the Interactions the reader may be on. Several inputs
  mean "from any of these".
- _Under which conditions?_ Conditions grouped together must all be true (AND).
  Several groups are alternatives (OR).

A Trigger with no input and no condition makes its Interaction available at the
start of the Story.

**The world has state.** In **Story context** (the left panel) you create
**Locations**, **Characters**, **Variables** (numbers, true/false, or text) and
**Items**. An Interaction can change that state with **effects** ("Mira obtains
the key", "Trust + 1"), and a Trigger can test it with **conditions** ("Mira owns
the key", "Trust ≥ 3", "it is night").

**Time passes.** Each Story has its own calendar. Each Interaction can take a
duration, and conditions can check the date or time of day.

**You test in Simulation, readers read in the Reader.** Simulation shows what a
reader would see and also the options that are _not_ available, with the reason.
The Reader shows only what the reader is allowed to see.

> In the interface, Variables attached to a character are shown as **Stats**.
> They are the same thing.

## Tutorial: the locked door

You will build this: the hero starts in a hall. The door is locked. Searching a
drawer gives her a key, and with the key the door opens.

### 1. Create the Story

1. Open **Stories**, select **New story**, type _The locked door_, then
   **Create story**.
2. The editor opens with two connected Interactions already created. The first
   one is selected and shown in the inspector on the right.

### 2. Write the opening scene

1. In the inspector, set the **Title** of the first Interaction to _Hall_.
2. Click **Add content** and write: _A dusty hall. A heavy door faces you, and
   there is an old desk by the wall._
3. Click outside the field. Changes are saved when you leave a field.

### 3. Create the hero and the key

1. In **Story context**, open **Characters** and create _Mira_. In her inspector,
   enable **Playable character**.
2. Open **Items**, select **Add item definition** and name it _Key_.

### 4. Add the two choices

1. Select the second Interaction (created with the Story) and title it
   _Search the desk_. Content: _In the top drawer, under old papers: a key._
2. With it selected, select **Add effect**, choose **Item inventory**, pick
   _Key_, the operation **obtain**, and _Mira_.
3. Select _Hall_ again and use **Add child**. Title the new Interaction
   _Open the door_. Content: _The key turns. The door opens onto the garden._

### 5. Lock the door

1. Select the Trigger marker on the arrow that enters _Open the door_.
2. Select **Add condition**, choose the type **Item**, and require that the
   reader owns _Key_.
3. Now let the reader reach the door after the desk too: drag from the bottom
   **+** of _Search the desk_ and drop it on the same Trigger marker. That
   Trigger now has two inputs: _Hall_ or _Search the desk_.

### 6. Test it

1. In the editor header, select the **Test from start** icon (hover the icons
   to see their names).
2. Choose _Mira_, then select _Hall_ to start. Simulation always lets you
   choose the opening scene; the Reader starts it automatically when there is
   only one.
3. In _Hall_, _Open the door_ is shown greyed out, with the reason: the key is
   missing. A reader would not see it at all.
4. Choose _Search the desk_. Mira's inventory now shows the key, and _Open the
   door_ is available. Choose it.
5. Use **Back** to step back, or **Restart** to try again. To check a blocked
   path on purpose, enable **Force unavailable options**.

You have used Interactions, Triggers with several inputs, a condition, an
effect, a character, an item, and Simulation: the core of Paralleax.

## Going further

- **Organize a large Story.** Select Interactions and press **Ctrl+G** to put
  them in a Group (a chapter, a quest). Use **Organize graph** to tidy the
  layout, and the search field in **Story context** to find text or every use of
  a character or variable.
- **Variables in the text.** In the content editor, **Add variable** inserts the
  current value of a variable, for example Mira's money.
- **Conditional text.** Part of a scene's text can appear only when conditions
  are true, without creating another Interaction.
- **Chance and pressure.** On a Trigger, **Appearance probability** makes an
  option appear only sometimes (reproducibly for a given run).
  **Availability timer** makes it disappear after a number of seconds.
- **Review with others.** Use **Place a post-it** or **Comment on this element**
  to discuss a precise part of the Story.
- **Undo.** The first two icons of the toolbar on the graph (or Ctrl+Z outside a
  text field) undo and redo your latest Story change, even after a reload.

## Sharing a Story

From the gear next to the Story title, open **Access**. A Story can be private,
open to signed-in users, readable by anyone with the link (without appearing in
the public library), or public. You can grant reader or editor rights to
specific accounts.

Readers open the Story with **Read**. Signed-in readers keep their progress;
anonymous readers do not.

## What Paralleax cannot do yet

- Export a Story. This is the next priority, see [Roadmap](roadmap.md#next).
  Sending a Story to a game engine is being evaluated.
- Merge two people's edits to the same text. When someone else saves, your
  editor reloads their change; avoid editing the same field at the same time.
- Translate Story content. The interface is available in English, French and
  Italian.
- Write a whole scene sequence as plain text. A text mode is planned.
- Host images or videos. You can insert them by URL.
- Mark a Story as finished, or publish a frozen version.

## Words used in this guide

See the [Glossary](glossary.md) for precise definitions. The most useful ones:
Story, Interaction, Trigger, Condition, Condition group, Effect, Variable, Item,
Location, Character, Playable character, Simulation Mode, Reader.
