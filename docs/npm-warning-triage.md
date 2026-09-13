# npm Warning Triage

Status: Current

Last reviewed: 2026-09-13

## Purpose

This register distinguishes actionable dependency or runtime risk from expected
tooling output. A warning is not suppressed merely to make logs quiet: security,
unsupported runtime, and configuration findings must be fixed or retained here
with an owner and removal condition.

## Current Baseline

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

## Reviewed Install Scripts

The root `allowScripts` policy is explicit:

- `esbuild@0.28.1` is allowed because Vite requires its platform binary and
  service bootstrap.
- `@parcel/watcher@2.6.0` is denied because Paralleax uses its published optional
  platform binary and does not need the source-build fallback during install.
- `unrs-resolver@1.12.2` is denied because the published optional platform binary
  is sufficient for the supported environment.
- `@scarf/scarf@1.4.0` is denied because its install hook reports package-usage
  telemetry and is not required by Paralleax.

Any version change that alters these package keys must be reviewed rather than
silently allowing the new script.

## Tracked Upstream Exception

One deprecated package remains in the development-only test toolchain:

```text
ts-jest@29.4.12
  -> @jest/transform@30.5.1
  -> babel-plugin-istanbul@8.0.0
  -> test-exclude@7.0.2
  -> glob@10.5.0
```

`glob@10.5.0` is marked unsupported by its maintainer. It is not shipped in a
production dependency path, both npm audits are clean, and the compatible
upstream packages currently provide no newer transitive version. An npm override
to a different major is intentionally not used because `test-exclude` has not
declared that contract. Remove this exception as soon as `ts-jest`, Jest's
coverage chain, or `test-exclude` adopts a supported `glob` release.

## Informational Output

The following output is not a repository defect:

- `npm notice run ...` describes workspace script execution.
- npm funding messages are package metadata; CI uses `--no-fund` where a concise
  install log is useful.
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
