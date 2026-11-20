# ADR-047 - Local MCP Adapter over the HTTP API

**Status:** Accepted (prototype)
**Date:** 2026-11-20

## Context

Authors want external assistants (Claude, ChatGPT, Codex) to inspect and edit
their own test stories through the Model Context Protocol. The roadmap places
an MCP adapter in its Post-V1 "External Agent Integrations" direction
([roadmap history](../roadmap-history.md#post-v1-direction-external-agent-integrations)):
a thin adapter over the authorized application operations, read-only first,
with write tools only after a batch preview/diff/commit contract with revision
checks exists.

The current task explicitly asks for a private prototype that can also create
and update interactions and create Triggers. Explicit task requirements take
precedence over the roadmap ordering (`AGENTS.md`, sources of truth), so this
ADR records the deviation and its limits instead of rewriting the roadmap.

An audit of the API found:

- `SessionGuard` resolves an opaque, hashed, 30-day session token from the
  `paralleax_session` cookie; there is no bearer token, API key, scope or OAuth
  support. A session grants the full account.
- `OriginGuard` rejects non-GET requests whose `Origin` differs from
  `CORS_ORIGIN` in production only. It protects cookie-authenticated browsers
  against CSRF; a non-browser client would have to forge `Origin` to write.
- Story authorization is enforced in the repository (`storyReadableSql`,
  `storyEditableSql`, `hasEditAccess` inside the mutation transaction), which
  mirrors `resolveStoryAccess` in `packages/shared`.
- Every write runs through `StoryMutationService` → `StoriesRepository.mutate`:
  one transaction with a row lock, quota checks, a durable history event
  (ADR-023) and an in-process SSE invalidation (ADR-020) that open editors
  use to reload.
- DTO validation (`ValidationPipe`, whitelist and forbid unknown fields), rich
  text sanitization and the Trigger connection invariant live in the API.
- Rate limits (`ThrottlerGuard`) are per route and client address.
- Story change events are in-memory in the API process.

## Decision

Add an `apps/mcp` workspace: a local MCP server on the **stdio** transport,
built with the official TypeScript SDK v2 (`@modelcontextprotocol/server`
2.4.0, the stable line for the 2026-07-28 specification), that calls the
**existing Paralleax HTTP API** as an ordinary authenticated client.

- **No second authorization path.** The server holds no database connection
  and imports nothing from `apps/api` or `apps/web` (enforced by ESLint and
  dependency-cruiser). Identity, permissions, validation, sanitization, quotas,
  rate limits, history and live invalidation are those of the API.
- **Identity.** `paralleax-mcp login` signs in with the regular login endpoint
  and stores the resulting session (a separate server-side session, revocable
  with `paralleax-mcp logout`) in a 0600 file bound to the API URL. The tool
  caller never chooses the user. `PARALLEAX_SESSION_TOKEN` overrides the file
  for automated tests. Tokens are only sent to https or loopback API URLs, and
  redirects are refused so the cookie cannot be forwarded.
- **Tools.** Six purpose-built tools, not a REST mirror: `list_stories`,
  `get_story_structure` (one page of the paginated editor projections,
  ADR-027), `get_interaction`, `create_interaction`, `update_interaction` and
  `create_trigger`. No delete, access, administration, import, bulk or
  whole-graph replacement tool.
- **Reuse.** New interactions use the editor's two calls (create from a parent,
  then edit content) and the shared placement rule (`getNextChildPosition`,
  `getNextRootPosition`). Inputs are checked for shape and size with strict
  schemas; domain rules stay in the API. API responses are parsed against a
  minimal contract so a drift fails clearly.
- **Repeated writes.** Write tools accept an optional `idempotencyKey`; the
  server replays the first result for the same key and arguments and refuses a
  reused key with other arguments. The cache is in memory for the process
  lifetime (24 hours, 500 entries).
- **Concurrency.** Writes send only the fields being changed and are serialized
  by the API transaction, like editor edits. There is no expected-revision
  check: the API has none for single-entity mutations. Structure reads report
  whether their pages saw one revision.
- **Diagnostics.** One JSON line per tool call on stderr (tool, story ID,
  outcome, error code, API request ID, duration); never tokens or story text.

## Consequences

- The prototype works against a local or development API. Against production,
  `OriginGuard` refuses `login` and every write because the adapter sends no
  browser `Origin`; that is intended until a non-cookie credential exists. The
  adapter never forges `Origin`.
- The stored credential is a full account session, not a scoped, read-only or
  per-story token. The narrow tool set limits what the assistant can do, not
  what a leaked token can do.
- Creating an interaction is two history events and two requests. If the
  second fails, the tool reports `PARTIALLY_APPLIED` with the created ID.
- The roadmap's preview/diff/commit batches, stale-revision rejection and
  delegated identity remain prerequisites for a general or remote release.
- A remote (Streamable HTTP) deployment, for example for ChatGPT, needs an
  OAuth 2.1 authorization server or an equivalent scoped bearer credential,
  `OriginGuard`/`SessionGuard` support for it, per-client rate limits and
  audit identity. It is deliberately not implemented here; see
  [MCP prototype](../mcp.md#remote-access).
