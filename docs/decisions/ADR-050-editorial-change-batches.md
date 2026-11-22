# ADR-050 - Editorial Change Batches: Preview, Diff and Commit

**Status:** Accepted
**Date:** 2026-11-21 (revised 2026-11-22 after review: stored proposals,
complete created-entity diff, destructive commit hint)

## Context

The local MCP prototype ([ADR-047](ADR-047-local-mcp-adapter-over-http-api.md))
was validated functionally by the project owner. Its write tools applied each
change immediately, as two HTTP mutations for a new interaction, with no
preview, no expected-revision check and in-memory idempotency only. The
roadmap ([External Agent Integrations, stage 1 and 4](../roadmap-history.md#post-v1-direction-external-agent-integrations))
requires coherent batches that can be validated without persistence, reviewed
as a diff, committed against a known revision and rejected cleanly when stale,
before any wider release.

An audit of the API found that the required transaction already exists:

- `StoriesRepository.mutate` locks the Story row (`FOR UPDATE`) after the edit
  access check, loads the canonical Story, applies a pure mutation, checks the
  quotas on the result, persists the difference and records one durable history
  event (ADR-023) in one transaction. `StoryMutationService` sets the next
  revision and publishes the live invalidation (ADR-020) after the commit.
- The rules for creating and editing Interactions and Triggers (same-Story
  references, condition kinds, effect targets, rich text sanitization, the
  Trigger connection policy) were private closures of `StoryGraphService`.
- Interaction and Trigger IDs are global primary keys: an ID chosen by, or
  predictable to, a client could collide with another Story's entity.

## Decision

Add a provider-neutral, versioned **change batch** contract with two API
operations, `POST /api/stories/:storyId/changes/preview` and
`POST /api/stories/:storyId/changes/commit`. The contract is not specific to
assistants: the editor, imports or tests can produce the same batches.

- **Contract (`packages/shared/src/story-changes`).** `version: 1` and an
  ordered list of typed domain operations: `create_interaction`,
  `update_interaction`, `create_trigger`, `update_trigger`. No generic JSON
  patch and no whole-Story replacement. New operation types (deletion,
  characters, locations, groups, stats, items) extend the discriminated union
  and reuse the same pipeline.
- **Temporary references.** A creating operation may declare `ref`; a later
  operation names it with `{ "ref": "name" }` wherever it names an Interaction
  or Trigger, including visited-interaction conditions. Resolution is shared and
  deterministic: only earlier operations, unique names, kind checks. Strings
  are existing IDs checked by the usual rules.
- **One set of rules.** The four `StoryGraphService` closures move to focused
  modules (`story-graph-edits.ts`, `story-graph-conditions.ts`) used by both the
  single-entity endpoints and batches. Entity fields are validated by the same
  DTO classes. Batches do not call HTTP endpoints in sequence.
- **Preview.** Checks edit access, reads one consistent snapshot (a
  `REPEATABLE READ READ ONLY` transaction), applies the batch to a disposable
  copy, checks that it changes something and fits the quotas, and returns
  per-operation diagnostics and a summary derived from the ADR-023 history
  delta. It writes nothing, increments nothing, records no history and
  publishes no invalidation.
- **Stored proposals.** A valid preview stores the exact operations it
  validated in `story_change_proposals`, with the user, Story, base revision and
  an expiry (one hour; at most 20 unexpired proposals per user, the oldest are
  removed). It returns a random, server-issued `proposalId` (256 bits). A commit
  sends only `{ version, proposalId }`: it can only apply a batch the server
  previewed, for the same user and Story, and never operations supplied at
  commit time. The proposal table is not authored Story content: storing a
  proposal is not an editorial change, revision or history entry.
- **Commit.** One `mutate` transaction: edit access check and row lock, then the
  stored proposal lookup (`404 STORY_CHANGE_PROPOSAL_NOT_FOUND` when unknown,
  expired, another user's or another Story's), then the revision check under
  the lock (`STORY_REVISION_CONFLICT`), then the same
  application, final checks and persistence. A valid batch creates exactly one
  revision and one history event, operation `story.changes.committed`; any
  failure rolls back everything. Final IDs are random UUIDs generated at commit;
  preview IDs are provisional.
- **Idempotency.** The commit deletes the stored proposal and records its ID
  and created entities on the history event (`proposal_id`, `proposal_result`,
  unique per Story; migrations `202611210048` and `202611220049`). Under the
  lock, a commit whose proposal is already recorded returns `already_applied`
  with the original revision and IDs, and whether the batch was undone since,
  without writing. The answer survives restarts and the proposal's expiry.
- **Errors.** New application errors, `ApplicationConflictError` and
  `ApplicationNotFoundError`, are mapped by the exception filter to 409 and 404
  with their code and details. Invalid batches at
  commit raise `DomainValidationError` (`STORY_CHANGES_INVALID`, 400) with the
  diagnostics.
- **MCP.** `preview_story_changes` and `commit_story_changes` replace the direct
  write tools, which are removed so the review flow cannot be bypassed through
  the MCP server. The commit tool only forwards the `proposalId`; the MCP server
  keeps no proposal state. `commit_story_changes` is annotated
  `destructiveHint: true`: a batch can replace bodies, effects and conditions,
  even if history can undo it. The instructions require the read, build,
  preview, present, confirm, commit and verify sequence.
- **Reviewable diff.** The summary lists every authored field of an added or
  removed Interaction or Trigger (body, effects, conditional text, condition
  groups, probability, timer, position), and the changed fields of updated
  ones, with old and new values. Strings beyond 2,000 characters are cut and
  structured values beyond 4,000 serialized characters are replaced by a size
  marker, both flagged `truncated: true`.

### Alternatives considered for the preview proof

- A digest of the batch recomputed at commit (the first version of this ADR):
  it binds a commit to an exact batch, but any client can compute it, so it
  does not prove that the server issued a preview.
- A signed, expiring token (HMAC): no storage, but a new mandatory production
  secret and its rotation, and the client must still send the operations again.
- Redis with key expiry: not part of the stack, which adds Redis only for
  measured workloads ([hosting and scale](../hosting-and-scale.md)); it would
  also split the proposal check from the PostgreSQL commit transaction.
  Proposals can move there later without changing the contract.

## Consequences

- Assistants and future clients get an atomic, reviewable and stale-safe write
  path that reuses every editor rule, the history and live invalidation.
- Undo and redo treat a batch as one change (ADR-023); a later conflicting edit
  makes the undo report a conflict, as for any other change.
- A lost commit response is safe to retry with the same proposal.
- The API itself guarantees that every commit applies a batch it previewed and
  stored, exactly, on the previewed revision, for the same user, at most once.
  It cannot know whether a human read the preview: confirmation before commit
  remains the MCP client's and assistant's responsibility.
- Previews write a row outside the authored Story; expired rows are removed by
  later previews of the same user and when the Story or user is deleted.
- The single-entity HTTP endpoints stay for the editor; they keep their
  last-write-wins semantics.
- Batches are limited to 100 operations and the global 128 KiB request body.
  Deletion and context entities are not supported yet.
