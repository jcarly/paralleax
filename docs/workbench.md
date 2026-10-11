# Workbench Product Direction

Status: product direction. This document does not describe implemented behavior
unless it is also listed in [Current scope](current-scope.md).

## Product Promise

Paralleax should let authors create, understand, and test visually complex
interactive narrative worlds without losing their mental map of the whole Story.

The product is not differentiated merely by the number of narrative concepts it
supports. Its central promise is to keep those concepts fluid to manipulate and
clear to understand as a Story grows from a few interactions to several hundred.

Paralleax does not remove narrative complexity. It removes unnecessary difficulty
from understanding and controlling that complexity.

## Workbench Mental Model

The Workbench is not only a canvas containing every Interaction and Trigger. It is
a configurable visual projection of the authored narrative world.

The complete graph remains available, but it is one projection among several. An
author should be able to ask the Workbench questions such as:

- What is the overall structure of this Story?
- What can this character experience as an actor or spectator?
- What happens in this location or during this period?
- What reads or changes this piece of state?
- What depends on this event?
- Why is this Interaction unavailable?
- What could make its missing conditions become true?

The Workbench should answer those questions without duplicating the canonical
Story or creating separate editors for each perspective.

## Product Principles

### Progressive complexity

A simple Story should remain simple to author. Advanced controls should appear
when their concepts are used or when the author asks for more detail. Power must
not require every control and expression to remain visible at once.

### Preserve global orientation

Filtering should preserve the author's spatial memory by default. A projection
uses three visual levels:

- **Focused**: directly relevant elements;
- **Context**: neighboring or explanatory elements needed to understand them;
- **Background**: the rest of the graph, strongly attenuated.

An explicit `Hide unrelated` option may remove background elements when desired.

### One model, several projections

Structure, character, location, time, and state views consume the same authored
Story. A view is a filter, focus, optional coloring rule, and optional layout hint;
it is not another source of truth.

### Make logic visible without making it noisy

Cards and connections should expose lightweight, filterable markers when logic is
present: conditions, effects, Triggers, timers, temporal ranges, probability,
character state, required items, locations, or relationships. The graph indicates
that logic exists; hover, focus, or selection reveals its details.

## Planned Workbench Views

### Structure

The improved complete-Story projection. It presents the overall narrative
structure and remains the stable orientation point for every other view.

### Character

Focus one character and distinguish:

- Interactions where it participates;
- future actor and spectator roles;
- Triggers relevant to those Interactions;
- effects that change its state, inventory, or relationships;
- nearby Interactions required to understand its possible route.

A character route is derived from the Story. It is not a persisted `Path`,
`Route`, or `Parcours` entity.

### Location

Focus Interactions available in a place, the characters involved, relevant
incoming and outgoing Triggers, and changes of location.

### Time

Project Interactions by date, day, time, range, or temporal event. This view may
eventually use a timeline rather than the ordinary graph layout while consuming
the same authored data.

### State

Search for one stable state target and show what reads it, writes it, or depends
on it. Examples include a relationship, a character state, or a world flag. This
view is a primary debugging surface rather than a second variable editor.

## Selection and Organization

### Planned selection behavior

- Click selects one element.
- `Ctrl` + click toggles an element in the selection.
- `Shift` + drag adds the rectangle to the selection.
- `Alt` + drag removes the rectangle from the selection.
- `Ctrl+A` selects the currently visible graph projection.
- `Ctrl+G` creates a Group from the selected Interactions and Groups.
- A context action can create the same Group.

Selecting a Group should make its member Interactions and relevant incoming
Triggers available for emphasis, focus, layout, and later inspection.

### Groups

A Group is neutral authoring and navigation metadata. It can represent a chapter,
quest, arc, scene sequence, work package, or any author-defined organization. It
has no reader or runtime semantics.

The target behavior is:

- a Group may be empty;
- a Group may include Interactions and nested Groups;
- an Interaction may belong to several Groups at the same time;
- membership is explicit and never inferred from visual overlap;
- removing a Group never removes an Interaction;
- Group nesting must not contain cycles;
- Graph Decorations remain independent presentation metadata and never become
  Groups because they surround the same cards visually.

Multiple membership is intentional. The same Interaction may simultaneously
belong to a chapter, a character arc, a location-oriented organization, and a
production work package.

Collapse, expansion, visibility, colors, nesting cardinality, and persistence of
per-author view state require a focused implementation contract before coding.
In particular, collapsing one Group must not destructively hide an Interaction
that remains relevant through another Group or through the complete Story view.

### Connected path selection

From an Interaction, the author should be able to select:

- descendants;
- ancestors;
- both directions;
- a path until convergence;
- the derived route of a character.

This creates a selection, not a Group. The author may then create a Group
explicitly if the selection represents a durable organization.

## Focus and Dependencies

`Focus` is a generic Workbench operation available for Interactions, Triggers,
characters, locations, state targets, and later Groups.

An Interaction focus may show predecessors, successors, incoming and outgoing
Triggers, conditions, and effects at one level, two levels, or across the whole
reachable path. Character and state focus use the same projection mechanism with
domain-specific relevance rules.

## Visual Debugging

The Workbench should eventually explain why an Interaction cannot occur. A
diagnostic should show each applicable Trigger and condition, the current value,
and the first or complete set of failures. From a failed state condition, the
author should be able to navigate to Interactions capable of changing that state.

This explanation extends the deterministic Trigger diagnostics already used by
Simulation Mode. It must not introduce another condition evaluator in the web UI.

## Workbench and Simulation

Simulation and the Workbench should progressively converge. During a simulated
run, the Workbench should be able to project:

- the current position in the narrative world;
- available and unavailable Interactions;
- reasons for unavailability;
- active Triggers and timers;
- recent changes of state;
- alternate paths the author wants to explore.

Simulation remains runtime state derived from the authored Story and journey.
Workbench presentation never becomes canonical reader state.

## Planned Projection Architecture

Do not implement `CharacterView`, `LocationView`, `StateView`, and `TimeView` as
independent editors with duplicated filtering and layout rules. Prefer one generic
query/projection layer, conceptually a `WorkbenchQuery`, that consumes the
canonical Story and produces stable identifiers classified as:

- primary nodes and edges;
- contextual nodes and edges;
- background treatment;
- logic markers;
- layout hints.

This direction should allow criteria to be combined later, for example a
character within one location during one day, without rewriting the Workbench.
The exact persisted and web contracts require an ADR before implementation.

## Delivery Order

### Phase 1 — Manipulate

- additive and subtractive multi-selection;
- connected-path selection;
- explicit Groups with multiple Interaction membership;
- nested Group navigation;
- collapse, expand, show, hide, and focus behavior;
- a Groups section in the left navigation;
- measured layout improvements for grouped and selected content.

### Phase 2 — Read

- lightweight logic markers;
- filters and projection controls;
- Interaction, character, and location focus;
- Focused / Context / Background presentation.

### Phase 3 — Understand

- state read/write dependencies;
- derived character routes;
- Interaction impact;
- State and Time views.

### Phase 4 — Explain

- `Why unavailable?` diagnostics in the Workbench;
- condition chains and current values;
- navigation to possible causes and satisfying effects.

### Phase 5 — Simulate

- live world state on the Workbench;
- active Triggers and available events;
- effect history and alternate-scenario exploration.

Each phase should improve the existing product independently. Do not postpone all
value until the complete projection system exists.

## Near-Term Non-Priorities

Before the Workbench direction is validated, do not prioritize features merely
because another editor has them. In particular, new node types, substantially
more scripting, cosmetic publishing layouts, additional publication channels,
word-processor features, or unvalidated narrative modes should not displace work
that makes existing narrative concepts easier to manipulate, understand, or test.

## Product Test

Use a representative Story with roughly 300–600 Interactions, such as Bellecume
Life or an equivalent fixture. A successful Workbench should let an author who
does not know the project:

1. understand its main parts;
2. isolate a character and follow its possible route;
3. see where its decisions have effects;
4. inspect the conditions of one event;
5. navigate from a failed condition to possible causes;
6. simulate the result;
7. return immediately to the complete Story structure.

The core product question for every Workbench feature is:

> Does this help the author manipulate, understand, or test the narrative world?

If the answer is no, the feature is unlikely to be a current priority.
