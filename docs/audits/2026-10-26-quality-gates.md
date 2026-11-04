# Strict quality gates audit - 2026-10-26

## Contract and decisions

Strengthen the existing monorepo quality tools, extend lint coverage and make
historical debt visible and maintainable. Domain behavior, persisted Stories,
reader progress, HTTP contracts and database schemas are unaffected. Changes
belong to root tooling/configuration, lint-only tsconfigs, operational tests,
CI and documentation. No broad application refactor is part of this work.

The author chose native count baselines after reviewing their replacement gap,
a duplication pilot followed by a blocking gate, and priority ahead of guided
author sessions. [ADR-041](../decisions/ADR-041-strict-quality-gates-and-native-baselines.md)
supersedes the corresponding ADR-039 decisions while retaining their history.

Acceptance scenarios exercise threshold failures, accepted historical counts,
same-file/rule increases, new files, equal-count replacement limitations, stale
entries, shrink-only pruning, Git-base growth checks, exact reviewed exceptions,
forbidden dependencies, CSS failures and actual typed lint of a test file.

## Before this migration

- ESLint 10.13.0 and typescript-eslint 8.72.0 used recommended syntax checks,
  `no-explicit-any` (waived in tests), unused-variable checks, React hooks and
  refresh rules, a shared-form-control rule, workspace/global restrictions,
  cyclomatic complexity 20 in production, and 12 typed safety rules in production.
- Tests/specs/harnesses were excluded from typed rules. Source projects included
  API/web tests but the lint config excluded them; shared's compiler project also
  excluded tests. Web Playwright tests/configurations had no typed lint scope.
- Native ESLint baseline: **139 findings in 44 files**: API 81, web 45, shared 13.
  Complexity contributed 45; typed rules contributed 94. ADR-039/backlog's
  120 typed findings were an older measurement, not the current file total.
- Stylelint 17.16.0 already covered source CSS: unknown/invalid CSS, duplicate
  declarations/selectors, specificity, `!important`, literal colors and unknown
  design tokens. The baseline held **644 findings in 14 files**: 359 structural
  plus 285 color findings. The two prototype stylesheets waived color rules.
- Dependency Cruiser 18.7.0 protected workspace boundaries, the shared facade,
  controller/persistence ownership and the React Flow allowlist. Its one exact
  historical mixed email runtime/type cycle remained accepted.
- CI already ran lint, architecture, formatting, typecheck, operational tests,
  coverage and build. The operational suite already tested selected ESLint,
  Stylelint and architectural rules, including native count behavior.
- No duplication detector, consolidated prune command or Git-base growth check
  existed. ESLint natively rejected unused bulk suppressions; Stylelint did not
  enforce stale baseline counts, and architecture stale entries were warnings.
- `eslint .` also visited three untracked scripts inside the already Git-ignored
  local third-party import corpus. They now follow that corpus's explicit ignore.

## Rules and coverage retained or strengthened

| Gate                                                                  | Current setting                                  |
| --------------------------------------------------------------------- | ------------------------------------------------ |
| `complexity`                                                          | error, 10                                        |
| `sonarjs/cognitive-complexity`                                        | error, 10                                        |
| `max-depth`                                                           | error, 3                                         |
| `max-params`                                                          | error, 4                                         |
| `max-lines-per-function`                                              | error, 50; skip blank/comment-only lines         |
| `eqeqeq`, `curly`                                                     | error; strict equality and all control braces    |
| `consistent-type-imports`, typed `no-shadow`, `no-non-null-assertion` | error                                            |
| Existing 12 typed safety rules                                        | source and tests across all three workspaces     |
| Typed `await-thenable`, `only-throw-error`, `return-await`            | error; return-await in try/catch                 |
| `switch-exhaustiveness-check`                                         | error; default does not hide missing union cases |
| Sonar `no-identical-expressions`, `no-all-duplicated-branches`        | error                                            |
| Unused ESLint directives/inline configurations                        | error                                            |
| Needless/descriptionless Stylelint disables                           | error                                            |
| Dependency baseline stale entries                                     | error; native shrink-only mode                   |

Typed `no-unsafe-type-assertion` and `prefer-promise-reject-errors` also error:
unchecked narrowing and non-error promise rejection values are rejected.

Rules apply to JS/TS source, unit/integration tests, scripts and configurations.
JavaScript receives syntax, control-flow and complexity checks; typed safety
analysis applies to TypeScript projects. ESLint runs in successive native CLI
processes for API, web, shared, then the rest of the repository. This releases
TypeScript programs between workspaces; the final group still discovers new
scripts/configurations outside them. The same runner supports native pruning,
accepts no generation flags, and stops on the first failure. Global artifact
ignores are separate from linter options, protected by a regression fixture.
Lint-only tsconfigs extend the existing strict compiler configurations, adding
shared tests and web Playwright tests/configurations without altering builds.
No production compiler option changed. There is no React or test complexity
exemption. The existing form-control rule retains its specialized-control and
prototype/test scope; that UI policy is independent of general quality coverage.

Excluded artifacts are dependencies, builds, coverage, Playwright outputs,
tsbuildinfo, quality reports and `test-data/local/` (untracked external corpora
and exploratory import scripts). Synthetic nonexistent lint fixtures alone skip
typed project analysis; the typed-test fixture is a real file inside its project.
The clone corpus covers production JS/TS/JSX/TSX in the three source roots,
excluding tests and their harnesses to avoid fixture/setup duplication.

SonarJS **4.2.2** declares ESLint 8/9/10 peers and is LGPL-3.0-only; it is a
development tool and is absent from application bundles. Only selected original
rules are enabled, avoiding the overlaps and large scope of its full preset.
jscpd **4.3.0** is the MIT Node edition, maintained for security/critical fixes.
The v5 Windows native binary was blocked by application-control policy, including
outside the sandbox; this task did not weaken that policy. Node 24.18.0 and npm
12.0.1 match repository/CI targets. Installation audit reported zero vulnerabilities.

## Evaluated and deferred

`no-unnecessary-condition` produces a demonstrated false positive with the
existing compiler configuration: `values[0] !== undefined` on `string[]` is called
unnecessary, although an empty array returns undefined. The projects do not use
`noUncheckedIndexedAccess`. Enabling it would expand this tooling task into a
project-wide type migration. Defer the rule; do not baseline known false positives
or silently make lint use different indexing semantics. Existing constant-condition,
unreachable-branch and selected Sonar checks remain active. `strict-boolean-expressions`
is a broader style/type policy and is also deferred.

Do not add a second shadow/throw rule: the TypeScript extensions replace the core
versions. Exhaustiveness and typed safety rules complement compiler checks; they
do not duplicate a compiler guarantee currently enabled. Cognitive complexity
measures nesting/readability while cyclomatic complexity counts paths; both
remain separate bounded signals. No additional general feature-to-feature import
ban was justified by current module ownership. Shared facade and React Flow
boundaries already enforce the documented constraints. Static imports cannot
prove that narrative rules have been centralized.

No new blanket specificity limit, raw dimension ban or selector ban was added:
authored graph geometry and established responsive/third-party styling need
context. Existing token, validity, duplicate-selector and cascade checks apply.
Token/prototype color exceptions remain explicit. Four needless color-rule
disables were removed from the canonical and page-palette token blocks.
The new stale-count check found and removed two obsolete specificity suppressions
in `comments.css`, confirmed in native file mode: CSS debt falls from 644 to 642.
There were no application logic changes. Broad autofix of 1,374 brace findings
and historical function splitting was deferred to keep this migration reviewable.

## Baseline guarantees and maintenance

`npm run lint` uses native ESLint and Stylelint suppression files and also runs
the clone gate and Git-base growth policy. `npm run lint:architecture` retains
Dependency Cruiser's exact matching and errors on stale entries. CSS stale
checks use unsuppressed Stylelint code results, including entries for deleted
files. Native ESLint reports unused bulk entries and unused directives.

`npm run lint:baseline` compares every file/rule count independently with Git
`HEAD` locally. `npm run lint:baseline -- <ref>` selects another commit. CI fetches
the base and sets `BASELINE_BASE_REF` to the PR base SHA or pre-push SHA, using
`HEAD^` for scheduled/manual runs. A new-branch push with a zero before-SHA uses
the merge base with `BASELINE_DEFAULT_REF` (the remote default branch), so it
compares the whole branch. Missing/invalid Git refs fail. Decreases cannot
offset growth elsewhere. New baseline files or entries require a transition in
`quality-baseline-transitions.json` with exact canonical before/after digests and
a written rationale. The two initial migration records are explicitly authorized
by this task. They are not a recurring allowance for subsequent increases.

The record is an auditable review convention: CI checks exact contents and the
presence of rationale, but cannot decide whether a human rationale is justified
or prevent somebody deliberately weakening CI and policy together. Changes to
exceptions/configuration require normal repository review. No automatic label,
ticket creation, GitHub write permission or remote publication was introduced.

Run `npm run lint:baseline:prune` after fixes. It invokes ESLint's native prune,
CSS count pruning, Dependency Cruiser's native shrink-only mode, clone pruning,
then the architecture gate. ESLint/CSS/clones still report new violations; CSS
and clone pruning refuse to write when growth exists. Architecture pruning never
adds new violations, and the subsequent gate fails on them. A failed command can
have already removed earlier stale entries; inspect the diff. No regeneration
command runs in CI or normal lint. Exceptional growth requires a separately
reviewed migration, never a fallback to make a check pass.

**Residual native-count gap:** a corrected and a new violation in the same
file/rule can replace one another without changing the total. An existing
function can become more complex without adding a diagnostic. The author chose
to retain this limitation; tests explicitly demonstrate it. This system provides
count non-regression, not individual-diagnostic non-regression.

## Duplication pilot and gate

The complete pilot detects **16 clone pairs**, **382 duplicated lines (0.57%)**,
across **352 analyzed source files**. Smaller files below the 10-line minimum
cannot contain a qualifying clone. The initial default-limit probe found only
15 pairs/340 files: the added pair is repository/runtime persistence code.
The final configuration raises limits to 1,000,000 lines and 20 MB, includes the
large editor/player modules, and checks tracked eligible files against reported
scanner sources. Failure to scan an eligible file blocks the gate.

The detector supplies token matching. A minimal JSON adapter stores SHA-256 of
the reported fragment (CRLF normalized), the ordered pair of source paths and
occurrence count. It detects new content/pairs/extra copies, tolerates line moves,
and rejects stale entries. It does not reconstruct code, tokenize independently,
infer AST identities or create replacement domain abstractions. Changed fragment
boundaries/formatting can require explicit review. Equivalent implementations,
renamed logic, same-content relocation within a file pair and some near matches
are not individually distinguished. Upgrading the detector/thresholds can change
reported fragments and needs a reviewed migration.

Findings: seven DTO pairs, three catalogue/prototype pairs, two inspector pairs,
two graph-projection pairs, one repository/runtime persistence pair, and one
API/web Sentry-redaction pair. No qualifying player/simulator pair was found at
these thresholds; that does not prove semantic duplication is absent. The
catalogue/prototype pairs are presentation evidence; repeated narrative or
persistence behavior deserves higher priority than reducing that count.

## Prioritized follow-up in the existing backlog

1. Preserve narrative invariants while simplifying shared Trigger evaluation,
   typed expression parsing and Story operation/history transformations. Start
   with focused responsibilities and deterministic tests. `parsePrimary` has
   cyclomatic 33/cognitive 46; history transformation reaches cognitive 43 and
   one operation merge callback has cyclomatic 42. Do not move importer semantics
   into the core or prioritize adapters merely because their scores are larger.
2. Reduce complex shared adapters separately: QSP analyzer cognitive 97,
   ChoiceScript `compileStatements` cognitive 79, and QSP lexer cognitive 48.
   Reuse existing parser/control-flow stages; retain compatibility-gap behavior.
3. Continue existing central React plans for `StoryEditor`, `RichTextEditor`,
   player and persistence/selection hooks when a useful slice is justified.
   Reuse current controls and states; do not split declarative JSX mechanically.
4. Review repository/runtime persistence duplication first, then graph projection,
   inspector state and DTO validation. Sentry adapters share privacy-filtering
   logic but do not belong in the narrative engine; examine ownership before
   extracting any utility. Improve typed fixtures in the large API/shared tests
   rather than importing unsafe casts into new tests.
5. Reduce stylesheet debt in existing design-system work: product pages, player
   and Simulation styles, graph styles, then prototype cascades. Use existing
   tokens and selectors. Keep intentional authored colors/geometry supported.

These recommendations extend the existing quality backlog, not a new ticket
queue. No broad refactor or zero-baseline deadline is commissioned.

## Verification

Local verification completed on 2026-10-26:

- `npm run lint` passed in 142 seconds: Git-base baseline policy, all four ESLint
  groups, Stylelint and the jscpd gate. The accepted historical totals remain
  4,404 ESLint findings, 642 CSS findings and 16 clone pairs.
- `npm run lint:architecture` passed for 560 modules and 2,030 dependencies,
  retaining the one documented historical mixed email cycle.
- `npm run test:operations` passed: 63 tests.
- `npm run typecheck` passed for shared, API and web.
- `npm run format` passed.
- `npm run build` passed for shared, API and web, including both worker smoke
  checks and web bundle budgets. Vite still reports the existing 1.49 MB raw
  ELK chunk warning; the configured initial-entry budgets pass.
- Shared coverage passed 25 files: 90.36% statements, 82.30% branches, 96.03%
  functions and 92.78% lines. API coverage passed 49 suites and 364 tests, with
  4 suites/27 tests skipped; coverage is 90.21% statements, 79.08% branches,
  92.15% functions and 91.77% lines.
- Web coverage execution reported 25 files and 212 tests passing, but Vitest did
  not finish its coverage-report process in this Windows environment. The
  standalone retry showed the same hang after startup and was stopped. No web
  coverage percentage is claimed. The web tests themselves passed.
- `git diff --check` passed. Remote GitHub CI and Playwright E2E were not run;
  the workflow now runs these gates on its next CI event.

## Measured baseline tables

The tables below count suppressed diagnostics, not affected functions or unique
defects. Multiple rules can flag the same function. Rules with no historical
findings remain enabled and are exercised by configuration fixtures.
<!-- measured-tables -->

### ESLint by rule and workspace

| Rule                                               |  API |  Web | Shared | Root/scripts |    Total |
| -------------------------------------------------- | ---: | ---: | -----: | -----------: | -------: |
| `@typescript-eslint/consistent-type-imports`       |    6 |   14 |      1 |            0 |       21 |
| `@typescript-eslint/no-floating-promises`          |    0 |    6 |      0 |            0 |        6 |
| `@typescript-eslint/no-misused-promises`           |    0 |    7 |      0 |            0 |        7 |
| `@typescript-eslint/no-non-null-assertion`         |  110 |  399 |    144 |            0 |      653 |
| `@typescript-eslint/no-shadow`                     |   30 |   22 |     14 |            0 |       66 |
| `@typescript-eslint/no-unnecessary-type-assertion` |   11 |   21 |      0 |            0 |       32 |
| `@typescript-eslint/no-unsafe-argument`            |   13 |   14 |      1 |            0 |       28 |
| `@typescript-eslint/no-unsafe-assignment`          |  123 |   39 |     72 |            0 |      234 |
| `@typescript-eslint/no-unsafe-call`                |    3 |    2 |    112 |            0 |      117 |
| `@typescript-eslint/no-unsafe-enum-comparison`     |    1 |    0 |      0 |            0 |        1 |
| `@typescript-eslint/no-unsafe-member-access`       |  386 |   12 |    175 |            0 |      573 |
| `@typescript-eslint/no-unsafe-return`              |    5 |    2 |     23 |            0 |       30 |
| `@typescript-eslint/no-unsafe-type-assertion`      |  162 |  124 |     38 |            0 |      324 |
| `complexity`                                       |   36 |   84 |     50 |            2 |      172 |
| `curly`                                            |  266 |  671 |    404 |           33 |     1374 |
| `max-depth`                                        |    0 |   16 |     32 |            5 |       53 |
| `max-lines-per-function`                           |  126 |  306 |     74 |            2 |      508 |
| `max-params`                                       |   23 |   15 |     24 |            0 |       62 |
| `sonarjs/cognitive-complexity`                     |   23 |   65 |     54 |            1 |      143 |
| **Total**                                          | 1324 | 1819 |   1218 |           43 | **4404** |

### Largest ESLint debt concentrations

| File                                                        | Findings |
| ----------------------------------------------------------- | -------: |
| `apps/api/src/stories/stories.e2e.spec.ts`                  |      482 |
| `packages/shared/src/story-operations.test.ts`              |      381 |
| `apps/web/src/pages/StoryEditor.tsx`                        |      106 |
| `apps/web/src/storyGraphLayout.ts`                          |       89 |
| `apps/web/tests/e2e/editor.groups.spec.ts`                  |       75 |
| `packages/shared/src/import-export/qsp/parser.ts`           |       75 |
| `apps/web/tests/e2e/editor.graph.spec.ts`                   |       74 |
| `packages/shared/src/import-export/qsp/expressions.ts`      |       73 |
| `apps/api/src/stories/dto/stories.dto.ts`                   |       68 |
| `packages/shared/src/history/story-history.ts`              |       66 |
| `packages/shared/src/expressions/index.ts`                  |       64 |
| `apps/api/src/stories/stories.repository.memory.ts`         |       54 |
| `apps/web/src/components/RichTextEditor.tsx`                |       53 |
| `apps/api/src/comments/comments.e2e.spec.ts`                |       51 |
| `packages/shared/src/import-export/qsp/subroutines.test.ts` |       48 |

### Stylelint (all findings in apps/web)

| Rule                        | Findings |
| --------------------------- | -------: |
| `color-named`               |       29 |
| `color-no-hex`              |      255 |
| `declaration-no-important`  |       49 |
| `function-disallowed-list`  |        1 |
| `no-descending-specificity` |      262 |
| `no-duplicate-selectors`    |       46 |

| File                                                                   | Findings |
| ---------------------------------------------------------------------- | -------: |
| `apps/web/src/pages/ProductPages.css`                                  |      197 |
| `apps/web/src/pages/ParalleaxPrototype.css`                            |      143 |
| `apps/web/src/features/story-player/storyPlayer.css`                   |       92 |
| `apps/web/src/pages/ParalleaxPrototypePages.css`                       |       70 |
| `apps/web/src/features/story-player/storySimulation.css`               |       36 |
| `apps/web/src/features/story-editor/graph/storyGraph.css`              |       27 |
| `apps/web/src/features/comments/comments.css`                          |       22 |
| `apps/web/src/features/story-editor/editor.css`                        |       16 |
| `apps/web/src/styles.css`                                              |       11 |
| `apps/web/src/features/story-editor/inspectors/inspector-controls.css` |       10 |
| `apps/web/src/components/formFields.css`                               |        7 |
| `apps/web/src/components/richTextEditor.css`                           |        5 |
| `apps/web/src/features/feedback/FeedbackButton.css`                    |        5 |
| `apps/web/src/features/story-editor/inspectors/inspector-layout.css`   |        1 |

### Clone evidence

| First source                                             | Second source                                                       | Lines | Tokens |
| -------------------------------------------------------- | ------------------------------------------------------------------- | ----: | -----: |
| `apps/web/src/pages/DesignSystemPage.tsx:51`             | `apps/web/src/pages/ParalleaxPrototypePages.tsx:567`                |    12 |    134 |
| `apps/web/src/pages/DesignSystemPage.tsx:101`            | `apps/web/src/pages/ParalleaxPrototypePages.tsx:620`                |    26 |    236 |
| `apps/web/src/pages/DesignSystemPage.tsx:365`            | `apps/web/src/pages/ParalleaxPrototypePages.tsx:802`                |    23 |    173 |
| `apps/web/src/components/ItemDefinitionInspector.tsx:46` | `apps/web/src/components/LocationInspector.tsx:47`                  |    43 |    351 |
| `apps/web/src/components/CharacterInspector.tsx:81`      | `apps/web/src/components/LocationInspector.tsx:47`                  |    49 |    387 |
| `apps/web/src/storyGraph.ts:291`                         | `apps/web/src/storyGraph.ts:226`                                    |    19 |    187 |
| `apps/web/src/storyGraph.ts:386`                         | `apps/web/src/storyGraph.ts:226`                                    |    18 |    165 |
| `apps/api/src/stories/dto/stories.dto.ts:321`            | `apps/api/src/stories/dto/stories.dto.ts:284`                       |    33 |    369 |
| `apps/api/src/stories/dto/stories.dto.ts:654`            | `apps/api/src/stories/dto/stories.dto.ts:619`                       |    18 |    166 |
| `apps/api/src/stories/dto/stories.dto.ts:659`            | `apps/api/src/stories/dto/stories.dto.ts:638`                       |    17 |    161 |
| `apps/api/src/stories/dto/stories.dto.ts:730`            | `apps/api/src/stories/dto/stories.dto.ts:637`                       |    15 |    164 |
| `apps/api/src/stories/dto/stories.dto.ts:750`            | `apps/api/src/stories/dto/stories.dto.ts:619`                       |    19 |    187 |
| `apps/api/src/stories/dto/stories.dto.ts:755`            | `apps/api/src/stories/dto/stories.dto.ts:731`                       |    20 |    196 |
| `apps/api/src/stories/dto/stories.dto.ts:866`            | `apps/api/src/stories/dto/stories.dto.ts:831`                       |    35 |    365 |
| `apps/api/src/stories/stories.repository.ts:1139`        | `apps/api/src/stories/persistence/story-runtime.persistence.ts:282` |    28 |    435 |
| `apps/api/src/observability/sentry.ts:63`                | `apps/web/src/observability/sentry.ts:106`                          |    23 |    240 |

## Focused asynchronous follow-up — 2026-11-03

The `origin/main` baseline started this slice with 3,678 suppressed ESLint
findings. A raw, unsuppressed probe of the web files with
`@typescript-eslint/no-floating-promises` or
`@typescript-eslint/no-misused-promises` found 13 diagnostics across six files:
six floating promises and seven promise-returning callbacks passed to void
contracts.

- `App.tsx` had two of each rule where authentication callbacks returned Router
  navigation promises. `AuthPage` and `AccountActionPage` now accept and await
  asynchronous callbacks, report rejected transitions in their existing error
  area, and complete pending-state updates before invoking the parent callback.
- `StoryEditor.tsx` passed four asynchronous graph-persistence callbacks to a
  controller that declared synchronous methods. The controller now reflects the
  Promise contract and forwards unexpected rejections to the existing save error
  feedback. Expected API failures continue to be handled by the persistence
  lifecycle.
- The remaining five diagnostics were in test callbacks: unawaited React
  `act()` calls and a navigation click handler. The tests now await state flushes
  and keep the navigation explicitly fire-and-forget at its event boundary.

The unsuppressed async probe now reports zero findings. The native ESLint
baseline shrank from 3,678 to 3,661 total findings: the 13 async entries plus
four stale `curly` entries in the touched controller. No rule, threshold, or
suppression policy changed. The focused web verification passed all nine
selected suites (66 tests) using one worker, including the added
rejection and double-submit cases; the web typecheck passed. One default parallel
run timed out while the existing `App.test.tsx` waited for the lazy AccountDialog;
the App suite then passed alone, and all selected suites passed together with one
worker. Prettier and `git diff --check` passed. The architecture check passed
with the one documented email cycle.

The full `npm run lint:baseline:prune` reached its duplication step but could not
spawn the nested Node process in this execution environment (`EPERM`). The
jscpd CLI ran directly with the same config and input paths: it scanned all 289
eligible files, found the expected 16 clones, and comparison against the
duplication baseline reported no growth or stale entries. The dependency baseline
remained at its one known cycle. This does not reorder the remaining independent
work: persistence SQL, shared narrative logic, graph/editor follow-ups, then
secondary debt remain separate slices in the existing backlog.
