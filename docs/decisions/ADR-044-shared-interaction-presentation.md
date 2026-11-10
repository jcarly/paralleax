# ADR-044: Shared Interaction Presentation Across Authoring and Reading Views

## Status

Accepted

## Date

2026-11-08

## Context

Interaction information is currently arranged differently in the Story Canvas,
Interaction Inspector, Simulation, and Reader. This makes the authored option
label, current scene context, narrative body, and authored effects harder to
recognize as parts of the same Interaction. The product should use one ordered
presentation while retaining each view's purpose and existing runtime behavior.

The Inspector has historically avoided repeating graph relationships. Authors
have now requested an outgoing destination list there, together with a direct
action to add an option. The list is a derived authoring projection, not a new
route model.

## Decision

- Present an Interaction in this order: its option label (`Interaction.title`),
  location and present characters, narrative content, then effects where the
  view supports them. Do not introduce a separate Interaction heading for the
  option label.
- Keep the graph card compact. Show the option label in an integrated bubble
  with a subtle direction arrow, then pictogram-marked location and cast, a
  narrative excerpt of at most two lines, and effect indicators. Keep Trigger
  entities distinct; do not show option counts or artificial ids.
- Make authored values readable by default in the Inspector and reveal editing
  affordances on hover or keyboard focus. Selecting a value opens its existing
  editor. Replace the visible context-and-timing section heading and category
  labels with location, character, and clock pictograms while keeping the values
  readable and the controls accessibly named. Group the option label, context,
  and narrative in one quiet presentation card. Editing controls retain their
  field labels. Reuse the existing effect editor and add effects through it.
- Show the Inspector's outgoing options as one row per unique destination
  Interaction, ordered by the Story's Interaction order. Multiple Triggers to
  the same destination do not duplicate that row. Keep Trigger inputs,
  conditions, and individual route editing on the graph and Trigger inspector.
  The Inspector's add-option action calls the canonical child Interaction
  creation path so that the destination and Trigger are created together.
- Simulation and Reader share the Interaction presentation order and narrative
  typography. Simulation keeps effect presentation, diagnostics, and authoring
  tools. Reader hides effects and author-only tools, and keeps its existing
  availability and timer behavior. Both use the same location, cast, and
  story-time pictograms with their values.
- Reader keeps hiding unavailable conditional text. Simulation keeps showing
  unavailable conditional text with its diagnostic. This is an intentional
  diagnostic difference inside the shared narrative presentation.
- Preserve the canonical Story model and existing runtime operations. This
  presentation change requires no API or persistence schema change.

## Consequences

- Authors and readers can recognize the same option label, context, and story
  content across the four surfaces. Category pictograms remove repeated labels
  without hiding authored values from sighted users or assistive technology.
- The Inspector repeats only the derived destination list needed for its add
  action; it does not become a second Trigger editor or expose route variants
  as duplicate destinations.
- Reader title presentation changes visibly. Existing stories and saved reader
  progress remain compatible because `Interaction.title` is already canonical.
- Conditional-text visibility continues to differ only where Simulation needs
  to explain unavailable content.
