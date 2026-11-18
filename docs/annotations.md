# Author Notes and Annotations

## Current status

Paralleax has no standalone author-note feature. Its existing anchored review
discussions support graph post-its, entity and field anchors, text anchors,
replies, and open/resolved status. They are collaboration resources, not private
or durable author notes; see [ADR-018](decisions/ADR-018-anchored-review-comments.md),
[ADR-019](decisions/ADR-019-editor-graph-reader-comments.md), and
[Current scope](current-scope.md).

Notes and review discussions both add context to authoring, but they have
different lifecycles. A note may simply preserve lore, a production reminder, an
idea, or an unresolved question. A discussion supports replies, participants,
and resolution. The product may share terminology, targets, filtering, and visual
entry points where useful; this does not decide that both should use one stored
record or lifecycle.

## Candidate authoring needs

The anonymized product discovery synthesis identifies these candidate note uses:

- lore and world context;
- production guidance;
- ideas to revisit or expand;
- problems and questions that still need a decision;
- collaboration discussion, already partly covered by review comments.

Candidate targets include an Interaction, a narrative entity, a workspace, or no
specific object. Free notes could be useful for preparation and reference, while
attached notes could stay close to the relevant scene, character, location,
faction, or production detail. Which targets authors need has not been validated.

## Design questions

Before defining persistence or adding a parallel note system, explore:

- whether categories such as lore, production, idea, and issue help authors find
  notes, or whether a small set of types and optional color/icon cues is enough;
- whether notes attach to Interactions and existing entities, can be free within
  the current workspace, or need a separate reference-board context;
- whether visibility and ownership are personal, shared with collaborators, or
  controlled by the Story's existing access model;
- how note categories, visibility, and target type affect filters and canvas
  indicators without overloading the graph;
- how to relate an annotation to a threaded review comment without showing both
  as duplicate records or implying that a note can be resolved like a discussion.

The [roadmap](roadmap.md#product-discovery-follow-up) treats this as a
P0 product-definition exercise only. The [open questions](open-questions.md#author-notes-and-writing-workflows)
track decisions that remain unresolved.

## Runtime boundary

Author notes and documentary relations are authoring metadata. They must not
change Reader availability, Trigger evaluation, or narrative execution. An
export may include them only through an explicit authoring-metadata option.
