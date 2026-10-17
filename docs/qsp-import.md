# QSP Import

Paralleax includes an experimental QSP adapter for inspecting games as a Story
graph. It is an adapter, not a QSP runtime, and it does not change the
Paralleax narrative model to reproduce QSP execution semantics.

## Author workflow

From the signed-in `Stories` library, select `Import a story`, choose `QSP game`,
then select either one game file or one collection of location files:

- a compiled `.qsp` or `.gam` game;
- a UTF-8 `.qsps`, `.qsp-txt`, or `.txt-qsp` source file;
- all UTF-8 `.qsrc` files from a QSP `locations` directory, selected together.

Compiled/text game files and `.qsrc` collections are two inputs to the same
adapter. A location collection is packaged by the browser for one atomic API
request; it does not create a parallel QSP model or persistence workflow. When
the collection contains a location named `start`, it is placed first and used as
the likely Story entry. Otherwise, selected source order is retained.

The standard request boundary accepts one file up to 80 KiB. Administrators use
an authenticated binary upload with no Paralleax application-level size limit;
the bundled production Nginx proxy disables its normal 128 KiB boundary only for
this exact route and forwards the body without request buffering. Infrastructure
in front of that container may still enforce its own request limit. A successful
analysis displays report counts and a stable coverage matrix. When
the report contains warnings but no blocking error, no Story is persisted until
the author explicitly confirms the import. Confirmation resubmits and reanalyses
the same source before creating one private Story atomically. A clean report is
persisted immediately. An invalid game, duplicate location name, or unresolved
static `GOTO` target rejects the import before anything is persisted and still
returns the report counts and statistics. Successful responses contain Story
summary metadata rather than the complete Story. The interface displays the
warning and error counts, and the full JSONL report from any outcome is available
through the authenticated `GET /api/imports/:importId/report` download endpoint.
An interpolated or otherwise calculated navigation target is not treated as a
missing static location: it is skipped, retained as a localized compatibility
warning, and the rest of the game remains importable for inspection.

QSP and ChoiceScript use the shared `ImportDiagnostics` contract for warning
and error counts. The API sends each issue to the file-backed report writer
through `onIssue`, while `maxPreviewIssues: 0` prevents the import response from
retaining detailed diagnostics in memory. Counts remain complete when the issue
preview is empty.

For administrator uploads, the dialog displays the measured percentage of bytes
sent. Once the upload reaches 100%, and for all standard imports, it displays
the current QSP analysis phase, its completed/total work count, and source
file when available. The shared importer reports decoding, location parsing,
and mapping work on the first item, every 25 items, and the final item. The API
runs that synchronous analysis in a worker thread, so the API thread can
continue serving requests. An authenticated, user-private SSE stream relays
those worker messages to the import dialog; its random identifier is ephemeral
and is never persisted. Closing the dialog aborts the request and terminates
the active worker. Confirming a warning report opens a new stream, uploads, and
analyses the source again before Story creation.

Compiled and text formats are decoded with the official MIT-licensed
`@qsp/converters` package. Text-source command analysis remains Paralleax code so
it can produce source locations and compatibility issues before canonical mapping.

## Pipeline and ownership

```text
QSP game file or .qsrc location collection
  -> API request validation and source decoding
  -> QSP worker thread: official format decoding per game/source file
  -> QSP worker thread: locations, static actions, and statement analysis
  -> compatibility issues and coverage matrix
  -> Paralleax interactions and triggers
  -> worker result returned to the API
  -> author confirmation when warnings exist
  -> API-owned atomic persistence
```

The deterministic adapter lives in `packages/shared/src/import-export/qsp/`.
It depends on no React, NestJS, browser, PostgreSQL, or QSP runtime. The API
validates and decodes the request, then delegates decoding, analysis, and mapping
to a Node.js worker thread. It receives the complete result and remains
responsible for warning confirmation and PostgreSQL persistence. A temporary
per-API-instance limit allows one active QSP worker import. The web library
reuses the existing import modal and report presentation.
If a worker cannot complete an import, the API returns the same complete QSP
report shape with a blocking `import_execution_failed` issue, so it remains
visible and downloadable. Binary source buffers are transferred to the worker
rather than cloned; active workers are terminated during graceful API shutdown.
Warning confirmation does not create temporary server state: the existing import
endpoint accepts `confirmWarnings`, reanalyses the submitted source, and persists
only that confirmed result. The progress stream is transport-only state: it does
not retain a source, report, job, or imported Story.

No QSP identity map or foreign runtime state is persisted. Incremental re-import,
QSP re-export, and lossless round-tripping are not part of this adapter.

## Current mapping

The first vertical slice converts:

- the first QSP location to the Story entry interaction;
- every readable location to an interaction;
- compiled actions and statically declared `ACT 'label': ... END` blocks to
  titled option interactions;
- compiled descriptions, bare literal strings, and literal `P`, `PL`, `*P`,
  `*PL`, and `NL` output to escaped rich text;
- literal strings and constant numeric assignments using `=`, plus constant
  numeric `+=` and `-=`, to existing Story-assigned typed stats and interaction
  effects. Numeric constants support parentheses, unary signs, `+`, `-`, `*`,
  and QSP integer `/` division;
- numeric and string array cells with literal numeric or string indices to
  separate typed stats. Cell `[0]` aliases the unindexed variable as it does in QSP;
- simple variable truthiness and comparisons with literal strings or constant
  numeric expressions in action-only `IF` / `ELSEIF` / `ELSE` blocks to Trigger
  conditions, including nested blocks and parenthesized `NO`, `AND`, and `OR`
  expressions. Earlier branches are negated for every later branch so QSP's
  sequential exclusivity is preserved;
- static `GOTO` and `GT` destinations to graph reachability;
- top-level literal `IF $ARGS[0] = 'value'` blocks to separate interactions, and
  the first literal `GOTO`/`GT` argument to the corresponding interaction. An
  empty `ARGS[0]` selector remains on the base location interaction. Repeated
  independent blocks for the same value are merged into that variant in source
  order, matching QSP's sequential execution;
- alternative incoming paths to one unconditional Trigger owned by their output
  Interaction;
- the source filename to the Story title;
- deterministic initial graph positions through the shared import layout helper.

All imported rich text is escaped. Static targets are matched case-insensitively,
as QSP location names are. Targets containing QSP runtime interpolation such as
`'room_<<$state>>'` cannot be resolved statically, so no speculative graph edge
is created for them and the report identifies the source line.

Before statement analysis, the adapter runs one lexical pass across each location
or action. It preserves physical line slots while excluding line comments,
`!{ ... !}` block comments, quoted strings (including strings spanning lines),
and command separators inside quoted text. This prevents examples embedded in
comments or `DYNAMIC` source from becoming navigation or actions. Diagnostic
`lineKind` is `text` for decoded text source and `location-code` for compiled
QSP, where the converter only exposes a position relative to the location code.

QSP executes `GOTO` immediately. Paralleax currently has no automatic transition,
so the mapped destination appears as an additional reader choice. The report
always marks this semantic difference where it occurs. A QSP location with no
supported incoming path is retained for graph inspection, exposed as a root
interaction, and reported as an approximation.

## Coverage report

The import response contains source counts, converted/approximated/unsupported
statement counts, warning/error totals, and a stable feature matrix. The full
source-positioned issues are streamed to the downloadable JSONL report. Every
detected warning and blocking error is retained without an issue-count limit;
statement and feature occurrence counters remain exact.
The matrix reports three states:

- `supported`: locations and entry discovery;
- `partial`: literal text and assignments, simple action conditions, static
  actions, and static navigation;
- `unsupported`: subroutines, local jumps, loops, dynamic code, inventory,
  media/UI, runtime events, QSP saves/input, and libraries.

Each matrix row includes the number of detected occurrences. Zero does not mean
that the feature is supported; it only means that the selected game did not
exercise it in code the static analyzer could identify.

The Playwright real-stack acceptance project imports two small repository-owned
`.qsrc` locations through the library UI, verifies the generated action and
literal `ARGS[0]` destination in the graph, and traverses that path in Simulation
Mode without mocking a Paralleax endpoint.

## What remains for runtime-equivalent support

Complete QSP compatibility would require several source concepts that do not yet
have equivalent import behavior:

- ordered imperative execution within locations and actions, including immediate
  automatic transitions and early `EXIT` behavior;
- assignments or comparisons that read runtime variables, local variables,
  dynamic or last-cell array indices, array-wide lookup/mutation/reordering,
  tuples and multidimensional indices, calculated names, system variables,
  string concatenation, multiplication/division effects, and the complete QSP
  coercion rules;
- general `IF` / `ELSEIF` / `ELSE` execution, apart from top-level literal
  `ARGS[0]` location variants, including conditional prose, assignments or
  navigation, dynamically declared actions, and branches with side effects.
  Only nested action-only branches with reducible stat expressions are currently
  lowered to Trigger condition groups;
- `GOSUB`, `GS`, `FUNC`, arguments, local scope, return values, recursion, and
  call-stack behavior. A possible native, ordered Interaction-inclusion model is
  recorded as an unaccepted [product proposal](interaction-inclusion-proposal.md);
- local labels, `JUMP`, loops, and dynamic code evaluation;
- mutable action lists (`ACT`, `DELACT`, `CLA`) and actions generated conditionally
  or dynamically;
- object inventory commands and selection events mapped deliberately to existing
  Paralleax item definitions and instances;
- media playback, images, menus, hyperlinks, input, windows, timers, waits, and
  other player UI behavior;
- service locations and engine events such as counters, new-location hooks,
  object selection, user commands, and save/load hooks;
- project manifests, source includes, and included libraries. A flat collection
  of `.qsrc` location files is supported, but project build configuration and
  dependencies are not resolved;
- QSP save/load compatibility and migration into deterministic Paralleax journeys;
- background uploads for very large games;
- licensed compatibility corpora that exercise every supported command family.

Simple global variables, literal-index array cells, and action conditions now
reuse typed Story stats, interaction effects, and Trigger condition groups.
Inventory objects can later reuse items. Other concepts, especially imperative
execution, automatic transitions, dynamic code, engine events, and UI commands,
need explicit product decisions rather than silent approximations.

Technical references:

- [Official QSP converters](https://github.com/QSPFoundation/converters)
- [QSP language statement documentation](https://dev.qsp.org/docs/language/qsp-keywords/qsp-keywords-statements/)
- [QSP array-index syntax](https://dev.qsp.org/docs/language/qsp-keywords/qsp-keywords-syntaxems/)
- [QSP location documentation](https://wiki.qsp.org/help:locations)
- [QSP engine repository](https://github.com/QSPFoundation/qsp)
