# ADR-036: Exclusive Direct Group Membership

Status: Accepted

Date: 2026-10-19

## Context

The product requirement revises ADR-029 and ADR-035: an Interaction may belong
directly to only one Group, while a Group can contain both Interactions and child
Groups. Indirect membership through ancestors remains useful for navigation.

## Decision

Keep the existing Group model, ordered `interactionIds`, single-parent hierarchy
and membership table. An Interaction has zero or one direct Group. Creating a
Group or replacing its members transfers those Interactions from their previous
Groups in the same authored mutation. Removing a member leaves it ungrouped.
Parent Groups can still have direct Interactions alongside their child Groups;
recursive navigation does not persist inherited memberships.

The shared operation owns transfer semantics. API mutations, compact web
projections and history validation use this same contract. Undo restores all
affected memberships together, and conflicting history replay cannot create
duplicate direct membership.

## Consequences

No new Group or runtime model is introduced. Reader, Trigger and ELK behavior
are unchanged. Deleting a Group preserves Interactions and promotes child Groups
as before; its direct Interaction members become ungrouped. Old history remains
durable, but replay that would restore multiple direct memberships is rejected.

Migration `202610190043_exclusive_group_membership` retains the first Group in
persisted list order (`story_groups.sort_order`) for each legacy Interaction with
multiple direct memberships, regardless of hierarchy depth. Stable Group ids
break ties if historical rows have equal sort order. Only surplus membership
rows are removed; Groups, Interactions, hierarchy and retained member order stay
unchanged. This reconciliation follows the explicitly approved migration policy.

The migration then adds a deferred unique constraint on
`(story_id, interaction_id)` to the existing membership table. Deferral allows
atomic transfers to insert into an earlier Group before removing the old row
later in the same transaction. Cleanup and constraint creation run in the same
migration transaction. Deployments must apply this migration before starting
the updated API.
