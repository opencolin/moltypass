# Moltypass — Build State

This file is the **single source of truth** for autonomous progress. Read this first.

## Goal

Build the ultimate API key web browser extension that installs in Chrome and lets users enter, store, and use their API keys without the problems of copy-paste.

## Current tick

- Tick: T+2 (heading into)
- Phase: First-wave worktree initial commits done; advancing per-ws scaffolding
- Council decision: see [council/v1-scope-decision.md](council/v1-scope-decision.md)

## v1.0 scope (council-decided)

7 workstreams in v1.0. 4 cut to v2.0.

## Workstream status

| ws            | scope    | status        | worktree                              | next action |
|---------------|----------|---------------|---------------------------------------|---|
| test-infra    | v1.0     | IN_PROGRESS   | `moltypass-test-infra/` (ws/test-infra) @ `5d6df40` | Add package.json devDeps + scripts; write grep-no-keys.ts; write example.spec.ts smoke test |
| audit         | v1.0     | IN_PROGRESS   | `moltypass-audit/` (ws/audit) @ `bd89c5c` | Write `audit-log.ts` facade + integrate audit emits in proxy.ts/permissions.ts/consent.ts |
| security      | v1.0     | IN_PROGRESS   | `moltypass-security/` (ws/security) @ `7fd6f97` | Write `src/crypto/vault-crypto.ts` with KDF abstraction + `src/crypto/argon2.ts` WASM wrapper |
| detector      | v1.0     | TODO          | —                                     | spin after audit lands; needs audit-log helpers |
| picker        | v1.0     | TODO          | —                                     | spin after detector (shares `src/background/capture.ts`) |
| revoke        | v1.0     | TODO          | —                                     | spin after audit lands (needs audit events for revoke kind) |
| release       | v1.0     | TODO          | —                                     | spin in W6 after detector/picker/revoke/security land |
| auth          | **CUT → v2.0** | DEFERRED |                                       | not in v1.0 — see council decision |
| dashboard     | **CUT → v2.0** | DEFERRED |                                       | not in v1.0 |
| enterprise-sw | **CUT → v2.0** | DEFERRED |                                       | not in v1.0 |
| leak          | **CUT → v2.0** | DEFERRED |                                       | not in v1.0 |

## Releases

| Version | Week | Status | Contents |
|---|---|---|---|
| v0.1.0-internal | 2 | NOT_CUT | test-infra + audit |
| v0.5.0-alpha    | 4 | NOT_CUT | security + detector |
| v0.9.0-beta     | 5 | NOT_CUT | picker + revoke |
| v1.0.0          | 6 | NOT_CUT | release |
| v2.0.0          | 10 | NOT_CUT | auth + dashboard + enterprise-sw + leak |

## Background tasks in flight

(none currently — PM council completed)

## How to resume

If you are a future agent (or human) picking this up cold:
1. Read this file.
2. Read [council/v1-scope-decision.md](council/v1-scope-decision.md) for the binding scope decision.
3. Read [ROADMAP.md](ROADMAP.md) and [RELEASES.md](RELEASES.md).
4. Read the latest entries in [LOG.md](LOG.md).
5. `git worktree list` to see in-flight branches.
6. For each IN_PROGRESS workstream above, `cd` to its worktree and read the workstream file.
7. Resume from whichever workstream is at IN_PROGRESS or pick the next TODO with met dependencies.

## Conventions

- All worktrees are siblings of `/Users/colin/moltypass/` named `moltypass-<ws>/`.
- Each worktree's branch is `ws/<ws>`.
- Each workstream file lives at `PLANS/workstreams/<ws>.md` and has a `## Status` section.
- Every meaningful action gets a line in `LOG.md` (append-only, timestamped, tick-numbered).
- Council decisions live at `PLANS/council/<topic>-decision.md`.
- Release scope lives at `PLANS/releases/v<x.y.z>.md`.
- **Merge gate (all v1.0 workstreams):** `pnpm typecheck` + `pnpm test` + `pnpm test:gate` (key-shape grep) green; at least one unit test per new business-logic module.
