# Workstream: exec

## Status: LANDED IN WORKTREE (46 tests green, awaiting merge to main)

## Goal
Ship the `moltypass` CLI binary + subcommand dispatch + tool-aware exec runner + streaming redactor + validation-hook + mcp-diagnose. Closes the "CLI is stubbed" gap from v2.1.0-alpha.

## Worktree
`/Users/colin/moltypass-exec/` on branch `ws/exec`. `@8f8a627`.

## Files created
- `src/cli/argv.ts` — subcommand parser (exec/hook/env/status/diagnose/help/version)
- `src/cli/types.ts` — `CliDaemon` contract, `ToolCatalogEntry`, `ExecResult`, `ExecEnvResolution`
- `src/cli/catalog.ts` — 15-tool built-in catalog + `lookupTool()` fallback
- `src/cli/runner.ts` — spawn + env-inject + stream + redact + audit (no shell interpolation)
- `src/cli/redact.ts` — streaming redactor with newline + safe-boundary emission
- `src/cli/fixtures/fake-daemon.ts` — in-memory `CliDaemon` for tests
- `bin/moltypass` — Node entry, dispatch table, help/version/status/diagnose inline
- 4 test specs (46 tests): argv, catalog, redact-stream, runner

## Design choices

- **`spawn(cmd, args, {env})` — never a shell string.** Argv arrives as a `string[]`, is passed to `spawn` verbatim. No `exec()` (Node's shell-eval). Immune to command injection.
- **Env vars set on the CHILD only.** Never mutates `process.env` of the CLI itself. When the child exits, its env dies with it — no leak into subsequent commands.
- **Streaming redactor emits at newlines (or SOFT_CAP=64KiB + safe boundary).** Adversarial byte-by-byte chunking still can't split a key across an emit boundary because keys never contain newlines and never contain whitespace.
- **Daemon stub returns `daemon_not_running` (exit 74).** Structured error so scripts can detect + retry. The full Native Messaging daemon-client lands in T+3.
- **Bin entry-point is CommonJS-shape** using dynamic import for the ESM source. Same pattern the mcp bin uses.

## Dependencies
- Imports `src/mcp/redact.ts` for the underlying regex set. Ensures the CI grep guard and the runtime redactor stay in sync.
- Foundation for **ws/mcp T+1.f** (Native Messaging daemon-client) — this workstream defines the `CliDaemon` contract; MCP's `daemon-client.ts` will implement it and be the same code path.

## Complexity / days
L / 3 (delivered in ~1 tick pass — argv + runner + redact + tests + bin)

## Top risks
1. **Redactor cap** — SOFT_CAP=64KiB means a single huge unbroken line (e.g. a base64 blob) could delay emission for a bit. Mitigation: safe-boundary fallback at whitespace/control-char, plus flush guarantees eventual emission.
2. **Daemon stub UX** — first-run without a daemon shows `daemon_not_running`. Mitigated by clear error message + `diagnose` subcommand that prints config paths.
3. **Tool catalog coverage** — 15 tools is a start; adding a tool = one PR. Tracked in landing-page copy.

## Open questions
- Windows: `spawn` with paths containing spaces. Deferred until Windows testing pass.
- Should `moltypass exec` support `--dry-run` to print what would be injected? Deferred; not a v2.5 requirement.

## Exit criteria
- ✅ Argv parser covers all subcommands + flag combos (24 tests)
- ✅ Runner injects env, propagates exit, redacts streams, records audit (9 tests)
- ✅ Streaming redactor never emits an unredacted key even under byte-by-byte chunking (7 tests, adversarial test on line 76)
- ✅ Tool catalog includes hermes, claude-code, cursor, aider, continue (6 tests)
- ✅ 545/545 tests green in ws/exec
- ⏳ Native Messaging daemon-client (T+3)
- ⏳ Merge to main after ws/watchtower (they don't overlap; either order works)

## Tests target
30+ (delivered 46)

## v2.5 tie-in
Items A (moltypass exec) + F (hook stub) + G (mcp diagnose) from the council decision. B (env --tool) is scaffolded via `argv.ts` — full write-side implementation ships in T+3.
