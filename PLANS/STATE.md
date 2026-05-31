# Moltypass — Build State

This file is the **single source of truth** for autonomous progress. Read this first.

## Goal

Build the ultimate API key web browser extension that installs in Chrome and lets users enter, store, and use their API keys without the problems of copy-paste.

## Current tick

- Tick: T+0 (bootstrap)
- Phase: Planning
- Worktrees: none yet
- Open background tasks: none yet

## Workstream status

| ws | status | worktree | next action |
|---|---|---|---|
| audit         | TODO  | —                       | start in T+1 (after PM council decision) |
| revoke        | TODO  | —                       | gated on audit |
| leak          | TODO  | —                       | gated on audit, revoke |
| detector      | TODO  | —                       | gated on audit |
| picker        | TODO  | —                       | gated on detector |
| enterprise-sw | TODO  | —                       | gated on audit, revoke, auth, dashboard |
| dashboard     | TODO  | —                       | gated on auth, audit, revoke, leak |
| auth          | TODO  | —                       | gated on dashboard (mutual, co-developed) |
| release       | TODO  | —                       | gated on enterprise-sw, dashboard |
| security      | TODO  | —                       | gated on detector, auth, audit, enterprise-sw |

## Releases

Defined in [RELEASES.md](RELEASES.md). v0.1 through v2.0.

## Background tasks in flight

(none currently — will be populated as workflows launch)

## How to resume

If you are a future agent (or human) picking this up cold:
1. Read this file.
2. Read [ROADMAP.md](ROADMAP.md) for the full picture.
3. Read the latest entries in [LOG.md](LOG.md).
4. Read the workstream file matching the next action above.
5. Check `git worktree list` and `git branch -a` for in-flight work.
6. Resume from whichever workstream is at `IN_PROGRESS` or pick the next `TODO` with met dependencies.

## Conventions

- All worktrees are siblings of `/Users/colin/moltypass/` named `moltypass-<ws>/`.
- Each worktree's branch is `ws/<ws>`.
- Each workstream file lives at `PLANS/workstreams/<ws>.md` and has a `## Status` section.
- Every meaningful action gets a line in `LOG.md` (append-only, timestamped, tick-numbered).
- Council decisions live at `PLANS/council/<topic>-decision.md`.
- Release scope lives at `PLANS/releases/v<x.y.z>.md`.
