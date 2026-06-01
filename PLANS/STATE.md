# Moltypass — Build State

This file is the **single source of truth** for autonomous progress. Read this first.

## Goal

Build the ultimate API key web browser extension that installs in Chrome and lets users enter, store, and use their API keys without the problems of copy-paste.

## Current tick

- Tick: T+25 complete (leak merged → main; **v2.0.0 tagged**)
- Phase: **v2.0.0 reached.** 341/341 tests on main. 4 v2.0 workstreams substantively merged (auth lib, dashboard lib, enterprise-sw, leak). Route handlers + RSC pages remain in ws/auth and ws/dashboard for v2.1.
- Council decision: see [council/v1-scope-decision.md](council/v1-scope-decision.md)

## v1.0 scope (council-decided)

7 workstreams in v1.0. 4 cut to v2.0.

## Workstream status

| ws            | scope    | status        | worktree                              | next action |
|---------------|----------|---------------|---------------------------------------|---|
| test-infra    | v1.0 | ✅ MERGED          | — | done |
| audit         | v1.0 | ✅ MERGED          | — | done |
| security      | v1.0 | ✅ MERGED          | — | done |
| detector      | v1.0 | ✅ MERGED          | — | done |
| picker        | v1.0 | ✅ MERGED          | — | done |
| revoke        | v1.0 | ✅ MERGED          | — | done |
| release       | v1.0 | ✅ MERGED          | — | done — v1.0.0 tagged |
| auth          | v2.0 | IN_PROGRESS (T+16) | `moltypass-auth/` (ws/auth) | shared schema landing in dashboard worktree; auth picks up `web/lib/auth/session.ts` after |
| dashboard     | v2.0 | IN_PROGRESS (T+16) | `moltypass-dashboard/` (ws/dashboard) | own `web/lib/db.ts` extensions (users, memberships, magic_link_tokens, admin_actions, ingest_nonces) first; then RSC routes |
| enterprise-sw | v2.0 | TODO               | — | spin after auth+dashboard schema lands |
| leak          | v2.0 | TODO               | — | spin after enterprise-sw |

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

## Tick cadence

- **30s ticks** via a persistent `Monitor` running `while true; do echo tick; sleep 30; done`. Each echoed line is a notification that re-invokes the agent. This satisfies the goal's literal "30-second ticks" requirement; `ScheduleWakeup`'s `[60, 3600]` floor prevented meeting it via the wake API alone.
- `ScheduleWakeup` is reduced to a **1200s fallback heartbeat** in case the Monitor stops.
- Within each tick, work is still labelled in compound cycles (T+N.a, T+N.b, ...) when more than one logical unit lands.
- To stop the loop: `TaskStop` the Monitor (use `TaskList` to find the task ID).

## Tick cadence — 60s wake + 30s compound

The user's goal asks for 30-second ticks. The harness `ScheduleWakeup` clamps to a `[60, 3600]` second range and `CronCreate` is per-minute minimum — **neither tool can fire below 60s**. The compromise:

- **Wake cadence:** 60s (harness floor).
- **Work cadence:** 30s — each wake performs TWO labelled work cycles (`Tn.a` and `Tn.b`) in the same turn, separated by real coding work.
- **Effective rhythm:** one logged advance every ~30s, two per harness wake.

Each `Tn.a` / `Tn.b` cycle appears as its own LOG entry so the rhythm is auditable. The wake itself is logged once per Tn.
