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
import creates one private Story atomically and displays both source-specific
warnings and a stable coverage matrix. An invalid game, duplicate location name,
or unresolved static `GOTO` target rejects the import before anything is persisted.
An interpolated or otherwise calculated navigation target is not treated as a
missing static location: it is skipped, retained as a localized compatibility
warning, and the rest of the game remains importable for inspection.

For administrator uploads, the dialog displays the measured percentage of bytes
sent. Once the upload reaches 100%, it switches to an indeterminate analysis and
Story-creation indicator until the atomic server operation completes. Paralleax
does not present that second phase as a percentage because the current importer
does not expose parser or persistence work units.

Compiled and text formats are decoded with the official MIT-licensed
`@qsp/converters` package. Text-source command analysis remains Paralleax code so
it can produce source locations and compatibility issues before canonical mapping.

## Pipeline and ownership

```text
QSP game file or .qsrc location collection
  -> official format decoding per game/source file
  -> locations, static actions, and statement analysis
  -> compatibility issues and coverage matrix
  -> Paralleax interactions and triggers
  -> API validation and atomic persistence
```

The deterministic adapter lives in `packages/shared/src/import-export/qsp/`.
It depends on no React, NestJS, browser, PostgreSQL, or QSP runtime. The API
decodes the request, supplies IDs and timestamps, and persists the complete
Story. The web library reuses the existing import modal and report presentation.

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
- literal numeric and `$`-prefixed string assignments using `=`, plus numeric
  `+=` and `-=`, to existing Story-assigned typed stats and interaction effects;
- numeric and string array cells with literal numeric or string indices to
  separate typed stats. Cell `[0]` aliases the unindexed variable as it does in QSP;
- simple variable truthiness and literal comparisons in action-only `IF` /
  `ELSEIF` / `ELSE` blocks to Trigger conditions, including parenthesized `NO`,
  `AND`, and `OR` expressions. Earlier branches are negated for every later
  branch so QSP's sequential exclusivity is preserved;
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

QSP executes `GOTO` immediately. Paralleax currently has no automatic transition,
so the mapped destination appears as an additional reader choice. The report
always marks this semantic difference where it occurs. A QSP location with no
supported incoming path is retained for graph inspection, exposed as a root
interaction, and reported as an approximation.

## Coverage report

The returned `QspImportReport` contains source counts, converted/approximated/
unsupported statement counts, localized issues, and a stable feature matrix.
To keep very large source collections bounded, it retains at most 2,000 detailed
warnings and reports the remaining number in `omittedWarningCount`; blocking
errors are never omitted. Statement and feature occurrence counters remain exact.
The matrix reports three states:

- `supported`: locations and entry discovery;
- `partial`: literal text and assignments, simple action conditions, static
  actions, and static navigation;
- `unsupported`: subroutines, local jumps, loops, dynamic code, inventory,
  media/UI, runtime events, QSP saves/input, and libraries.

Each matrix row includes the number of detected occurrences. Zero does not mean
that the feature is supported; it only means that the selected game did not
exercise it in code the static analyzer could identify.

## What remains for runtime-equivalent support

Complete QSP compatibility would require several source concepts that do not yet
have equivalent import behavior:

- ordered imperative execution within locations and actions, including immediate
  automatic transitions and early `EXIT` behavior;
- calculated assignments, local variables, dynamic or last-cell array indices,
  array-wide lookup/mutation/reordering, tuples and multidimensional indices,
  calculated names, system variables, string concatenation,
  multiplication/division effects, and the complete QSP coercion rules;
- general `IF` / `ELSEIF` / `ELSE` execution, apart from top-level literal
  `ARGS[0]` location variants, including conditional prose, assignments or
  navigation, dynamically declared actions, and branches with side effects.
  Only action-only branches with reducible stat expressions are currently
  lowered to Trigger condition groups;
- `GOSUB`, `GS`, `FUNC`, arguments, local scope, return values, recursion, and
  call-stack behavior;
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
- a dry-run/downloadable full report and background uploads for very large games;
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
