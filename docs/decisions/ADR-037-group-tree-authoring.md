# ADR-037: Group Tree Authoring

Status: Accepted

Date: 2026-10-21

## Context

The Group tree needs file-explorer-style authoring rather than permanent forms.
ADR-035 and ADR-036 already provide the canonical Group, single-parent hierarchy,
exclusive membership, child promotion, history, collaboration and relational list
ordering. A separate drag-and-drop model or ordering table would duplicate them.

## Decision

Extend the existing Group update with optional `beforeGroupId`: a sibling id
inserts before it; `null` appends at the destination level; omission preserves the
existing list order. `parentGroupId` and order change together in one authored
mutation. Shared deterministic operations reject missing references, self-parentage,
descendant cycles and destinations outside the destination sibling set.

Canonical `Story.groups` array order remains the source of sibling order. The
existing relational `story_groups.sort_order` column, history entity-order deltas,
authorization and invalidation persist/reverse the operation. A moved Group's
compact response optionally includes `groupOrder`, so the web projection receives
the server's committed order without creating a second store. An older response
cannot replace order from a newer authoritative Story revision.

Root creation still requires selected Interactions. The existing creation action
also accepts an optional same-Story parent and an empty selection for creating an
empty subgroup directly in the tree. Existing Groups and API callers stay valid;
no migration is required.

The editor uses `@dnd-kit/core` for mouse/touch sensors, collision measurement,
drag cancellation, drag overlays and ancestor auto-scrolling. Its MIT-licensed,
typed React interface works with the supported React 19/browser targets and is
loaded only for editor Stories containing Groups. Keyboard tree navigation and equivalent move actions
use the same update contract; no canonical mutation occurs during hover. Expansion,
search, drop previews and inline name drafts remain local UI state.

Groups, characters, locations, stat definitions and item definitions share the
same name-input behavior: Enter or blur commits a trimmed non-empty name; Escape
restores the focus-time value; unsuccessful saves remain visible for retry.
Other entity functionality and inspector layout stay unchanged.

## Consequences

The tree can select, search, nest, reorder, rename, create subgroups and transfer
members without opening a Group inspector. Selection highlights recursive members;
explicit centering changes only the viewport. Deletion preserves Interactions and
promotes children as before. Reader, Simulation, Trigger evaluation, graph node
positions and React Flow containment remain unaffected.

The library supplies general drag mechanics; Paralleax owns destination semantics
and keyboard move commands. Dependency upgrades must preserve pointer/touch
activation, cancellation, accessible menus and automatic scrolling.
