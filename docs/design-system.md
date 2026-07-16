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
- Make the interface feel warm and creative without becoming playful or noisy.

## Creative Workspace Direction

Paralleax should feel like a creative workspace rather than an IDE, a game
editor, or a technical graph tool.

Reference qualities:

- Figma-like restraint;
- FigJam-like approachability;
- Notion-like readability;
- Milanote-like organization;
- Arc-like polish;
- Apple-like simplicity.

The desired feeling is a living author's workspace: calm, bright, welcoming, and
comfortable enough for several hours of writing. It should not adopt a fantasy
notebook aesthetic or any visual theme that locks the product into one story
genre.

Core visual values:

- content before interface;
- few permanent colors;
- generous whitespace without wasting the canvas;
- subtle motion;
- warm and readable surfaces.

## Mockups

Static UX mockups live in [docs/mockups](mockups/README.md).

The first reference is [Story Canvas mockups](mockups/story-canvas.html), which
covers compact graph density, trigger routing, the inspector, and author
simulation.

The bitmap
[Story Canvas creative workspace reference](mockups/story-canvas-creative-workspace.png)
captures the current visual direction: warm neutral surfaces, restrained
component styling, contextual concept colors, a calm canvas, and a right-side
inspector.

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

## Initial Visual Direction

The following values are not final implementation tokens yet, but they define a
strong starting point for visual exploration.

Neutral palette:

- app background: warm paper-like gray, around `#F6F4F1` or `#F5F3EF`;
- primary surface: `#FFFFFF`;
- secondary surface: `#FBFAF8`;
- subtle borders: around `#E5E1DB`;
- main text: around `#2D2D2D`;
- secondary text: around `#757575`.

Concept colors should belong to concepts, not generic components:

- interaction: neutral;
- future character: blue, around `#5C8DF6`;
- future place: green, around `#5FAF72`;
- future group: violet, around `#8A6AF0`;
- trigger: orange, around `#F3A847`;
- invalid condition: red;
- valid condition: green.

Interaction cards should remain mostly neutral. A promising direction is to let
the current context subtly tint the interface: a character focus can influence
badges and related accents, a place focus can shift the accent to green, and a
group focus can shift it to violet. The story stays the same, but the author's
point of view changes.

Typography candidates:

- Geist as the preferred first candidate;
- IBM Plex Sans as a readable alternative;
- Manrope as another strong alternative.

Spacing should follow a simple 8-point system:

- `4`;
- `8`;
- `16`;
- `24`;
- `32`;
- `48`;
- `64`.

Border radii should stay restrained:

- `8px`;
- `12px`;
- `16px` maximum for larger surfaces.

Shadows should be very subtle, for example a light `0 2px 8px` elevation style.

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

## MVP Canvas Rules

These rules describe the current implementation target for the MVP editor.

Interaction cards:

- width stays fixed around `210px`;
- cards stay neutral, white, and compact;
- border radius should stay around `10px`;
- title and excerpt are the only persistent content on the card;
- selected cards use the primary blue accent through border and halo, not a
  filled background.

Automatic placement:

- new child and parent interactions are placed on the same vertical axis by
  default;
- the default vertical step is compact, currently `132px`;
- overlap avoidance remains more important than density, so placement may skip
  several compact steps when nearby interactions already occupy the same column;
- manual drag placement remains the author override.

Trigger markers:

- linked triggers use a small orange diamond marker around `20px`;
- root triggers use the same visual language so roots are editable as triggers,
  not hidden interaction metadata;
- selected trigger markers use the same blue selection accent as selected
  interactions;
- trigger markers are the only selectable trigger surface.

Links:

- graph links are thin and muted by default;
- links become stronger only on hover or selection;
- link routing should adapt to source and target positions instead of assuming
  every relationship is strictly top-to-bottom;
- link deletion remains a small local control revealed on hover of the link.

## Component Direction

Interaction cards are the core component. They should show only the information
that helps authors recognize the story moment: title, short excerpt, and later
quiet concept badges for characters, places, or groups.

Triggers may evolve from simple circles toward a diamond or small hexagon shape
if that makes them easier to distinguish from interaction handles. Hovering a
trigger can reveal local action icons around it.

Links should stay thin, never black by default, and should become more prominent
only on hover, selection, or invalid/disabled states.

The left panel should stay simple: search, focused lists, and creation controls
near the relevant list. The inspector should use a stable internal structure
across editable objects, such as content, metadata, navigation, and future
notes, while only showing sections that are meaningful for the selected object.

Large labeled buttons should be rare in the authoring surface. Prefer icons,
context menus, keyboard shortcuts, and local actions when the command is clear.

Lucide is the preferred icon family.

Empty states should be warm and direct. They may use small illustrations, but
the product should otherwise avoid decorative illustration inside the editor.

Dark mode should be considered while defining tokens, even if it is not
implemented in the first visual pass.

Shortcuts should be discoverable near commands, in the spirit of Notion-style
menus.

Subtle motion should make the workspace feel alive without distracting authors:

- selection feedback around `150ms`;
- recentering or zoom transitions around `250ms`;
- inspector open or close around `200ms`.

## Target Devices

Full graph editing is a desktop-first workflow.

Tablet editing may be possible later, but phone-based story creation is not a
current design target. Mobile should prioritize reading and, much later,
possibly light comments or review actions.

The interface should stay the same conceptually for every author profile. It
should be based on simplicity, intuition, and collaboration rather than separate
specialized modes for solo authors, groups, or game masters.

The first user tests can assume users who are basically comfortable with digital
tools, but not necessarily familiar with node editors.

## Accessibility Baseline

The design system should define accessibility rules before visual complexity
grows.

Baseline rules:

- color must never be the only carrier of meaning;
- trigger states and condition hints should combine color with icons, shape, or
  labels;
- focus states must be visible;
- click and drag targets must stay large enough to use comfortably;
- selected, hovered, disabled, and error states must be distinguishable without
  relying only on hue;
- graph controls should remain usable with keyboard navigation where practical.

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
