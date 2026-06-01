# Moltypass — Activity Log

Append-only. Newest at the bottom. Each entry: timestamp · tick · action.

---

## T+0 · bootstrap

- Initialized git in `/Users/colin/moltypass/` on `main`.
- Created `PLANS/` directory tree (`workstreams/`, `council/`, `releases/`).
- Wrote `STATE.md`, `ROADMAP.md`, `RELEASES.md`, `worktrees.md`.
- Wrote per-workstream plan files for all 10 workstreams.
- Launched PM Council workflow (5 PM personas + synthesizer) to decide release scoping and v2 vision.
- Scheduled next tick (60s wakeup — clamped from requested 30s).
- Did NOT spin worktrees yet; waiting on council decision for first-wave selection.
- Commit `386ca7b` on main.

---

## T+1 · council decision + first-wave spin

PM Council `wdvlstti0` completed. Binding decisions:
- v1.0 scope: test-infra, audit, security, detector, picker, revoke, release (7 ws)
- Cut to v2.0: auth, dashboard, enterprise-sw, leak
- First-wave worktrees: test-infra, audit, security
- KDF: Argon2id (WASM) + mandatory vault-header KDF-version field
- Self-host primary at v1.0; hosted control plane at v2.0
- Release schedule: v0.1 (W2) → v0.5-alpha (W4) → v0.9-beta (W5) → v1.0 (W6) → v2.0 (W10)
- Test-infra: new W1 workstream (peer to audit, not bolted on release)

Actions:
- Wrote `PLANS/council/v1-scope-decision.md` with full decision + dissents.
- Wrote `PLANS/workstreams/test-infra.md` (new workstream).
- Updated `PLANS/STATE.md` and `PLANS/RELEASES.md` and `PLANS/worktrees.md` to match council.
- Spun three worktrees: `moltypass-test-infra` (ws/test-infra), `moltypass-audit` (ws/audit), `moltypass-security` (ws/security).
- Wrote and committed in each:
  - audit @ `bd89c5c`: `src/shared/audit-types.ts` + `src/background/audit-db.ts` (lazy IDB with SW recovery, 5 compound indexes, query/iterate/prune).
  - test-infra @ `5d6df40`: `vitest.config.ts` + `tests/setup/{fake-chrome,fake-idb,index}.ts` + `tests/fixtures/synthetic-keys.ts`.
  - security @ `7fd6f97`: `SECURITY.md` draft (trust model, KDF decision, vault header schema, pre-launch checklist).
- Main commit `66bacc5` carries the PLANS updates.

Scheduled next tick (60s).
