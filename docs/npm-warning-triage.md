# npm Warning Triage

Status: Current

Last reviewed: 2026-10-23

## Purpose

This register distinguishes actionable dependency or runtime risk from expected
tooling output. A warning is not suppressed merely to make logs quiet: security,
unsupported runtime, and configuration findings must be fixed or retained here
with an owner and removal condition.

## Last Full Verification Baseline (2026-09-13)

The table below records the last full verification before the 2026-10-22
dependency refresh. That refresh's checks and findings are recorded below.

| Area                        | Evidence                                              | Outcome                                                                                         |
| --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Clean install               | `npm ci --audit=false --no-fund`                      | Completes successfully from the committed lockfile.                                             |
| Full dependency audit       | `npm audit --json`                                    | Zero known vulnerabilities at every severity.                                                   |
| Production dependency audit | `npm audit --omit=dev --audit-level=high --json`      | Zero known vulnerabilities.                                                                     |
| Install scripts             | `npm install-scripts ls`                              | No unreviewed install scripts.                                                                  |
| Static checks               | `npm run lint`, `npm run format`, `npm run typecheck` | Complete without warnings or errors.                                                            |
| Tests and coverage          | Jest 30.5.1 and Vitest 5.0.0 suites                   | Pass; coverage remains above the repository thresholds.                                         |
| Production build            | `npm run build`                                       | API, shared, and web builds pass; web bundle budgets pass.                                      |
| API runtime smoke           | Compiled API on an isolated port, without migration   | Nest initializes every module and route without a warning.                                      |
| Web runtime smoke           | `npm run dev -w @paralleax/web`                       | Vite starts normally. A one-time dependency re-optimization after lockfile changes is expected. |

Jest was upgraded from 29 to 30 and Vitest from 3 to 5 after reviewing their
workspace, TypeScript, jsdom, coverage, and Node 24 contracts. The upgrade also
removed obsolete `inflight`, `glob@7`, and the previous direct `glob@10.5`
chains. The coverage changes in Vitest 5 exposed previously uncounted branches;
new behavior-focused tests restored the existing thresholds instead of lowering
them.

## Dependency Refresh (2026-10-22)

Direct dependencies declared at the root and in workspaces were updated with
npm 12.0.1 to the newest versions allowed by their semver ranges. The exact
`sanitize-html` pin was advanced from 2.17.7 to 2.18.1. The lockfile was
regenerated, and no semver-major upgrade was applied.

The updated dependency tree passed lint, formatting, typecheck, and the
production build. The API QSP worker smoke passed, and the web bundle budgets passed:
initial JavaScript 134.7/135 KiB, editor incremental assets 136.3/145 KiB, and
player incremental assets 80.4/95 KiB. Tests and coverage were not rerun during
this refresh.

## CI Follow-up (2026-10-23)

The first CI run after the refresh exposed mixed NestJS majors: the API declared
NestJS 11 while the refreshed shared dependency ranges resolved NestJS 12.2.0.
The API and root overrides now pin the Nest common, core, platform-express, and
testing packages to 11.2.7. Keep the pins until the API and its Nest integrations
are deliberately upgraded together.

The web fixes address two independent checks. The account button's accessible
name now includes its visible account label and the signed-in user's display
name. The story import dialog loads on demand, bringing the production initial
JavaScript bundle to 131.9/135 KiB while keeping editor and player budgets within
their existing limits.

After these fixes, the full shared, API, and web coverage command passed (shared:
148 tests; API: 45 suites and 320 passing tests; web: 84 files and 561 passing
tests, with statements at the 90% threshold). Lint, formatting, typecheck,
operations tests (15 passing), and production build passed as well. The local
browser acceptance suite was not rerun because the Playwright Chromium binary is
unavailable in this environment; the CI browser job should verify the updated
accessibility and editor flows.

`npm audit --omit=dev` reports zero production vulnerabilities. The full audit
reports 20 moderate findings, all in the development-only Jest coverage chain:

```text
ts-jest@29.4.15
  -> @jest/transform@30.5.2
  -> babel-plugin-istanbul@8.0.2
  -> @istanbuljs/load-nyc-config@1.1.0
  -> js-yaml@3.15.2
  -> argparse@1.0.10
  -> sprintf-js@1.0.3
```

`npm audit fix` applied the compatible `babel-plugin-istanbul` update, but the
advisory remains because npm's only offered remediation requires `--force` and
would downgrade `ts-jest` to 29.1.2. That downgrade was not applied. The
remaining finding is tracked for the Paralleax maintainers; remove it when the
upstream coverage chain publishes a compatible fix or the project replaces that
chain.

## Reviewed Install Scripts

The root `allowScripts` policy is explicit:

- `esbuild@0.28.2` is allowed because Vite requires its platform binary and
  service bootstrap; its reviewed `postinstall` remains `node install.js`.
- `@sentry/node-cpu-profiler@2.4.4` is allowed for the configured Sentry profiling
  integration. Its reviewed install hook checks the precompiled binding first
  and invokes `node-gyp` only when the binding is missing or cannot load.
- `@parcel/watcher@2.6.0` is denied because Paralleax uses its published optional
  platform binary and does not need the source-build fallback during install.
- `@scarf/scarf@1.4.0` is denied because its install hook reports package-usage
  telemetry and is not required by Paralleax.
- `@sentry/cli@2.58.6` is denied because the application does not need its
  install-time binary download.
- `unrs-resolver@1.12.2` is denied because the published optional platform binary
  is sufficient for the supported environment.

Any version change that alters these package keys must be reviewed rather than
silently allowing the new script.

## Tracked Upstream Exceptions

One deprecated package remains in the development-only test toolchain:

```text
ts-jest@29.4.15
  -> @jest/transform@30.5.2
  -> babel-plugin-istanbul@8.0.2
  -> test-exclude@7.0.2
  -> glob@10.5.0
```

`glob@10.5.0` is marked unsupported by its maintainer. It is not shipped in a
production dependency path, and the compatible upstream packages currently
provide no newer transitive version. The production audit remains clean; the
moderate development-only audit finding is described above. An npm override to
a different major is intentionally not used because `test-exclude` has not
declared that contract. Remove this exception as soon as `ts-jest`, Jest's
coverage chain, or `test-exclude` adopts a supported `glob` release.

## Informational Output

The following output is not a repository defect:

- `npm notice run ...` describes workspace script execution.
- npm funding messages are package metadata; CI uses `--no-fund` where a concise
  install log is useful.
- Vite's chunk-size warning identifies the dynamically loaded `elk.bundled` asset;
  the gzip-based web bundle budgets remain the release check for route payloads.
- Vitest's `fsModuleCache`, `vmThreads`, and `isolate: false` suggestions are
  optional performance advice. Isolation remains enabled because changing it can
  hide test pollution; worker concurrency is capped at four to avoid exhausting
  local machines with many CPU cores.
- Node's `NO_COLOR`/`FORCE_COLOR` message can appear when an external runner sets
  both variables. Neither variable is set by the repository or CI configuration.

## Recurring Review

Run this triage after lockfile changes and before a production release. Resolve
security findings immediately, verify major upgrades against the affected test
and runtime contracts, update the install-script allowlist deliberately, and
record any remaining warning here with its exact dependency path and removal
condition.
