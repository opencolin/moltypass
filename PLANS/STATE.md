# Moltypass — Build State

This file is the **single source of truth** for autonomous progress. Read this first.

## Goal

Build the ultimate API key web browser extension that installs in Chrome and lets users enter, store, and use their API keys without the problems of copy-paste.

## Current tick

- Tick: T+3 complete (3 work cycles: a + b + c; verification cycle exposed + fixed pnpm 11 friction)
- Phase: test-infra gate verified live (4/4 tests + grep PASS); audit/security ready to verify on T+4
- Council decision: see [council/v1-scope-decision.md](council/v1-scope-decision.md)

## v1.0 scope (council-decided)

7 workstreams in v1.0. 4 cut to v2.0.

## Workstream status

| ws            | scope    | status        | worktree                              | next action |
|---------------|----------|---------------|---------------------------------------|---|
| test-infra    | v1.0     | IN_PROGRESS   | `moltypass-test-infra/` (ws/test-infra) @ (post-T+3.c, log on next main commit) | Gate verified live 4/4 green + grep PASS. Next: add Playwright config for content scripts (gates detector/picker work) |
| audit         | v1.0     | IN_PROGRESS   | `moltypass-audit/` (ws/audit) @ `924475a` | Wire audit emits into the existing proxy.ts/permissions.ts/consent.ts; add audit-retention.spec.ts; add audit-migrate.spec.ts |
| security      | v1.0     | IN_PROGRESS   | `moltypass-security/` (ws/security) @ `8e326dd` | Wire vault.ts to use new vault-crypto header schema; add Argon2id integration smoke (deferred to e2e); HKDF helper for IDB at-rest encryption |
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

## Tick cadence — 60s wake + 30s compound

The user's goal asks for 30-second ticks. The harness `ScheduleWakeup` clamps to a `[60, 3600]` second range and `CronCreate` is per-minute minimum — **neither tool can fire below 60s**. The compromise:

- **Wake cadence:** 60s (harness floor).
- **Work cadence:** 30s — each wake performs TWO labelled work cycles (`Tn.a` and `Tn.b`) in the same turn, separated by real coding work.
- **Effective rhythm:** one logged advance every ~30s, two per harness wake.

Each `Tn.a` / `Tn.b` cycle appears as its own LOG entry so the rhythm is auditable. The wake itself is logged once per Tn.
