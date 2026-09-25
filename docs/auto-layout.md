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

## Layout Quality Reference Scenario

`apps/web/src/test/complexLayoutStoryFixture.ts` provides a deterministic,
intentionally tangled Story with 100 interactions. It contains branching and
converging stages, multi-input Triggers, independent Triggers on the same output,
long-range shortcuts, several return cycles, a self-loop, and a disconnected
island. Card content varies to exercise measured dimensions. Fixture unit tests
protect these motifs and same-Story references. This is test data, not a new
production demo or a change to narrative semantics.

Run the browser audit through the existing Playwright suite:

```sh
npm run test:e2e -w @paralleax/web -- editor.layout-quality.spec.ts
```

The test clicks the real organization action, observes its batched position
save, and checks that those positions are applied to rendered nodes. It then
uses the normal Fit View control to frame the saved result. Every expected
Interaction, linked Trigger, and edge must be rendered before auditing the
complete graph, and measured node dimensions must be preserved. A tall test
viewport allows React Flow's normal visibility optimization to retain all nodes
after fitting the result; missing nodes or
paths fail the test rather than silently reducing the sample.

The audit reads actual SVG edge paths and measured node rectangles in graph
coordinates. Curves are adaptively approximated with 0.1-unit arc/chord and
midpoint-deviation tolerances, independently of the layout engine. The geometric
checker reports node overlaps, edge penetration into node interiors, transverse
edge crossings, and collinear route overlaps. Shared-port bundles are excluded
only along their common prefix or suffix; later crossings between those same
edges remain defects. Boundary tangencies are not interior penetrations. These
are geometric diagnostics, not a proof of graph planarity or minimum crossings.
An arbitrary complex graph may not admit a crossing-free planar drawing.

Measurements use conservative rectangular node bounds, including Trigger
markers. The checker tolerates 0.25 graph units and exempts only the first or
last 12 units of a route entering its own endpoint node, where handles can be
inset. Re-entry further along the route is still reported. Unit tests protect
crossings, tangencies, shared ports, loops, and invariance under denser polyline
sampling. SVG sampling remains an approximation, not a certified maximum-error
bound for every possible spline.

Playwright attaches the fixture and saved positions, full before/after geometry,
an issue report with element IDs and crossing coordinates, and standalone
before/after SVGs. SVGs mark offending routes in red, affected node bounds in
orange, and crossings in purple; they can be opened and zoomed without the app.
Console output starts with `STORY_LAYOUT_QUALITY` and contains the summary.
The named files are also available in the test's directory under
`apps/web/test-results/`. The reported duration includes browser interaction,
fitting, and measurement; it is not the layout algorithm's execution time.

The zero-defect quality assertion is currently an **expected failure**, activated
only after loading, completeness, saving, measurement, and artifact generation
succeed. A harness error therefore remains an unexpected failure. A future
zero-defect result becomes an unexpected pass and requires removing the known
failure annotation. To expose the current quality failure as a nonzero process
exit, set `PARALLEAX_LAYOUT_STRICT=1` before running the same command.

Initial Chromium reference, measured on 2026-09-25 with a 2400 x 4000 viewport:
100 interactions, 119 linked Trigger markers, and 251 rendered edges.

| Diagnostic                   | Before organization | After organization |
| ---------------------------- | ------------------: | -----------------: |
| Node overlap pairs           |               8,465 |                  0 |
| Edge/node intersection pairs |              16,231 |                556 |
| Transverse crossing points   |               5,062 |                  5 |
| Overlapping edge pairs       |               5,601 |                617 |

These are observed comparison values, not assertions locking in current defects.
Near-coincident routes within the geometric tolerance are classified as overlaps
instead of false transverse crossings caused by SVG coordinate noise.

Use the same fixture and geometric audit when comparing ELK or another layout
engine. Compare individual metrics and inspect their reported locations; do not
accept an improvement caused by hiding routes, shrinking nodes, or changing
Story topology. Separating node placement from edge routing remains necessary:
new node coordinates alone do not imply obstacle-free rendered paths.
