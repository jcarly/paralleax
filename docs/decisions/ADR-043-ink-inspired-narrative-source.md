# ADR-043 - Ink-Inspired Narrative Content Source

**Status:** Proposed  
**Date:** 2026-10-26

## Context

The accepted [ADR-042](ADR-042-tiptap-and-codemirror-rich-text-authoring.md)
replaces the custom visual editor with Tiptap and reserves CodeMirror for a
future source view. The author has since specified that this view should use a
concise native Paralleax content syntax inspired by Ink, rather than HTML or an
existing template language. The authoring goal is two editable representations
of the same Interaction content.

The current canonical contract is:

- `Interaction.body` is sanitized HTML, limited to the current allowlist.
- Inline variable and Interaction references are inert HTML markers containing
  stable assignment, exact-item, or Interaction ids. Readable names are
  projections and may change.
- A structured conditional frame stores its stable block id in the HTML body;
  its conditions are canonical `ConditionalTextBlock` records on the Interaction.
- A block has one or more typed `TriggerCondition` values. These values are
  combined with AND and validated through the existing domain/API paths.
- Body and condition records are saved together through the existing atomic
  Interaction mutation and Story history path. The Reader uses the shared
  evaluator; no editor owns runtime semantics.

This proposal is intentionally limited to the content inside one Interaction.
It does not design the global Story Script language. That later P2 surface would
need to represent Interactions, Triggers, condition groups, effects, transitions,
and non-text Story metadata, then apply a reviewed targeted change set. It must
not be smuggled into the content syntax or implemented as part of the Tiptap
migration.

## Constraints

- Keep one canonical Story model and one Reader/runtime engine.
- Do not add an Ink interpreter, template runtime, JavaScript execution,
  author-defined functions, effects, variables, Triggers, or transitions to the
  content source.
- Reuse existing typed stat references, condition validation, deterministic
  evaluation, sanitization, atomic writes, and Story history.
- Conditional content remains AND-only. The current model has no conditional
  `else`, `or`, or `elseif` representation; source text must not imply one.
- Keep the source draft local until parsing, reference resolution, schema/domain
  validation, and conversion all succeed. Switching modes does not save.
- Do not add a database migration or persist a second authored source document.
- Treat Ink as an inspiration, not a compatibility promise. An import/export
  adapter for Ink or another system is a later, separately scoped project.

## Candidate Grammar Sketch

The following is an experiment to make a prototype concrete; none of its tokens,
escaping, or formatting rules are accepted. It borrows plain-text prose,
paragraphs, headings, and a compact braced conditional shape from Ink, while
using explicit Paralleax ids in references.

```text
## The old house

You find {{stat:@assignment-id|Mira.Trust}} beside the gate.

{if stat(@assignment-id) >= 50 and visited(@interaction-id) [id=@block-id]:
  Mira welcomes you with a smile.

  [[interaction:@next-interaction-id|She opens the door.]]
}
```

Possible initial mappings to prototype:

- Markdown-like paragraphs, headings, `**bold**`, `*italic*`, and lists map to
  the matching supported Tiptap nodes/marks.
- `{{stat:@assignment-id|Mira.Trust}}` reads the stable assignment id; the
  human-readable path is a label only. The exact-item form would also include
  the stable item-instance id.
- An `if` frame names the existing conditional block id. Each condition clause
  maps to one existing `TriggerCondition`; multiple clauses are AND. Conditions
  may reference existing stat expressions, visited Interactions, context, items,
  and temporal values only where a typed lossless mapping exists.
- `[[interaction:@id|label]]` maps to the existing inert Interaction-link
  marker. Activating it in Reader still follows normal Trigger availability.
- Media and rich HTML need explicit lossless forms or a protected opaque-node
  representation. If a draft cannot preserve a node, it cannot be applied.

The inline form of conditional content, escaping, nested blocks, full condition
coverage, comments, and media syntax are unresolved. The prototype must test
these against real existing Stories before any concrete syntax is accepted.

## Language and Parser Feasibility

Ink provides readable plain-text narrative, variable interpolation, braced
conditional content, and many broader capabilities such as choices, knots,
diverts, logic, and procedural sequences. Its conditional and variable notation
is useful inspiration, but adopting Ink's runtime concepts would exceed this
content editor's boundary. See the
[official Ink writing guide](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md).

Liquid uses `{% if ... %}` / `{% endif %}` and includes `elsif`, `else`, `and`,
and `or`. Those constructs describe a general template language whose data and
expression behavior do not match Paralleax's constrained typed condition records.
Embedding Liquid would either reject much of its apparent language or risk
implying unsupported semantics. See
[Shopify's Liquid `if` reference](https://shopify.dev/docs/api/liquid/tags/if)
and [Liquid basics](https://shopify.dev/docs/api/liquid/basics).

Yarn Spinner uses explicit `<<if>>...<<endif>>`, also supports `elseif` and
`else`, and includes node, command, and option-flow concepts. Its delimiters can
inform readability tests, but its flow model and runtime are not the Paralleax
content model. See the
[official Yarn Spinner flow-control guide](https://docs.yarnspinner.dev/2.0/getting-started/writing-in-yarn/flow-control).

The project currently has CodeMirror 6 and Lezer runtime packages in the
dependency tree, but no dedicated narrative grammar or source parser. Lezer is a
reasonable prototype candidate for syntax trees, editor highlighting, and
incremental parsing; its error recovery must not be mistaken for valid source.
A strict semantic pass must still resolve stable ids, produce positioned
diagnostics, map to typed canonical records, and reject unsupported or lossy
input. Do not add a parser package until the prototype compares the smallest
maintainable option against the actual grammar. Parser and reference-resolution
logic should stay framework-independent; keep CodeMirror/Tiptap bindings in
`apps/web`. Move the parser into `packages/shared` only if another layer needs
the same source conversion.

## Conversion and Identity Requirements

- Serialize from the canonical `body` plus `conditionalTextBlocks`; never parse
  only HTML while silently omitting canonical condition records.
- Parse source to a typed intermediate representation with source spans, then
  resolve references against the current same-Story authoring projection.
- Store the existing ids in source for variable assignments, exact item
  instances, linked Interactions, and conditional blocks. A readable name/path
  may accompany an id but must not become identity.
- Detect missing, deleted, duplicate, ambiguous, wrong-Story, and wrong-type
  references with actionable source-position diagnostics. Rename should update
  projected labels without changing ids.
- Preserve conditional block ids across visual/code mode switches. Define copy,
  paste, and deliberate duplication behavior before implementing source editing.
- Make the serializer/parser pair deterministic and compare canonical content
  data, including ids, formats, media, links, and condition values, in round-trip
  tests. If an existing node is not representable, mark the draft unsupported
  and block apply rather than removing or degrading it.
- Applying a valid source draft sends the same body and condition fields through
  the existing mutation. Invalid drafts remain recoverable locally; they do not
  create Story history or alter Reader output.
- Preserve source-to-rendered text offsets or explicitly re-anchor comments when
  formatting, inline markers, or conditional spans change.

## Boundaries Between Content and Story Script

| Capability                              | Interaction content source       | Future Story Script                      |
| --------------------------------------- | -------------------------------- | ---------------------------------------- |
| Rich text and media                     | Yes, when conversion is lossless | Reuse content source                     |
| Read an existing variable               | Yes, by stable id                | Yes                                      |
| Show content under existing conditions  | Yes, canonical AND blocks        | Yes, through the same condition model    |
| Link to an existing Interaction         | Yes, no availability bypass      | Yes, as part of explicit Story structure |
| Define/delete Interactions              | No                               | Future scope                             |
| Create/edit Triggers and routes         | No                               | Future scope                             |
| Modify stats or inventory               | No                               | Future scope; typed effects only         |
| Define transitions or runtime functions | No                               | Explicitly bounded by a separate design  |
| Procedural/variant text                 | No for this migration            | Future model/engine decision             |

The Story Script must retain graph positions and other non-text metadata even
when they are omitted from source. Its future importer should parse and validate,
resolve ids, calculate a targeted diff, preview additions/changes/deletions,
check revision conflicts, then apply atomically through canonical operations and
history. A failed script must never replace a whole Story. None of that global
script work is included here.

## Delivery Plan

1. **Tiptap visual migration:** retain current HTML and condition contracts;
   validate the Inspector/Simulation journey, sanitization, Reader output,
   history, comments, media, and persisted Story compatibility.
2. **Content-source prototype:** collect representative simple and complex
   Interactions; compare Ink/Liquid/Yarn conventions; test a small grammar,
   parser, diagnostics, reference rendering, and round-trip equality. Record the
   accepted subset and unresolved gaps before building the full mode.
3. **CodeMirror mode:** implement only the accepted grammar, lazy-load it,
   preserve local invalid drafts, show actionable diagnostics, and apply valid
   changes through the existing Tiptap and persistence operations. Add unit,
   component, and Playwright coverage for switching and saving.
4. **Later content enhancements:** consider broader typed-condition/media
   coverage and procedural text only after separate deterministic model and
   runtime semantics are accepted.
5. **Separate P2 Story Script:** design the full Story syntax and targeted change
   lifecycle in its own decision and delivery plan.

## Decisions to Validate Before Code-Mode Implementation

- Which `TriggerCondition` variants and expression forms are included in the
  first supported source subset; how excluded existing conditions remain
  lossless and editable.
- Exact inline and multi-paragraph condition delimiters, id annotation,
  condition-clause formatting, nesting, escaping, and comment syntax.
- Which current rich HTML/media nodes can be rendered without loss, and whether
  unsupported content blocks editing, remains an opaque source token, or requires
  a separate technical view.
- How source display names refresh on rename while ids remain stable, and how
  unresolved or duplicated references behave after paste/import.
- How copy/paste and explicit duplication mint ids without leaving references to
  the wrong canonical block.
- Whether a Lezer grammar plus strict semantic conversion is simpler to maintain
  than another existing parser library or a small focused parser.
- Whether the prototype's Inspector and Simulation mode-switch journey makes
  invalid drafts, apply, discard, Reader preview, focus, keyboard, and unsaved
  change state clear to authors.

This ADR stays Proposed until those decisions have a concrete prototype and the
author has reviewed the resulting source/visual journey. The open items live in
[Editor Technology](../open-questions.md#editor-technology).
