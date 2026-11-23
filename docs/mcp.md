# MCP Prototype

`apps/mcp` is a private, local [Model Context Protocol](https://modelcontextprotocol.io)
server that lets an assistant (Claude Code, Claude Desktop, Codex or any MCP
client that can launch a local command) read Paralleax stories and propose
reviewed batches of changes. Design and limits: [ADR-047](decisions/ADR-047-local-mcp-adapter-over-http-api.md)
and, for writes, [ADR-050](decisions/ADR-050-editorial-change-batches.md).

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
On Linux and macOS the server refuses to use the file if other OS users can
read or write it. Windows has no such mode bits: the file is protected only by
the user profile's access control lists, which the prototype does not verify.

`npm run logout -w @paralleax/mcp` revokes the session on the API, then
deletes the file. If the API cannot revoke it, the file is kept and the command
fails, so a still-valid session is not forgotten. `logout --local-only`
deletes the file anyway; the session then stays valid until it expires (30
days) or until you use "Sign out other sessions" in the Paralleax account menu.
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

| Tool                    | Access | Purpose                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_stories`          | read   | Stories the user can access: id, title, interaction count, revision, `canEdit`. Search, filter, paging.                                                                                                                                                                                                                                                                          |
| `get_story_structure`   | read   | One page (default 50, max 200) of interactions with text excerpts and effects, Triggers (inputs → output, condition groups), and a page of the story context (`contextPage`: locations, characters, stat definitions, **stat assignments** with their owner and initial value, item definitions; `context.hasMore` says that another page exists). Reports `consistentRevision`. |
| `get_interaction`       | read   | One interaction in full: HTML body, conditional text blocks, effects, incoming Triggers, outgoing connections.                                                                                                                                                                                                                                                                   |
| `preview_story_changes` | edit   | Validates an ordered batch of operations (interactions, Triggers, characters, locations, stat definitions and assignments) on an unsaved copy and returns `proposalId`, `baseRevision`, a diff summary and diagnostics. Writes nothing.                                                                                                                                          |
| `commit_story_changes`  | edit   | Applies a previewed proposal in one revision and one history entry, or not at all. Returns the final IDs of the created entities.                                                                                                                                                                                                                                                |

The batch operations, references (`{ "ref": "name" }`), diff, errors and retry
rules are described in [Story change batches](story-changes.md).

### Stats, assignments and their use

Stat definitions and assignments are operations of the same batch (no new tool).
A definition is a reusable typed name; an assignment gives one owner its own
initial value; effects and conditions target the **assignment**. The existing IDs
come from `get_story_structure`: `context.statAssignments` lists them all, page
by page (`contextPage`, until `context.hasMore` is false).

```json
[
  {
    "type": "create_stat_definition",
    "ref": "reserveDef",
    "fields": { "name": "Réserve électrique", "valueType": "number" }
  },
  {
    "type": "create_stat_assignment",
    "ref": "reserve",
    "statDefinition": { "ref": "reserveDef" },
    "owner": { "type": "story" },
    "fields": { "initialValue": 100 }
  },
  {
    "type": "create_interaction",
    "ref": "maintain",
    "inputInteractions": ["<existing interaction id>"],
    "fields": {
      "title": "Maintenir le résonateur actif",
      "statEffects": [{ "statId": { "ref": "reserve" }, "operation": "add", "value": -20 }]
    }
  },
  {
    "type": "create_interaction",
    "inputInteractions": [{ "ref": "maintain" }],
    "fields": { "title": "Activer le protocole de secours" },
    "defaultTrigger": {
      "conditionGroups": [
        { "conditions": [{ "statId": { "ref": "reserve" }, "operator": "gte", "value": 60 }] }
      ]
    }
  }
]
```

Not supported yet: references inside expressions, exact item instances, and
deletion. See [Story change batches](story-changes.md).

### Characters and locations

There is no `create_character` or `create_location` tool: they are operations of
the same batch, so a character, a location, the scene that uses them and a
condition on them are one proposal, one revision and one undo.

```json
[
  {
    "type": "create_character",
    "ref": "alya",
    "fields": { "name": "Alya", "description": "Station engineer." }
  },
  { "type": "create_location", "ref": "station", "fields": { "name": "Station Néréide-7" } },
  {
    "type": "create_interaction",
    "ref": "lab",
    "inputInteractions": ["<existing interaction id>"],
    "fields": {
      "title": "Inspection du laboratoire",
      "locationId": { "ref": "station" },
      "characterIds": [{ "ref": "alya" }]
    },
    "defaultTrigger": {
      "conditionGroups": [
        { "conditions": [{ "characterId": { "ref": "alya" }, "isPresent": true }] }
      ]
    }
  }
]
```

- Create the entity before the operation that uses it; a `{ "ref" }` only points
  to an earlier creation of the right kind. Existing characters and locations
  are named by the IDs `get_story_structure` returns.
- Use `update_character` and `update_location` to change only the listed fields.
- Conditions use `{ characterId, isPresent }` and `{ locationId, isCurrentLocation }`.
- IDs in the preview are provisional: the summary names created entities by
  `ref`. Check the result after the commit with `get_story_structure`, which
  lists the characters and locations.

### Required sequence

The server instructions tell the assistant to:

1. read the story (`list_stories`, `get_story_structure`, `get_interaction`);
2. build one batch;
3. preview it, with `expectedRevision` set to the revision it read;
4. present the summary, diagnostics and warnings to the author;
5. ask for explicit confirmation;
6. commit the `proposalId` of that preview;
7. verify the result by reading the story again.

What the server guarantees, through the API: a commit only applies a batch the
API previewed and stored, exactly, on the previewed revision, for the same
user, at most once, all or nothing, after checking edit access again. A changed story is
refused with `STORY_REVISION_CONFLICT`.

What it cannot guarantee: that a human saw and approved the preview. Steps 4
and 5 depend on the assistant and the MCP client; a client that auto-approves
tool calls can commit without asking. Configure the client to ask before
`commit_story_changes` if you need that guarantee.

The API stores each valid preview for one hour; `commit_story_changes` only
sends its `proposalId`, so the commit applies exactly what was previewed, even
after the MCP server restarts. An expired or unknown proposal fails with
`STORY_CHANGE_PROPOSAL_NOT_FOUND`: preview again. A commit whose response is
lost (`WRITE_OUTCOME_UNKNOWN`) can be retried with the same `proposalId`: the API
answers `already_applied` instead of applying it twice. `commit_story_changes`
is annotated as destructive, so clients that honor annotations can ask before
running it.

Errors are returned as `{ error: { code, message, status?, requestId?, details?, hint? } }`.
Codes come from the API (`AUTHENTICATION_REQUIRED`, `FORBIDDEN`,
`STORY_NOT_FOUND`, `STORY_REVISION_CONFLICT`, `STORY_CHANGE_PROPOSAL_NOT_FOUND`,
`STORY_CHANGES_INVALID`, `RATE_LIMITED`, ...) or from the adapter
(`API_UNREACHABLE`, `API_CONTRACT_MISMATCH`, `INTERACTION_NOT_FOUND`,
`WRITE_OUTCOME_UNKNOWN`).

The direct write tools of the first prototype (`create_interaction`,
`update_interaction`, `create_trigger`) were removed so that every MCP write
goes through preview and commit.

Not exposed: deletion, groups, stats, items (and their assignments), access and
collaborator changes, administration, imports and whole-graph replacement.

## Demo

With the API running, the server built and `login` done, create a story named
"La dernière transmission" in the editor, then run:

```bash
node apps/mcp/scripts/demo.mjs "La dernière transmission"
```

The script launches the server over stdio like an MCP client, lists the story,
reads its structure and previews one batch: "Le message crypté" after the first
interaction and three branches, two of them conditional. It prints the summary,
asks `Apply these changes to the story? (yes/no)`, commits on `yes` and reads
the result back. Open editors reload through the usual live update; the batch is
one "Grouped changes applied" entry in the Story history, which undo and redo
revert and restore.

Equivalent assistant prompt: _Open the story "La dernière transmission". Analyse
its structure. Propose a scene in which the protagonist discovers an encrypted
message, with three branches and conditions. Show me the changes before
applying them._

## Tests

- `npm run test -w @paralleax/mcp`: tools through a real MCP client and server
  against a stubbed HTTP edge (contracts, errors, input validation, token
  handling, preview and commit flow).
- End-to-end: the real MCP tools against the built API and PostgreSQL, with
  real accounts, sessions and permissions, including one preview and commit
  through the built stdio server. CI runs it in the `mcp` job. Locally,
  build the API and the MCP server, then give a dedicated database whose name ends with `_test`
  (the script migrates it and fills it with test accounts and stories):

```bash
npm run build -w @paralleax/shared && npm run build -w @paralleax/api && npm run build -w @paralleax/mcp
```

```bash
MCP_E2E_DATABASE_URL=postgres://paralleax:paralleax@localhost:5432/paralleax_mcp_test npm run test:e2e:api -w @paralleax/mcp
```

The script starts the API on port 3100 (`MCP_E2E_API_PORT`) with a small
interaction quota, runs the spec and stops the API. To use an API you already
started, set `PARALLEAX_MCP_E2E_API_URL` and run `npm run test:e2e -w @paralleax/mcp`.
The API allows five registrations per minute, so wait a minute between runs.

## Limitations

- Local development API only. In production `OriginGuard` refuses `login` and
  writes from a non-browser client; the adapter does not forge `Origin`.
- The stored session is a full account session (30 days), not a scoped,
  read-only or per-story credential.
- Human confirmation before a commit depends on the assistant and the MCP
  client (see [Required sequence](#required-sequence)).
- Batches support creating and updating interactions, Triggers, characters and
  locations only, up to 100 operations and the API's 128 KiB request body. A preview loads the
  complete Story.
- Previews can be committed for one hour; each user keeps at most 20.
- Session file protection is verified on Linux and macOS only, not on Windows.
- `get_interaction` loads the complete Story; `get_story_structure` makes six
  requests per page. Both count against the API rate limits.
- Rich text links to other interactions are read but not authored by the tools.

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
   Preview/diff/commit batches with stale-revision rejection, previously listed
   as a fourth prerequisite, now exist ([ADR-050](decisions/ADR-050-editorial-change-batches.md)).

Rough estimate for one developer: 2 to 3 weeks for steps 1 to 3 (OAuth and
token lifecycle are most of it), plus security review and deployment work.
