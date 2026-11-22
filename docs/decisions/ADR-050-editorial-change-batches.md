# ADR-050 - Editorial Change Batches: Preview, Diff and Commit

**Status:** Accepted
**Date:** 2026-11-21

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
- **Proposal identity.** `proposalId` is the SHA-256 of a canonical JSON form of
  the batch version, Story ID, user ID, base revision and exact operations.
  Committing sends the operations and base revision again; the server
  recomputes the digest and replans everything. There is no stored proposal,
  server secret or client-supplied diff to trust. The digest is not a
  credential: permissions and the revision are checked again at commit.
- **Commit.** One `mutate` transaction: edit access check and row lock, then the
  revision check under the lock (`STORY_REVISION_CONFLICT`), then the same
  application, final checks and persistence. A valid batch creates exactly one
  revision and one history event, operation `story.changes.committed`; any
  failure rolls back everything. Final IDs are random UUIDs generated at commit;
  preview IDs are provisional.
- **Idempotency.** The history event stores the proposal digest and the created
  entities (`proposal_digest`, `proposal_result`, unique per Story; migration
  `202611210048`). Under the lock, a commit whose digest is already recorded
  returns `already_applied` with the original revision and IDs, and whether the
  batch was undone since, without writing. A commit on a new revision is a
  different proposal and conflicts instead.
- **Errors.** A new application error, `ApplicationConflictError`, is mapped by
  the exception filter to 409 with its code and details. Invalid batches at
  commit raise `DomainValidationError` (`STORY_CHANGES_INVALID`, 400) with the
  diagnostics.
- **MCP.** `preview_story_changes` and `commit_story_changes` replace the direct
  write tools, which are removed so the review flow cannot be bypassed through
  the MCP server. The MCP server keeps the exact previewed operations in memory
  (one hour, 50 entries) so a commit only names its `proposalId`; this is a
  transport convenience, not a guarantee. Its instructions require the read,
  build, preview, present, confirm, commit and verify sequence.

The canonical JSON form is a small local function rather than a dependency:
`fast-json-stable-stringify` (already installed transitively) only offers a
CommonJS `export =`, which the API's TypeScript settings (no `esModuleInterop`)
and lint rules (no `require` imports) cannot import without a configuration
change.

## Consequences

- Assistants and future clients get an atomic, reviewable and stale-safe write
  path that reuses every editor rule, the history and live invalidation.
- Undo and redo treat a batch as one change (ADR-023); a later conflicting edit
  makes the undo report a conflict, as for any other change.
- A lost commit response is safe to retry with the same proposal.
- The server cannot know whether a human saw the preview. Confirmation before
  commit is the MCP client's and assistant's responsibility; the server
  guarantees only that what is committed is exactly what was previewed, on the
  previewed revision, for the same user, once.
- The single-entity HTTP endpoints stay for the editor; they keep their
  last-write-wins semantics.
- Batches are limited to 100 operations and the global 128 KiB request body.
  Deletion and context entities are not supported yet.
