# Auto Layout

Auto layout covers commands that reorganize an existing Story Canvas.

It is different from default placement. Default placement decides where a newly
created interaction appears. Auto layout rearranges interactions that already
exist.

## First Version

The first useful command can be a single `Reorganize` action.

Initial behavior:

- act immediately;
- reorganize the whole graph;
- prefer a vertical flow;
- avoid overlap;
- reduce unnecessary crossings when possible;
- keep triggers visible and editable;
- be undoable with `Ctrl+Z`.

Selection-based reorganization is not part of the first version. Multi-selection
would add UI and implementation complexity before the basic behavior is proven.

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

Auto layout must be undoable.

Longer term, every story modification should be undoable with `Ctrl+Z`, but
layout changes are especially important because they can move many interactions
at once.

## Later Options

Possible later layout strategies:

- compact vertical;
- horizontal;
- spread branches;
- align a future group;
- isolate and arrange a future focus area.

These should not be implemented before the basic whole-graph vertical command is
validated.
