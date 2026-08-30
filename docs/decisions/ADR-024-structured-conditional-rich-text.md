# ADR-024: Structured Conditional Rich Text

Status: Accepted

Date: 2026-08-30

## Context

Interaction bodies already support sanitized rich HTML, stable variable tokens,
inline interaction links, and a legacy conditional frame whose visibility is
derived from one outgoing interaction target. Authors also need text controlled
directly by visited-interaction, context, typed-value, inventory, and temporal
conditions. Recreating a second condition model or editor would duplicate the
Trigger contract and allow the two behaviors to diverge.

Conditions must remain structured and validated. Encoding them as JSON inside
HTML attributes would make the rich-text sanitizer, migrations, history, and
same-Story reference cleanup fragile, while treating rendered editor controls as
canonical content would couple the domain to one web projection.

## Decision

An Interaction may own `ConditionalTextBlock` records. Each record has a stable
id and a non-empty array of the existing `TriggerCondition` union. Conditions in
one record are evaluated as AND by the same framework-independent shared helper
used by Trigger eligibility.

The interaction body stores only `data-conditional-text-block="<id>"` on the
sanitized frame. PostgreSQL stores the structured records in the Interaction row
as constrained JSONB. The PATCH that changes a frame sends body and block records
together, so history and persistence treat the authoring gesture atomically. API
validation reuses the Trigger condition validation path, including same-Story
references, typed stat comparisons, and temporal normalization.

The web editor extracts and reuses the Trigger condition fields and default
condition creation. Condition tokens and their add/remove controls are transient
projections removed before authored HTML is emitted. Removing the final token
unwraps the frame and preserves its content. Selecting text before creating a
frame wraps that selection; no selection inserts an editable placeholder.

The reader removes structured frames whose condition group does not match the
deterministically replayed state. Simulation Mode keeps unmatched frames visible
with unavailable styling and a condition summary. Existing target-based frames
remain supported and keep their previous outgoing-availability semantics.

## Consequences

- Trigger and conditional-text conditions cannot acquire different validation or
  runtime semantics accidentally.
- HTML remains sanitized presentation data rather than the canonical condition
  store.
- Body and condition changes participate in existing durable Story history and
  collaborative invalidation.
- Legacy authored content requires no destructive migration.
- OR remains a later authoring increment; one frame currently contains one AND
  group.
