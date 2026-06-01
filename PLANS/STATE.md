# Moltypass — Build State

This file is the **single source of truth** for autonomous progress. Read this first.

## Goal

Build the ultimate API key web browser extension that installs in Chrome and lets users enter, store, and use their API keys without the problems of copy-paste.

## Current tick

- Tick: T+1
- Phase: First-wave worktree spin + start audit
- Council decision: see [council/v1-scope-decision.md](council/v1-scope-decision.md)

## v1.0 scope (council-decided)

7 workstreams in v1.0. 4 cut to v2.0.

## Workstream status

| ws            | scope    | status        | worktree                              | next action |
|---------------|----------|---------------|---------------------------------------|---|
| test-infra    | v1.0     | IN_PROGRESS   | `moltypass-test-infra/` (ws/test-infra) | Build vitest config + fake-chrome/fake-idb setup |
| audit         | v1.0     | IN_PROGRESS   | `moltypass-audit/` (ws/audit)         | Write `src/shared/audit-types.ts` |
| security      | v1.0     | IN_PROGRESS   | `moltypass-security/` (ws/security)   | Vault header KDF-version field; Argon2id WASM spike |
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
