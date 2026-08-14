# ADR-018: Anchored Review Comments

Status: Accepted

Date: 2026-08-13

## Context

Authors and reviewers need discussions that behave like post-its across the
graph, triggers, interactions, context entities, and precise portions of text.
Embedding those discussions in `Story` would make collaborative metadata part of
reader evaluation, exports, revision merges, and every story persistence path.
Storing only DOM positions would also make text comments break as soon as an
author edits nearby content.

## Decision

Review discussions are a separate, story-scoped resource. PostgreSQL stores a
thread and its ordered messages in `story_comment_threads` and
`story_comment_messages`. A thread is open or resolved; resolution preserves its
history.

An anchor is one discriminated value:

- `canvas`, with a stable graph coordinate;
- `entity`, with a same-story target type and id;
- `text`, with a same-story target, supported field, selected quote, surrounding
  prefix/suffix, original offsets, and source hash.

The shared package owns anchor validation, same-story membership checks, labels,
quote relocation, and detached-anchor detection. Text relocation first checks
the original offsets, then requires one unambiguous quote/context match. A lost
target or ambiguous quote marks the thread detached; it does not delete review
history.

The API is the authorization boundary. Listing requires management, editing, or
effective comment capability. Creating and replying require effective comment
capability and therefore authentication. Owners, administrators, editors, and a
thread's creator may resolve or move that thread. The web client uses resolved
capabilities only to adapt the interface.

The editor projects canvas anchors as React Flow comment nodes and entity/text
anchors as badges and discussion context. Reviewers without edit capability use
the same graph in a read-only workspace. Comments are never copied into the
canonical story, reader progress, reader UI, or story exports.

Live updates use authenticated Server-Sent Events. Mutation events carry only a
story id, thread id, change type, and timestamp; clients respond by reloading the
normal authorized comment endpoint. A ready event on every connection makes
reconnects recover missed changes, and a heartbeat keeps idle streams open through
the reverse proxy. The first implementation uses a process-local event broker,
which matches the current single-API-process deployment baseline.

## Consequences

- Narrative evaluation remains deterministic from authored story plus journey.
- Comment persistence can evolve without touching every story mutation or
  creating merge conflicts in the story aggregate.
- Text threads survive nearby edits when their quote/context remains unique and
  fail visibly when it does not.
- Public reading never exposes reviewer identities or discussion content.
- Message editing/deletion, mentions, notifications, cross-replica event fan-out,
  suggestions, simultaneous story editing, and reader-facing social comments
  remain separate future work.
