# Auto Layout

Auto layout covers commands that reorganize an existing Story Canvas.

It is different from default placement. Default placement decides where a newly
created interaction appears. Auto layout rearranges interactions that already
exist.

## Current Behavior

The canvas exposes one automatic-organization action for the complete graph, a
selected interaction or linked Trigger marker, or a rectangular multi-selection.

Whole-graph organization currently calls `computeStoryGraphElkLayout`; selection
organization still uses `computeStoryGraphLayout`. Both return position updates.
`TriggerEdge` then draws its own smooth-step paths, so ELK's edge sections are
currently discarded.

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
island. Three direct two-interaction cycles (0 ↔ 1, 24 ↔ 25, and 96 ↔ 97)
cover the entry, an intermediate stage, and the disconnected island. Card content
varies to exercise measured dimensions. Fixture unit tests
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

Two-interaction cycles have a separate blocking check: all four rendered paths
(Interaction → Trigger → Interaction in each direction) must avoid both cards,
including their own source and target cards. The stress test attaches the cycle
IDs, route IDs, and intersections in `layout-two-interaction-cycles.json`.

A focused two-card browser regression in the same spec organizes one of these
cycles, saves positions into the mocked Story through the shared position
operation, then reloads it. All four nodes and edges must still be rendered;
Interaction and Trigger positions and dimensions must match the organized result.
Both phases use actual SVG paths and emit `cycle-organized` / `cycle-reloaded`
JSON and SVG artifacts. The collision detector's unit tests separately verify a
return that cuts through both cards and a valid exterior detour, including dense
path sampling.

This focused regression is currently intentionally failing (without an expected
failure annotation): on 2026-09-25 it measured zero edge-node intersections
immediately after organization, then three after reload, including the same
output route crossing both interaction cards. ELK routes are transient; reload
uses the normal top-input routing with the saved node positions. The test exposes
that routing defect without changing production behavior. The expanded stress
Story has 122 linked Trigger markers and 257 edges; its organized result measured
zero node overlaps, zero edge-node intersections, five edge crossings, and zero
edge overlaps. Historical results below use the earlier fixture.

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
This historical table predates the short-segment classification correction below;
rerun both engines with the same checker before comparing crossing/overlap totals.

Use the same fixture and geometric audit when comparing ELK or another layout
engine. Compare individual metrics and inspect their reported locations; do not
accept an improvement caused by hiding routes, shrinking nodes, or changing
Story topology. Separating node placement from edge routing remains necessary:
new node coordinates alone do not imply obstacle-free rendered paths.

## ELK Configuration and Routing Investigation (2026-09-25)

Twelve Chromium experiments used elkjs 0.12.0, the same 100-interaction fixture,
2400 x 4000 viewport, 219 rendered nodes, and 251 rendered edges. Each loaded the
real editor, clicked Organize, observed saving, fitted the result, and waited for
complete, stable geometry. Diagnostic-only interception of the ELK module varied
the input graph/options without changing the production adapter. The source
revision was `2d86ca0`.

All runs had zero node overlaps. The table measures the **current renderer**,
not the routes computed internally by ELK:

| Variant                                      | Edge/node pairs | Crossings | Edge overlap pairs |
| -------------------------------------------- | --------------: | --------: | -----------------: |
| Current configuration                        |               7 |        19 |                  1 |
| Feedback edges enabled                       |              13 |        11 |                  4 |
| Brandes-Koepf node placement                 |               7 |        27 |                  1 |
| Thoroughness 32                              |               7 |        18 |                  0 |
| Wider node and edge spacing                  |               6 |        19 |                  0 |
| Fixed interaction ports                      |              31 |        30 |                  3 |
| Fixed interaction and Trigger ports          |              37 |        20 |                 44 |
| All fixed ports + feedback edges             |              37 |        20 |                 44 |
| Depth-first cycle breaking                   |              12 |        12 |                  0 |
| Greedy model-order cycle breaking            |              12 |        12 |                  0 |
| All fixed ports + thoroughness 32            |              35 |        22 |                 31 |
| All fixed ports + depth-first cycle breaking |              12 |        18 |                  2 |

Options were varied independently from the current configuration unless the
variant explicitly combines them:

- Feedback: `elk.layered.feedbackEdges=true`.
- Node placement: `elk.layered.nodePlacement.strategy=BRANDES_KOEPF`.
- Thoroughness: `elk.layered.thoroughness=32`.
- Wider spacing: `elk.spacing.nodeNode=220`,
  `elk.layered.spacing.nodeNodeBetweenLayers=200`, edge/node spacing 40 within
  and between layers, edge/edge spacing 20 within and between layers.
- Cycle strategies: `elk.layered.cycleBreaking.strategy=DEPTH_FIRST` or
  `GREEDY_MODEL_ORDER`.
- Fixed ports: `elk.edgeRouting=ORTHOGONAL`, per-node
  `elk.portConstraints=FIXED_POS`, zero-size input/output ports at the north/south
  centers, and edge endpoints referencing those port IDs. Trigger layout boxes
  retained their existing reserved width of 80 around a 20-unit marker.

The wider-spacing result increases the ELK bounding box from 3,757 x 18,805 to
4,457 x 26,485 (about 67% more area) to avoid one additional edge/node collision.
Thoroughness 32 gives a small quality improvement, but the observed ELK call took
about 2.3 seconds versus 1.1 seconds for the reference. These single-run durations
are exploratory, not performance budgets. Neither tradeoff justifies a production
default change from this one fixture alone.

### Concrete Remaining Defects

The seven reference edge/node intersections come from four output edges:

| Trigger output edge                                  | Nodes crossed                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `trigger:interaction-16:trigger-return-23-16-output` | Its own target `interaction-16`                                        |
| `trigger:interaction-48:trigger-48-output`           | `interaction-45`, `interaction-46`, `interaction-47`, `interaction-55` |
| `trigger:interaction-64:trigger-64-output`           | `interaction-63`                                                       |
| `trigger:interaction-80:trigger-return-87-80-output` | `interaction-83`                                                       |

Cycle breaking may make an ordinary link such as 47 -> 48 run backwards in the
drawing; the problematic routes are not limited to authored return links.
`getSmoothStepPath` routes between two endpoints and does not receive the other
node rectangles. Increasing spacing cannot make that route obstacle-aware.

Inspection also found a checker defect: a short, nearly perpendicular segment
could be classified as an overlap because its projection onto a long segment
was tiny. The overlap check now requires proximity in both directions. A unit
regression covers both edge orders and dense sampling. Re-auditing the saved
geometries changes the reference from 7/14/2 to **7/19/1**; this is a measurement
correction, not a layout regression. The counts in the experiment table all use
the corrected checker. The remaining overlap involves the input edges from
interaction 47 to Trigger 48 and interaction 64 to Trigger 65.

### ELK Sections and libavoid

ELK already returns obstacle-avoiding edge sections in these experiments. Auditing
their raw polylines gives zero edge/node intersections and zero edge overlaps
for every variant. The reference has six crossings, but its unconstrained ports
do not match the editor's fixed bottom-output/top-input interaction handles, so
those six crossings are not an immediately usable UI result. With all ports
fixed and depth-first cycle breaking, raw sections have **0 intersections,
7 crossings, and 0 overlaps**, versus 12/18/2 when the current renderer replaces
them. This is a geometric prototype result, not an integrated renderer result.

The next routing experiment should preserve ELK's `sections[].startPoint`,
`bendPoints`, and `endPoint`, align ports and coordinate offsets, and audit the
actual SVG again. Rounding node positions, applying corner radii, placing
arrowheads, and restoring link-delete controls must not invalidate the routes.
The [ELK JSON format](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html)
defines these sections, while [port constraints](https://eclipse.dev/elk/reference/options/org-eclipse-elk-portConstraints.html)
and [cycle breaking](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-cycleBreaking-strategy.html)
explain the configuration choices above.

libavoid is a suitable candidate for routing around **fixed** authored positions,
especially after manual dragging or resizing: its `moveShape` operation marks
affected connectors for rerouting, and `processTransaction` processes a batch.
It complements ELK's node placement. This capability is documented in the
[libavoid overview](https://www.adaptagrams.org/documentation/libavoid.html) and
[Router API](https://www.adaptagrams.org/documentation/classAvoid_1_1Router.html).
Obstacle clearance and shared-route separation can be tuned with
`shapeBufferDistance` and `idealNudgingDistance`; upstream still labels
`crossingPenalty` and `fixedSharedPathPenalty` experimental. They do not establish
a zero-crossing guarantee. See the upstream
[routing parameter definitions](https://github.com/mjwybrow/adaptagrams/blob/master/cola/libavoid/router.h).

The installed elkjs build does not list a libavoid algorithm in
`knownLayoutAlgorithms()`. This would be a separate integration, rather than an
ELK option. [libavoid-js](https://github.com/Aksem/libavoid-js) provides a browser
and Node port with a WASM asset and LGPL-2.1 licensing. Loading, worker execution,
router-object cleanup, ports, and route invalidation need a bounded prototype.
libavoid was researched, not installed or benchmarked in this investigation.

Any route cache must remain a web projection. Dragging, content-driven resizing,
undo/redo, remote position updates, and reload must regenerate or invalidate it
from the same authored story; cached ELK paths must not silently disappear on
reload or remain attached to stale positions. Preserve independent Trigger
markers and input identities. Do not enable a router mode that adds/removes
semantic junctions or moves authored nodes as an incidental routing operation.

Local exploratory artifacts and their runner are under
`apps/web/test-results/elk-analysis/`, including `comparison.json` and per-variant
`corrected-experiment.json`, `corrected-rendered.svg`, and
`corrected-elk-sections.svg`. They are generated diagnostics, outside the normal
test suite and git tracking. The table and option definitions above retain the
findings when those temporary artifacts are cleared.
