# Positioning

Status: product direction, reviewed 2026-11-18. This page does not describe
implemented behaviour unless it links to [Current scope](current-scope.md).

[Vision](vision.md) says where Paralleax is going. This page says **for whom
first, against what, and how we will know it works**.

## One-line positioning

> Paralleax is a collaborative web tool for designing and testing interactive
> narratives with rich world state (characters, locations, items, time,
> variables), with a deterministic engine that can explain why a scene is or is
> not available, and a documented data format that other tools, including game
> engines, can consume.

The last clause is not shipped. The Story format and native export are the next
priority ([Roadmap → Next](roadmap.md#next)); engine integration depends on the
audience hypothesis below.

## Audience hypothesis

**Hypothesis to test first: game studios and visual-novel teams** (narrative
designers and writers working with programmers who own the engine integration).
This is not a validated decision. Professional authoring research so far gives
partial signals only (see [Product discovery synthesis](product-discovery-synthesis.md)),
which are not enough to establish this segment as the priority.

Why this audience is the first hypothesis:

- Their stories carry the world state Paralleax already models well: variables,
  inventories, time, locations, characters, probability, timers.
- They feel the pain Paralleax targets: hundreds of scenes, conditions spread
  across files or scripts, and "why can't the player reach this?" debugging.
- They already accept a separate design tool in their pipeline, so Paralleax
  does not need to replace their engine (consistent with
  [non-goals](non-goals.md)).

**Alternative audiences to compare in the same sessions:** authors publishing
interactive fiction on the web, tabletop game masters, interactive film and
storyboarding. The hosted reader and publication work (V0.9) serves them.

**Consequences if the hypothesis is confirmed**, to weigh before committing:
more dependence on engine integrations; stronger expectations on localisation,
collaboration, and version management; more direct competition with articy:draft
and Arcweave; less weight on publishing and reading on Paralleax itself.

**What would confirm or refute it:** in guided sessions, whether studio and
visual-novel participants complete the [product test](#product-test) tasks faster
or with fewer blockers than with their current tool, whether they name engine
export as a blocker to adoption, and how their results compare with the other
author profiles.

## What this audience needs from a narrative tool

| Need                                                  | Paralleax today                                                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure hundreds of scenes without getting lost     | **Shipped:** graph, auto-layout, nested Groups, search, durable undo/redo                                                                                |
| Model game state, not only branches                   | **Shipped:** typed variables and expressions, items with nested instances, calendar, probability, timers                                                 |
| Test and debug availability rules                     | **Shipped:** Simulation Mode with condition diagnostics, forced paths, seeded replay, named saves                                                        |
| Understand why a scene is unavailable, from the graph | **Planned:** Workbench `Why unavailable?` ([Workbench](workbench.md))                                                                                    |
| Work as a team                                        | **Partial:** shared editing with live reload on one server, review comments, change history. No text merge, presence, or offline queue yet               |
| Get the data into the engine                          | **Not yet:** no stable format, no export. Format and native export are the next priority; engine integration is to validate ([Roadmap](roadmap.md#next)) |
| Ship in several languages                             | **Not yet:** interface is EN/FR/IT; story content translation is undecided                                                                               |
| Write long dialogue as text                           | **Not yet:** Ink-inspired source mode proposed ([ADR-043](decisions/ADR-043-ink-inspired-narrative-source.md))                                           |

## Competitive landscape

Facts below come from the
[competitive snapshot of 2026-11-05](roadmap-history.md#competitive-reference-snapshot--2026-11-05)
where cited, and otherwise describe each tool's widely documented core approach.
Re-check before using them in public material.

| Tool               | Core approach                                                                                                | Where it is stronger than Paralleax today                                          | Where Paralleax aims to differ                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **articy:draft X** | Desktop narrative database: nested Flow, entities, templates, Document view, Simulation view, engine plugins | Mature production pipeline, engine exports, document-to-flow conversion, templates | Web and collaborative by default; deterministic, explainable availability as a first-class authoring feature |
| **Arcweave**       | Web, collaborative board for branching narrative, REST API, MCP server                                       | Real-time collaboration, engine integrations, API                                  | Richer typed world state; Simulation diagnostics; self-hostable                                              |
| **Yarn Spinner**   | Text-first dialogue language with engine runtimes                                                            | Engine integration, localisation workflow, writers in plain text and Git           | Visual structure and world state beyond dialogue; non-programmer authoring                                   |
| **Ink**            | Text-first narrative scripting language with a runtime                                                       | Writing speed for long text, mature runtime, version control                       | Visual structure, typed world model, simulation and diagnostics                                              |
| **Ren'Py**         | Visual-novel engine with its own script language                                                             | It _is_ the runtime for a large part of the visual-novel market                    | Not a competitor for the runtime; a candidate **export target** for VN teams                                 |
| **Twine**          | Browser hypertext editor, publishes standalone HTML                                                          | First contact for beginners, zero lock-in (one HTML file)                          | Structured world state and debugging at scale                                                                |

Notes:

- The 2026-11-05 snapshot explicitly says the scan **does not establish a unique
  Paralleax advantage**. articy already has a Simulation view and a Document view
  with conversion to Flow, so neither alone is a differentiator.
- For visual-novel teams, Ren'Py compatibility (export or a reference loader) is
  likely more decisive than any Unity integration. This is an inference to
  validate in guided sessions.

## Differentiation hypothesis

Paralleax is worth choosing if, on a Story of several hundred Interactions, a
narrative designer can **find and fix an unreachable or wrongly reachable scene
faster than with their current tool**, and then **hand the result to the engine
without rewriting it**.

Three conditions make that true. Only the first is met today:

1. A deterministic engine with typed world state and diagnostics (shipped).
2. Explanations visible from the authoring surface, not only during a simulated
   run (planned: Workbench `Why unavailable?`).
3. A stable, documented export the engine side can trust (format and native
   export: next priority; engine integration: to validate).

## Other differentiation axes to test

Engine integration removes an adoption barrier; it is unlikely to be the core of
the value proposition on its own. These axes are hypotheses, not demonstrated
advantages:

- modelling a dynamic narrative world (typed state, items, time, characters);
- complex conditions and interactions without code;
- simulation and diagnostics;
- accessibility to non-developers;
- several representations of the same Story (graph, simulation, later Workbench
  views and a text mode);
- collaboration and review.

## Product test

Adapted from the [Workbench product test](workbench.md#product-test), with
measurable outcomes so results can be compared across sessions.

Setup: a representative Story of 300 to 600 Interactions with state (variables,
items, time). Participants: at least one studio or visual-novel narrative
designer who did not build the Story. Comparison: the same tasks in the tool the
participant uses today, when possible.

| Task                                                             | Measure                               |
| ---------------------------------------------------------------- | ------------------------------------- |
| Identify the main parts of the Story                             | Time, and correct description yes/no  |
| Follow one character's possible route                            | Time, number of help requests         |
| Explain why a given scene is unavailable at a given point        | Time, correct explanation yes/no      |
| Change a condition so the scene becomes reachable, and verify it | Time, regression introduced yes/no    |
| Describe what data an engine would need for that scene           | Completeness against the Story format |

Record time to completion, success, blocking points, and workarounds. Do not set
pass thresholds before the first sessions; use them to set a baseline.

## What not to claim yet

- "Real-time collaborative editing": today it is live reload for clients of the
  same server, without text merge or presence. Say **live synchronisation**.
- "Export to Unity / Godot / Ren'Py": not implemented.
- "Simpler than Twine": not measured.
- "Production-ready": the platform is a guided private alpha; see
  [Production readiness](production-readiness.md).
- "Open source": no licence has been chosen yet; see
  [Business model](business-model.md).

## Decisions required

1. **First engine for the reference integration:** Ren'Py (visual novels),
   Unity, or Godot.
2. **Shape of the engine export:** a runtime-oriented projection of the Story, or
   the backup format plus a reference evaluator (a port of `packages/shared` or a
   written specification).
3. **Story content localisation model:** locale variants inside one Story, or an
   export/import workflow through the Story format. See
   [Open questions → Story Translation](open-questions.md#story-translation).
4. **Licence** for the open source core, before any public promotion.
