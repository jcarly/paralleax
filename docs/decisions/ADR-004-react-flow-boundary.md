# ADR-004 - React Flow Boundary

## Status

Accepted.

## Context

The editor needs a canvas with custom interaction nodes, graph edges, dragging,
zooming, panning, and connection gestures. React Flow provides those primitives
and keeps the first graph editor implementation focused.

However, Paralleax has a narrative model, not a React Flow model. A visible edge
currently represents one input of a trigger, while the trigger itself belongs to
one output interaction and may have several inputs.

## Decision

Use React Flow as the editor canvas and interaction layer, not as the domain
model.

Stories, interactions, triggers, and reader rules remain Paralleax domain
objects. The web app may project those objects into React Flow nodes and edges,
but persisted stories must not be stored as React Flow data.

## Alternatives Considered

- Build a custom canvas from the beginning.
- Store stories directly as React Flow nodes and edges.
- Introduce explicit trigger nodes immediately.

## Positive Consequences

- The MVP editor can rely on mature graph interaction primitives.
- Domain behavior remains independent from the canvas library.
- React Flow can be replaced later if it becomes limiting.
- Trigger projection can evolve from simple edges to custom edges or trigger
  nodes without changing the underlying model.

## Negative Consequences

- The editor needs mapping code between stories and React Flow objects.
- Some graph interactions require careful translation back to trigger operations.
- A future richer trigger visualization may require custom React Flow components
  or another canvas approach.

## Follow-Up

Revisit this decision if trigger semantics or story operations start changing
only to satisfy React Flow constraints.
