# Glossary

This glossary keeps project vocabulary stable across product notes, code, tests,
and UI copy. Documentation uses the **canonical term** in the heading. When the
interface shows another label, it is listed under _Interface_.

Status markers: **Implemented** terms describe current behaviour (see
[Current scope](current-scope.md)). **Planned** terms describe accepted direction
that is not implemented.

## Narrative structure

### Story

A scenario that groups Interactions, their Triggers, and the Story's world
definitions (locations, characters, variables, items, calendar). Implemented.

### Interaction

A narrative moment displayed or offered to the reader: a scene, choice, action,
dialogue, video moment, or game state. Its **title** is the choice label shown to
the reader; its **content** is the rich text shown on arrival. It may carry a
location, a cast of characters, effects, and a duration. Implemented.

### Trigger

The rule that makes one output Interaction available. A Trigger belongs to
exactly one output Interaction and may have several input Interactions,
condition groups, an appearance probability, and an availability timer.
Implemented.

_Interface (FR):_ both "trigger" and "déclencheur" currently appear.

### Input Interaction

An Interaction that can lead to a Trigger's output Interaction. Several inputs on
one Trigger are alternative reachability sources; this input rule is separate
from conditions. Implemented.

### Starting Trigger

An inputless Trigger without conditions. It makes its output Interaction
available at the beginning of the Story. Also called a _root trigger_ in the
editor. Implemented.

### Contextual Trigger

An inputless Trigger with conditions. It has no previous-Interaction input, but
it can become available during reading when its conditions match. Implemented.

### Condition

An additional rule checked by a Trigger or by a conditional content frame.
Current condition types cover visited history, location, character presence,
typed variables and deterministic expressions, item ownership, and story-local
date/time. See [Trigger semantics](triggers.md). Implemented.

### Condition Group

A set of conditions owned by one Trigger. Conditions inside a group are AND;
multiple groups on that Trigger are OR. Implemented.

### Effect

A change applied when the reader selects an Interaction: set or add to a
variable, or obtain or lose an item instance. Effects are applied before the
next available Interactions are evaluated. Implemented.

### Appearance Probability

A 0 to 100 chance that an otherwise eligible Trigger exposes its option, rolled
once per Trigger and narrative step with a seeded, reproducible random number.
Implemented.

### Availability Timer

An optional number of real seconds during which an otherwise eligible Trigger
exposes its option. Implemented.

### Duration

The story time, in minutes, that passes when an Interaction is selected.
Implemented.

### Interaction Link

An inline link inside Interaction content, pointing to another Interaction by
stable id. It navigates only if the target is currently available through normal
Trigger rules. Implemented.

### Conditional Frame

A span of Interaction content shown only when its conditions match. Implemented.

### Final Interaction

An Interaction that explicitly completes the Story or play session. Planned.

## World state

### Location

A place where Interactions happen. Locations may own item instances. Implemented.

### Character

A person or creature in the Story. Characters may own variables (shown as
characteristics) and item instances, and may be present in an Interaction's
cast. Implemented.

### Playable Character

The character the reader follows: their variables and inventory are shown in the
reader. One per Story at a time. Implemented.

### Variable

A reusable typed value definition (Number, Boolean, or Text) attached to an
owner (the Story, a character, a location, or an item definition) through an
**assignment** with an initial value. Number variables may change automatically
per story hour. Implemented.

_Code and older documents:_ stat, stat definition, stat assignment.
_Interface:_ "Variables" in Story context; "Stats" / "Caractéristiques" /
"Statistiche" on characters and in the reader.

### Characteristic

A Variable attached to a character, presented as part of that character. Not a
separate model. Implemented.

### Item Definition

A reusable kind of item (a key, a lamp) with a name, description, and optional
variables. Implemented.

### Item Instance

One exact copy of an item definition, owned by a character, a location, or
another item instance (nested items). Each instance keeps independent variable
values. Implemented.

### Story Calendar

The Story's own date and time, starting from a configured moment and advanced
by Interaction durations. Independent of the reader's time zone. Implemented.

## Runtime

### Reader

The execution layer that evaluates the Story and offers available Interactions
to the person reading or testing it. Also the reading surface itself.
Implemented.

### Simulation Mode

The author-facing testing surface. It can reveal unavailable Interactions with
their diagnostics, force blocked paths, step back, and edit in place, unlike the
Reader. Implemented.

_Interface:_ "Test from start", "Test from current interaction".

### Journey

The ordered list of Interactions selected during one reading. Implemented.

Reader results are deterministic from the authored Story, the journey, the run's
random seed (for appearance probability), and the recorded start time of each
choice step (for availability timers). A save keeps all four inputs; see
[Reader semantics](reader-semantics.md).

### Play Session

A reader's progress through a Story: current Interaction, journey, runtime
values, random seed, and timer starts. Persisted as an autosave or named save
for signed-in users. Implemented.

### Save

A persisted play session: one reader autosave, one Simulation autosave, and up
to 20 named manual saves per user and Story. Implemented.

## Authoring tools

### Story Canvas

The graph view of Interactions and Trigger markers. It is a projection of the
Story model, never its canonical form. Implemented.

### Graph Edge

The editor representation of one Trigger input. A Trigger with several inputs is
shown as several edges that share its marker and Trigger id. Implemented.

### Inspector

The right-hand panel that shows and edits the selected element. Implemented.

### Story Context

The left-hand panel listing Groups, locations, characters, variables, and items,
with a shared search. Implemented.

### Group

A neutral, nestable organisation of Interactions (chapter, quest, arc). It has
no reader semantics. Each Interaction has at most one direct Group.
Implemented.

### Graph Decoration

A frame or free text placed on the canvas for readability. No reader semantics.
Implemented.

### Workbench

The planned set of projections over the Story (structure, character, location,
time, state) and the `Why unavailable?` explanation. See
[Workbench](workbench.md). Planned.

### Story Format

The documented, versioned exchange representation of authored Story data, used
for export, restore, and engine integration. See [Roadmap](roadmap.md#next).
Planned.

## Collaboration and access

### User

An account identity with a required display name. Users do not have global
author, reader, reviewer, or editor types; those are per-Story permissions.
Global roles are only User and Administrator. Implemented.

### Story Permission

A permission that applies to a user for a specific Story: reading, editing,
commenting, or managing access. Granted through visibility settings or direct
reader/editor grants. Implemented. Suggesting and reviewing changes are planned.

### Story Default Access

The access level applied when a user is not the creator and has no specific
grant: private, signed-in users, anyone with the link (unlisted), or public.
Implemented.

### Review Discussion

A threaded comment anchored to the canvas, an element, or selected text, with
replies and open/resolved state. _Interface:_ comments, post-its. Implemented.

### Annotation

Authoring metadata attached to a Story object, text range, or canvas area that
does not participate in execution. Review discussions are the implemented kind;
persistent author notes are planned. See [Annotations](annotations.md).

### Live Synchronisation

When one editor saves, other open editors of the same Story reload the
authoritative version automatically, for clients connected to the same API
process. It is not concurrent text merging. Implemented.

### Story Change Event

One recorded, reversible modification in the Story history, with its actor and
revision. Used by undo/redo. Implemented.

### Story Change Proposal

A suggested modification that may wait for approval before it affects the
canonical Story. Planned.

### Interface Internationalization

The translation of application UI copy (English, French, Italian). Story titles
and content are user-authored and never translated by this layer. Implemented.

### Story Content Localisation

Translating user-authored Story content. Not decided; see
[Open questions](open-questions.md#story-translation).

## Interface labels

Main labels in the three interface languages, for writing guides and support
answers.

| Canonical term     | English                | French                             | Italian                             |
| ------------------ | ---------------------- | ---------------------------------- | ----------------------------------- |
| Story library      | Stories                | Histoires                          | Storie                              |
| Story context      | Story context          | Contexte de l'histoire             | Contesto della storia               |
| Location           | Locations              | Lieux                              | Posizioni                           |
| Character          | Characters             | Personnages                        | Personaggi                          |
| Variable           | Variables              | Variables                          | Variabili                           |
| Characteristic     | Stats                  | Caractéristiques                   | Statistiche                         |
| Item               | Items                  | Objets                             | Articoli                            |
| Group              | Groups                 | Groupes                            | Gruppi                              |
| Playable character | Playable character     | Personnage jouable                 | Personaggio giocabile               |
| Content            | Content                | Contenu                            | Contenuto                           |
| Effect             | Add effect             | Ajouter un effet                   | Aggiungi effetto                    |
| Condition          | Add condition          | Ajouter une condition              | Aggiungi condizione                 |
| Condition group    | Add OR condition group | Ajouter un groupe de conditions OU | Aggiungi il gruppo di condizioni OR |
| Probability        | Appearance probability | Probabilité d'apparition           | Probabilità di apparizione          |
| Timer              | Availability timer     | Timer de disponibilité             | Temporizzatore di disponibilità     |
| Simulation Mode    | Test                   | Tester                             | Prova                               |
| Reader             | Read                   | Lire                               | Leggi                               |
