# Auto Layout

Auto layout covers commands that reorganize an existing Story Canvas.

It is different from default placement. Default placement decides where a newly
created interaction appears. Auto layout rearranges interactions that already
exist.

## Current Behavior

The canvas exposes one automatic-organization action for the complete graph, a
selected interaction or linked Trigger marker, or a rectangular multi-selection.

Current behavior:

- act immediately;
- reorganize the whole graph;
- prefer a vertical flow;
- avoid overlap;
- reduce unnecessary crossings when possible;
- keep triggers visible and editable;
- treat the complete organization as one canonical position mutation;
- be undoable as one durable history step with `Ctrl+Z` or the canvas control.

Locking interactions in place is also out of scope for the first version.

## Cycles

Cycles should preserve a mostly vertical flow.

The layout can visually bend or loop edges, but it should avoid turning the
whole graph into a technical diagram that is harder to read as a story.

## Branch Ordering

The algorithm may reorder branch options to improve readability.

This does not change story semantics. Reader option order may eventually be
randomized or controlled separately, so canvas order should primarily serve
authoring clarity.

## Undo

Auto layout uses the same durable authored-change history as other Story
mutations. All interaction and Trigger positions from one organization command
are saved through one batched mutation, so one undo restores the complete prior
layout. Undo appends an inverse revision and does not own a special graph-only
snapshot stack.

## Later Options

Possible later layout strategies:

- compact vertical;
- horizontal;
- spread branches;
- align a future group;
- isolate and arrange a future focus area.

These should not be implemented before the basic whole-graph vertical command is
validated.
