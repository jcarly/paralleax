# Design System

This document is the future home of Paralleax visual identity and reusable UI
rules.

The MVP does not need a complete design system before the narrative core is
validated, but the editor already needs enough visual consistency to make graph
authoring feel deliberate and readable.

## Goals

- Make the interface calm, author-focused, and usable for long editing sessions.
- Keep the Story Canvas readable at a glance.
- Use color to clarify meaning, not decoration.
- Keep controls familiar and close to the object they affect.
- Make interaction, trigger, link, hover, selection, disabled, and error states
  consistent across the app.

## Mockups

Static UX mockups live in [docs/mockups](mockups/README.md).

The first reference is [Story Canvas mockups](mockups/story-canvas.html), which
covers compact graph density, trigger routing, the inspector, and author
simulation.

## Visual Identity To Define

The project still needs a visual identity pass covering:

- color palette;
- typography;
- spacing scale;
- border radius and elevation;
- icon usage;
- graph background treatment;
- interaction node style;
- trigger marker style;
- edge and arrow style;
- inspector and panel style;
- reader style;
- empty, loading, disabled, error, and selected states.

## Canvas-Specific Rules

The Story Canvas should use a denser, more practical visual language than a
marketing page.

Guidelines:

- interactions should be compact cards, not large feature panels;
- trigger markers should be visible but secondary to interactions;
- graph edges should be readable and restrained;
- hover controls should reveal useful actions without making the canvas noisy;
- selected elements should use a consistent primary accent;
- destructive controls should remain visually distinct and require deliberate
  targeting.

## Open Decisions

- Choose the primary accent color and semantic colors.
- Decide whether interaction types eventually receive color coding.
- Define how conditions, timing, probability, and automatic choices are hinted on
  links later.
- Decide whether the graph background should stay neutral or carry a subtle
  authoring-grid identity.
- Decide whether to adopt Tailwind CSS or keep plain CSS plus design tokens for
  the next iteration.

## Relationship With Implementation

The current app uses plain CSS and custom properties.

The next implementation step should first extract reusable tokens and stabilize
the canvas rules. A larger framework decision, such as Tailwind CSS, should come
after the Story Canvas behavior is clearer.
