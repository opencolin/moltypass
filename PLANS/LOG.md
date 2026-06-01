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

---

## T+2 · compound tick (2 × 30s work cycles)

**Constraint surfaced:** the user's goal asks for 30s ticks. `ScheduleWakeup` clamps to [60, 3600]s; `CronCreate` is per-minute minimum. Neither tool can fire below 60s. Adopted a **compound tick** pattern: each 60s harness wake performs TWO labelled work cycles, so the effective work rhythm is ~30s. Documented in STATE.md.

### T+2.a · audit + test-infra parallel scaffolding

- audit `@55ae176`: `src/background/audit-log.ts` (high-level façade — proxyOk, proxyError, grant, revoke, reveal, capture, rotate; swallows IDB failures from hot path with TODO dead-letter ring). `tests/audit-db.spec.ts` (vitest suite: append/count, by-origin index, by-kind index, text-search post-filter, prune-older-than, cursor pagination).
- test-infra `@339f1c8`: `package.json` (vitest + jsdom + fake-indexeddb + playwright + tsx + @types/chrome; test:gate runs typecheck + tests + grep guard). `scripts/grep-no-keys.ts` (CI guard scanning src/tests/web/scripts; only `tests/fixtures/synthetic-keys.ts` allow-listed; exit 1 on any sk-ant-/sk-/AIza hit outside that file).

### T+2.b · security KDF abstraction

- security `@48ff72d`: rewrote `src/crypto/vault-crypto.ts` to a KDF-versioned vault header per the council's binding decision. `KdfDescriptor { alg, version, params }`, `VaultHeader { v, kdf, salt, canary }`. API: `deriveMasterKey`, `createHeader`, `unlockWithHeader` (canary verification), `encryptWith` / `decryptWith` (per-entry IV), `rewrapVault` (migration helper). Argon2id is the default alg but the WASM deriver is stubbed — `crypto/argon2.ts` lands next in security workstream.

Scheduling next 60s wake (will contain T+3.a + T+3.b).

---

## T+3 · compound tick (2 × 30s work cycles)

### T+3.a · retention + Argon2id WASM + smoke spec

- audit `@924475a`: `audit-retention.ts` (registerRetentionAlarm/isRetentionAlarm/sweep — daily chrome.alarms-driven 365-day prune; idempotent on every SW wake).
- security `@8e326dd`: `crypto/argon2.ts` (hash-wasm lazy-loaded Argon2id; deriveArgon2idKey returns a non-extractable AES-GCM CryptoKey; isArgon2idAvailable probe for PBKDF2 fallback decision).
- test-infra `@b60ba8e`: `tests/example.spec.ts` (4 smoke cases: chrome.storage round-trip, alarm fire, IDB round-trip, per-test reset).

### T+3.b · legacy replay + crypto tests + CI workflow

- audit (folded into `@924475a`): `audit-migrate.ts` — replayOnce reads legacy `chrome.storage.local['moltypass.audit.tail']`, strict kind/source allow-lists drop malformed entries, sets migration flag BEFORE deleting legacy key (crash-safe against double import).
- security (folded into `@8e326dd`): `tests/vault-crypto.spec.ts` — 7 PBKDF2-path cases (round-trip, wrong-password null, encrypt/decrypt, IV randomness, tamper rejection via AES-GCM tag, rewrapVault fresh salt, header carries Argon2id params).
- test-infra (folded into `@b60ba8e`): `.github/workflows/test-gate.yml` — pnpm install → typecheck → vitest → grep-no-keys. No untrusted-input interpolation. Playwright deferred until detector/picker need it live.

### T+3.c · live verification (completed this tick)

Background `pnpm install` finished mid-turn (exit 0); ran the gate live as a third compound work cycle.

**Verified live:**
- `./node_modules/.bin/vitest run` → 4/4 tests green (chrome.storage round-trip, alarm fire, IDB round-trip, per-test reset)
- `./node_modules/.bin/tsx scripts/grep-no-keys.ts` → PASS

**Friction found + fixed:**
1. pnpm 11 blocks esbuild build scripts by default → added `pnpm.onlyBuiltDependencies: ["esbuild"]` to package.json.
2. pnpm 11's `verify-deps-before-run` pre-check fires even with `.npmrc verify-deps-before-run=false` — apparently not honored in 11.0.9. Workaround: invoke binaries directly.
3. test-gate.yml updated to call `./node_modules/.bin/{tsc,vitest,tsx}` directly. pnpm scripts kept for human use.

Commit: test-infra `@?` (logged on next main commit). Audit/security worktrees still need their own installs to run tests; planned for T+4.

Scheduling next 60s wake.
