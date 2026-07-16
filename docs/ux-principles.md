# UX Principles

These principles guide product and interface decisions across the editor,
simulation mode, reader, and future platform features.

## One Source of Truth

All views must use the same story model.

The canvas, simulation mode, reader, filters, future character focus, future
place focus, and future collaboration tools may expose different perspectives,
but they must not create separate story structures.

## One Story View

Paralleax should avoid multiplying disconnected editor views.

The Story Canvas is the main authoring surface. The interface may filter,
highlight, collapse, focus, or reframe the canvas, but the author should feel
they are still working on the same story.

## One Inspector

The inspector is unique and contextual.

It edits the selected object, such as an interaction or trigger in the MVP, and
future objects later. It should not duplicate relationship lists that are clearer
on the canvas.

## Opinionated Simplicity

Paralleax should not ask authors to configure every detail.

The default answer should be one clear workflow, automatic behavior when the
model can infer intent, and few competing options. This is especially important
for graph authoring: too much configurability can make the canvas harder to
learn and less stable.

Examples:

- creation should favor a small set of explicit gestures;
- graph layout should be automatic first, then manually adjustable where it
  matters;
- interaction cards should not be freely resizable in the first versions;
- filters and navigation should remain easy to understand before they become
  powerful.

This does not mean hiding important capabilities. It means exposing them where
authors expect them, with the least possible conceptual overhead.

## Navigation First

Large stories are hard because authors need to find the right object, not only
because they need to zoom.

Search, focus, bookmarks, recent selections, keyboard navigation, and contextual
navigation should be treated as core authoring tools.

## Authors Think In Stories

The interface should use narrative language whenever possible.

Triggers, conditions, and graph links are necessary concepts, but their UX should
help authors reason about moments, branches, choices, consequences, and paths
instead of algorithms.

The preferred vocabulary is "active interaction" when the same object is being
worked on in the canvas, inspector, or simulation. "Selected interaction" remains
a technical UI state, but authors should feel that one story moment is active
across the workspace.

## The Graph Is A Representation

The graph is useful, but it is not the product.

The product is the narrative model and the ways to explore, edit, test, review,
and share it.
