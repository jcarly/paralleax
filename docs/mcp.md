# MCP Prototype

`apps/mcp` is a private, local [Model Context Protocol](https://modelcontextprotocol.io)
server that lets an assistant (Claude Code, Claude Desktop, Codex or any MCP
client that can launch a local command) read Paralleax stories and add
interactions and branches. Design and limits: [ADR-047](decisions/ADR-047-local-mcp-adapter-over-http-api.md).

It is a thin client of the Paralleax HTTP API: it acts as one signed-in user,
and every permission, validation, quota, rate limit, history entry and live
editor update comes from the API.

## Start

Requirements: a running API (`npm run dev`, or the API alone) and an account
on it. Then, from the repository root:

```bash
npm run build -w @paralleax/shared
```

```bash
npm run build -w @paralleax/mcp
```

```bash
npm run login -w @paralleax/mcp
```

`login` asks for your Paralleax email and password, signs in through the usual
login endpoint and stores a separate session in
`~/.config/paralleax-mcp/session.json` (mode 0600, bound to the API URL).
`npm run logout -w @paralleax/mcp` revokes and deletes it.
`node apps/mcp/dist/main.js status` shows which user the server acts as.

| Variable                     | Purpose                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `PARALLEAX_API_URL`          | API base URL, default `http://localhost:3000/api`. HTTPS is required except on localhost. |
| `PARALLEAX_MCP_SESSION_FILE` | Session file location.                                                                    |
| `PARALLEAX_SESSION_TOKEN`    | Session token override, for automated tests only.                                         |

The server itself is started by the MCP client; do not run it by hand.

## Configure a client

Use the absolute path of `apps/mcp/dist/main.js`.

Claude Code:

```bash
claude mcp add paralleax -- node /absolute/path/to/paralleax/apps/mcp/dist/main.js
```

Claude Desktop (`claude_desktop_config.json`) or any client with the same format:

```json
{
  "mcpServers": {
    "paralleax": {
      "command": "node",
      "args": ["/absolute/path/to/paralleax/apps/mcp/dist/main.js"],
      "env": { "PARALLEAX_API_URL": "http://localhost:3000/api" }
    }
  }
}
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.paralleax]
command = "node"
args = ["/absolute/path/to/paralleax/apps/mcp/dist/main.js"]
```

This is a **stdio** server: it only works with clients running on the same
machine. ChatGPT on the web cannot use it; see [Remote access](#remote-access).

## Tools

| Tool                  | Access | Purpose                                                                                                                                                                           |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_stories`        | read   | Stories the user can access: id, title, interaction count, revision, `canEdit`. Search, filter, paging.                                                                           |
| `get_story_structure` | read   | One page (default 50, max 200) of interactions with text excerpts and effects, Triggers (inputs → output, condition groups), and the story context. Reports `consistentRevision`. |
| `get_interaction`     | read   | One interaction in full: HTML body, conditional text blocks, effects, incoming Triggers, outgoing connections.                                                                    |
| `create_interaction`  | edit   | Title and optional HTML body. With `parentInteractionId`, the default Trigger connects the parent to it (a branch). Placement follows the editor rule unless `position` is given. |
| `update_interaction`  | edit   | Changes only the listed fields: title, body, duration, location, characters, stat and item effects, position.                                                                     |
| `create_trigger`      | edit   | Adds a Trigger to a target interaction with one or more input interactions and optional condition groups.                                                                         |

Write tools accept an optional `idempotencyKey`: retrying with the same key and
arguments returns the first result (`replayed: true`) instead of writing again.

Errors are returned as `{ error: { code, message, status?, requestId?, details?, hint? } }`.
Codes come from the API (`AUTHENTICATION_REQUIRED`, `FORBIDDEN`,
`STORY_NOT_FOUND`, `TRIGGER_CONNECTION_EXISTS`, `STORY_QUOTA_EXCEEDED`,
`RATE_LIMITED`, ...) or from the adapter (`API_UNREACHABLE`,
`API_CONTRACT_MISMATCH`, `INTERACTION_NOT_FOUND`, `PARTIALLY_APPLIED`,
`IDEMPOTENCY_KEY_REUSED`).

Not exposed: deletion, access and collaborator changes, administration,
imports, bulk changes and whole-graph replacement.

## Demo

With the API running, the server built and `login` done, create a story named
"La dernière transmission" in the editor, then run:

```bash
node apps/mcp/scripts/demo.mjs "La dernière transmission"
```

The script launches the server over stdio like an MCP client, lists the story,
reads its structure, creates "Le message crypté" after the first interaction,
adds the branches "Déchiffrer le message" and "Ignorer le message", connects
the first branch to an existing interaction with `create_trigger`, and reads
the result back. Reload the story in the editor to see the new interactions;
open editors also reload through the usual live update.

Equivalent assistant prompt: _Open the story "La dernière transmission". Analyse
its structure. Add an interaction in which the protagonist discovers an
encrypted message, then create two possible branches._

## Tests

- `npm run test -w @paralleax/mcp`: tools through a real MCP client and server
  against a stubbed HTTP edge (contracts, errors, input validation, token
  handling, idempotency).
- End-to-end against a running development API and PostgreSQL, with real
  accounts and permissions (never point it at production):

```bash
PARALLEAX_MCP_E2E_API_URL=http://localhost:3000/api npm run test:e2e -w @paralleax/mcp
```

Set `PARALLEAX_MCP_E2E_INTERACTION_QUOTA` to the API's
`PARALLEAX_STORY_QUOTA_INTERACTIONS` to also check quota enforcement. The API
allows five registrations per minute, so wait a minute between runs.

## Limitations

- Local development API only. In production `OriginGuard` refuses `login` and
  writes from a non-browser client; the adapter does not forge `Origin`.
- The stored session is a full account session (30 days), not a scoped,
  read-only or per-story credential.
- Creating an interaction is two requests and two history entries. If the
  second fails the tool returns `PARTIALLY_APPLIED` with the created ID.
- No preview, diff or expected-revision check: writes apply immediately and,
  like editor edits, the last write to the same field wins. Every change can be
  undone from the editor history.
- Idempotency keys live in memory for one server process.
- `get_interaction` loads the complete Story; `get_story_structure` makes six
  requests per page. Both count against the API rate limits.
- Conditional text blocks and rich text links to other interactions are read
  but not authored by the tools.

## Remote access

A remote server (Streamable HTTP), needed for ChatGPT or other hosted clients,
is not implemented. It must not be deployed by wrapping this server with a
shared session token. It needs:

1. A delegated credential: an OAuth 2.1 authorization server (or the API as
   one) with PKCE, client registration, consent, and scopes for read and write,
   ideally per story; tokens stored hashed, revocable, and listed to the user.
2. API support for that bearer credential in `SessionGuard` and `OriginGuard`
   (CSRF protection only applies to cookies), and audit of the acting client in
   Story history.
3. The MCP Streamable HTTP transport with protected-resource metadata, origin
   and host validation, per-client rate limits, request size limits and TLS.
4. The roadmap's preview/diff/commit batches with stale-revision rejection
   before writes are offered broadly.

Rough estimate for one developer: 2 to 3 weeks for steps 1 to 3 (OAuth and
token lifecycle are most of it), plus 2 to 4 weeks for step 4, plus security
review and deployment work.
