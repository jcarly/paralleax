# ChoiceScript Import

Paralleax includes an experimental ChoiceScript adapter for small compatibility
tests. It is not a general Paralleax import/export format and does not make the
ChoiceScript runtime part of the Paralleax engine.

## Author workflow

From the signed-in `Stories` library, select `Import ChoiceScript` beside
`New story`, then select every `.txt` scene file in the project. A successful
import creates one private Story and displays a compatibility report before the
author opens the graph.

The current request boundary accepts:

- 1 to 50 `.txt` files;
- at most 64 KiB per file;
- at most 96 KiB of ChoiceScript source in total.

The whole Story is persisted in one PostgreSQL transaction. A missing file from
`*scene_list`, duplicate scene or label, unresolved jump, or choice without
readable options rejects the import before a Story is written.

## Pipeline and ownership

The adapter follows the repository import boundary:

```text
ChoiceScript source files
  -> parsed scenes and statements
  -> compatibility issues
  -> Paralleax interactions, triggers, and typed stats
  -> API validation and atomic persistence
```

Parsing, deterministic mapping, and reporting live in
`packages/shared/src/import-export/choicescript/`. They have no React, NestJS,
browser, database, or ChoiceScript-runtime dependency. The API supplies IDs and
timestamps and owns the transaction. The web library only reads local files,
sends one request, and renders the report.

Representable source state is lowered to the existing Paralleax stat definitions,
typed owner assignments, interaction effects, trigger conditions, and inert
rich-text markers. No parallel variable model or ChoiceScript-specific runtime
state is added to the canonical Story. React Flow remains a projection of the
imported domain objects.

ChoiceScript variable names are kept in a transient in-memory lookup map only
while the adapter resolves assignments, effects, conditions, and interpolation.
The persisted Story contains Paralleax ids and author-facing names, but no source
identity mapping. ChoiceScript re-export and incremental re-import are therefore
not part of this adapter's contract.

## Current mapping

The prototype converts:

- `*title` to the Story title;
- `*scene_list` to scene order and `*finish` destinations;
- prose blocks to interaction bodies, escaped before being stored as rich text;
- `*choice` and `*fake_choice` options to titled interactions;
- nested choices to nested interaction branches;
- `*label`, `*goto`, and `*goto_scene` to graph reachability;
- `*ending` to a terminal branch;
- `*line_break` to a paragraph boundary;
- `*create` literals to Story-assigned number, boolean, or string stats;
- scene-scoped `*temp` literals to namespaced Story assignments with an explicit
  reset effect when the scene interaction is selected;
- literal `*set` and numeric relative assignments to ordered `set`/`add` effects;
- simple truthy, negated, and literal comparison option conditions to typed
  trigger conditions;
- simple `${variable}` substitutions to sanitized inert interpolation markers.

Alternative incoming jumps to the same passage become multiple input
Interactions on that passage's one unconditional Trigger. This preserves the
Paralleax rule that one Trigger belongs to exactly one output Interaction and
that its input Interactions are alternative reachability sources.

Initial positions use a deterministic top-to-bottom layered projection. Authors
can then use the editor's complete or scoped automatic layout.

## Explicit approximations

Commands or expressions that cannot be represented by the current Paralleax
model are not executed. The import report identifies their source file and line.
Current examples include:

- `*rand`, array commands, calculated assignments, and dynamic variable types;
- block `*if`, `*elseif`, and `*else`, compound boolean expressions, and
  conditional options whose expressions are not simple typed comparisons;
- `*gosub`, `*gosub_scene`, `*params`, and `*return`;
- input, media, link, page-break, achievement, and stat-screen commands;
- computed or indirect text substitutions.

An unsupported conditional option is imported as always reachable. Unsupported
commands are removed while surrounding authored prose is retained. This means a
Story with warnings is suitable for graph inspection and manual adaptation, not
as proof of runtime-equivalent execution.

Unlike ChoiceForge's pragmatic importer, Paralleax does not yet have a canonical
place to preserve unconverted raw scene source. The report is therefore mandatory
and the UI does not claim lossless round-tripping.

## Compatibility corpora and licensing

The adapter is regression-tested with synthetic, repository-owned fixtures. On
2026-08-22 it was also checked locally, without copying sources into Paralleax,
against:

- the seven `.txt` files in the official ChoiceScript `web/mygame/scenes`
  example: it produced a Story with 33 interactions and no structural import
  error, while reporting unsupported state, subroutine, link, and page-break
  commands;
- the four `.txt` files in CSLIB `examples/char_creator`: it produced a Story
  with 8 interactions and no structural import error, with the expected larger
  report for variables, arrays, conditions, input, random values, and
  cross-scene subroutines.

Those external sources are not Paralleax fixtures. The ChoiceScript repository's
license permits non-commercial use under its terms, while CSLIB is MIT-licensed.
Importing content never grants rights to use it: the author remains responsible
for the selected source and assets. In particular, do not turn publicly readable
commercial game sources into bundled test data without permission.

Technical references:

- [ChoiceScript official repository and example](https://github.com/dfabulich/choicescript/tree/main/web/mygame/scenes)
- [ChoiceScript license](https://github.com/dfabulich/choicescript/blob/main/LICENSE.txt)
- [CSLIB examples](https://github.com/ChoicescriptIDE/cslib/tree/main/examples)
- [ChoiceForge importer and graph editor](https://github.com/viniman27/ChoiceForge)

## Next compatibility steps

Before treating this as a production bulk importer, Paralleax still needs:

- a source-neutral retained representation for unsupported source;
- richer source expressions lowered to a source-neutral intermediate form;
- dry-run analysis before creation and a downloadable full report;
- folder/ZIP and multi-megabyte background upload with progress and rollback;
- source attribution metadata, if provenance later becomes a product requirement;
- corpus version pinning and automated licensed compatibility checks.
