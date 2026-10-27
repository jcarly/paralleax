# ADR-041 - Strict Quality Gates and Native Baselines

**Status:** Accepted  
**Date:** 2026-10-26

## Context

The quality audit requested stricter rules and individual diagnostic tracking.
The author explicitly chose to retain native file/rule count baselines after
reviewing their equal-count replacement limitation, to pilot jscpd and block new
significant clones if useful, and to schedule this work before guided author
sessions. This supersedes ADR-039's complexity threshold, typed-test exclusion,
and deferral of parameter, nesting, and function-length gates.

## Decision

- Enforce cyclomatic and cognitive complexity 10, nesting 3, parameters 4, and
  function length 50. Count executable/nonblank lines, excluding comments.
  Apply the guards to source, tests, scripts, and configuration code. Declarative
  React and test code receive no blanket exclusion.
- Extend existing selective typed safety rules to tests using lint-only
  TypeScript projects. Enable selected official correctness/maintainability
  rules after measuring their diagnostics; do not enable a full SonarJS preset.
- Keep native ESLint and Stylelint count baselines. The initial migration may
  register diagnostics introduced by the new gates; subsequent maintenance may
  only remove entries. No command regenerates baselines as part of normal lint
  or CI. Count increases and new baseline files require an explicit, reasoned,
  digest-bound transition record checked against the Git comparison base.
- Check stale entries against unsuppressed diagnostics. Provide a prune command
  that refuses to write if new violations exist, and only removes stale counts.
- Retain Dependency Cruiser's existing exact dependency baseline and boundaries.
  Check its stale entries and changes as well.
- Use jscpd 4.3's Node detector for clones of at least 100 tokens and 10 lines.
  The v5 native Windows binary was blocked by application-control policy even
  outside the sandbox; v4 is the maintained Node alternative. Compare its JSON
  fragments by SHA-256 plus the ordered file pair and occurrence count. Normalize
  CRLF only; line moves do not change identity. This small report adapter is
  needed because v4 has no clone baseline. Do not build an AST identity system.
  Reject stale clones and new content/file pairs. Audit actual scanner coverage;
  raise the default 1,000-line/100 KB ceilings to include large orchestrators.
  Tests/harnesses are excluded from clone detection, but retain full ESLint
  coverage. Semantic duplication remains a review concern.
- Promote this bounded tooling initiative ahead of guided author sessions;
  extensive debt reduction remains separate backlog work.

## Consequences and guarantee

New files and increases in per-file/rule diagnostics fail. Stale counts fail
until pruned. Baseline changes are checked against the Git base, including
increases offset by decreases elsewhere. Explicit exceptions remain reviewable
in the transition record; this is an approval/audit convention, not protection
against a contributor deliberately rewriting CI or the policy itself.

Native ESLint and Stylelint counts cannot identify individual violations. An
old violation removed and a new violation introduced in the same file/rule at
equal count can pass. Existing violations may also become more severe without
changing their count. Tests demonstrate these limits. The system does not
claim complete diagnostic-level non-regression or semantic clone detection.
The clone adapter is conservative: formatting or fragment-boundary changes can
require review even if behavior is unchanged. Same-content relocation within a
file pair is accepted; two indistinguishable occurrences use counts. Tool or
threshold upgrades require a reviewed baseline migration.

No Story schema, persistence migration, API contract, or runtime behavior changes.
