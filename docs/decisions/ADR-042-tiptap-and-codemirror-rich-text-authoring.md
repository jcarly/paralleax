# ADR-042 - Tiptap and CodeMirror for Rich Text Authoring

**Status:** Accepted  
**Date:** 2026-10-26

**Scope amendment (2026-10-26):** The technology and canonical-storage choices
below remain accepted. The later author brief supersedes the initial requirement
to use an existing source language and not create a Paralleax syntax. The new
direction is a native, Ink-inspired content syntax, still only proposed in
[ADR-043](ADR-043-ink-inspired-narrative-source.md). This amendment does not
accept a grammar or enable source editing.

**Interaction amendment (2026-10-27):** In both the Inspector and Simulation,
existing content stays in place as an editable field and reveals the WYSIWYG
toolbar when focused. Simulation keeps the interactive Reader projection while
the field is idle. Empty content shows only **Add content**; leaving an empty
editor returns to that action. The separate **Edit content** and **Done** actions
are removed. This changes the authoring interaction only; Reader evaluation and
navigation semantics stay canonical.

## Context

Interaction content is currently edited through a custom `contentEditable`
implementation. Its DOM mutation, selection restoration, and `execCommand`
paths duplicate editor behavior and are difficult to maintain. The migration
also includes an editable CodeMirror source mode. The author requires
conditional blocks to appear as `if` statements in a readable source form, so the
source grammar is not settled by this ADR. The existing authored contract is
sanitized `Interaction.body` HTML plus canonical `conditionalTextBlocks`; Reader
projections and shared condition evaluation already consume that contract.

The migration must preserve stored stories and the existing persistence,
revision, comment, and Reader behavior. It must not add a second persisted
representation or make an editor library responsible for narrative semantics.

## Decision

- Use Tiptap OSS / ProseMirror for visual editing and CodeMirror 6 for the
  planned source mode. Keep both as representations of the same interaction
  content. Define and validate the source grammar in a follow-up decision before
  exposing that mode; see the proposed direction in ADR-043.
- Keep `Interaction.body` sanitized HTML as the persisted content and keep
  `conditionalTextBlocks` as the canonical store of structured conditions.
  Changes to the body and condition records continue through the existing
  interaction update operation.
- Put Paralleax-specific parsing, serialization, validation, and stable-reference
  handling in focused web modules and Tiptap extensions. Reuse shared condition
  and stat rules; do not add a second evaluator or a new persistent document
  model.
- Validate source edits before applying them to the visual document or sending
  them to persistence. Unsupported or lossy input remains a recoverable local
  draft and cannot replace canonical content.
- Keep Tiptap as a lazy-loaded module. In the Inspector, load it when a
  non-empty editable body is shown or an author starts adding an empty body;
  reveal the formatting toolbar and expanded surface on focus. CodeMirror loads
  only after the source view opens. Keep editor history local to the current
  editing session; applying content uses the existing persistence path and
  therefore the canonical Story history.
- Use the same editor in the interaction inspector and Simulation. Existing
  Inspector content remains in a compact editable field; Simulation keeps its
  interactive Reader projection at rest. Focus opens Tiptap in the same place.
  Empty content shows only **Add content**, and an empty draft returns to that
  action when focus leaves.
- Do not add a database migration, collaboration/CRDT layer, or cloud editor
  service in this migration. Keep the source language separate from runtime
  behavior and canonical Story semantics.

## Consequences

The editor must model the existing allowed HTML and narrative markers explicitly
and prove representative parse/serialize round trips before replacing the old
editor. Invalid source drafts need protection from mode changes and navigation.
Reader rendering, availability rules, and runtime condition evaluation remain
independent of the authoring implementation.

The exact source grammar, supported condition subset, and rich-content conversion
remain open. Code must preserve each frame's stable id and map supported
conditions to existing `TriggerCondition` records. Source syntax cannot introduce
a second evaluator or bypass canonical record validation and the atomic save
path. The current `ConditionalTextBlock` shape stores AND conditions and no
`else` branch; see ADR-043 for the proposed grammar direction and open decisions.
