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

---

## T+4 · merge wave + live verification + v0.1.0-internal tag

### T+4.a · merge test-infra; pull main into audit; fix 2 audit bugs

- Merged `ws/test-infra` → main (commit `e69d8da`). Main now has full test infrastructure.
- Merged `main` → `ws/audit` (commit `eea4e21`). Audit worktree inherits deps.
- Live-tested in audit worktree: 3 real bugs surfaced.
  - **State bleed:** audit-db.ts cached IDB connection survived fake-indexeddb reset. Fix: exported `__resetForTesting()`; tests call in `beforeEach`. (audit `@b5f75a6`)
  - **Cursor pagination timeout:** `continuePrimaryKey` either missing or looped in fake-indexeddb. Fix: rewrote with skip-until-after sentinel comparing primary key vs cursor value.
- Result: audit worktree 10/10 green. Merged → main (`c007a6c`). Tore down ws/test-infra and ws/audit.

### T+4.b · install + test security; merge → main

- Merged `main` → `ws/security`. Same install template applied (no new friction).
- Live-tested in security worktree: 11/11 green on first run. No bugs.
- Merged `ws/security` → main (`88edfc8`). Tore down ws/security.

### T+4.c · v0.1.0-internal milestone tag

- Main now has test-infra + audit + security all merged. 17/17 tests green.
- Tagged **v0.1.0-internal** — council scheduled this for end of W2 (test-infra + audit); landed it early with security as a bonus (was planned for W4 / v0.5.0-alpha).
- All workstream worktrees torn down. Only main remains.

**Live verification stack on main:** 4 smoke + 6 audit-db + 7 vault-crypto = 17 tests in ~1.5s.

Next: spin ws/detector for the W3 clipboard-less capture work; wire audit.proxyOk/proxyError emits into the existing proxy.ts.

---

## T+5 · compound tick (a: audit integration on main; b: detector spin)

### T+5.a · wire audit emits into proxy.ts (integration on main, no worktree)

Modified `src/background/proxy.ts` to accept an optional `ProxyAuditContext { origin, grantId?, keyFingerprint?, keyLabel? }`. Emits:
- 2xx upstream → `auditLog.proxyOk` (status, pathPreview, latencyMs, bytesUp/Down)
- 4xx/5xx → `auditLog.proxyError`
- fetch throws → `auditLog.proxyError(status:0, error: msg)` then re-throws

Emits are fire-and-forget (`void`) so the hot path never blocks on IDB writes. `ProxyResponse` gains `latencyMs` for caller display.

Wrote `tests/proxy.spec.ts` with 4 integration cases (2xx, 429, fetch reject, no-context skip). vault.getKeyPlaintext mocked at the module boundary. **21/21 green on main** (`0ba2318`).

### T+5.b · spin ws/detector + key-scan + 11 tests

- Spun `moltypass-detector` worktree on `ws/detector` from main.
- Wrote `src/content/key-scan.ts`: `findKeyInSubtree(root, shape)` with TreeWalker + hidden-subtree skip + first-match-in-document-order; `isInsideDialog(el)` heuristic (role=dialog / aria-modal=true / <dialog>).
- Wrote `tests/key-scan.spec.ts` with 11 cases across 3 providers.
- Live-tested: 31/32 first run, 1 bug found.
  - **Anchored regex vs substring scan:** provider `keyShape` is `/^...$/` for full-string validation; my walker tried to match anchored regex against text nodes containing prefixes ("API key: AIza..."). The Anthropic and OpenAI tests passed because their fixtures put the key in its own element (anchored worked); Gemini's `<p>API key: AIza...</p>` failed.
  - Fix: `unanchor(re)` strips leading `^` and trailing `$` before scanning. Background capture handler will re-validate the matched substring against the original anchored shape before vault storage — defense in depth.
- After fix: **32/32 green** in detector worktree.

Scheduling next 60s wake. Next plan: T+6.a write `src/content/detector-banner.ts` (Shadow DOM banner) + `src/background/capture.ts` (background handler); T+6.b add capture.spec.ts + content-script entry wiring.

---

## T+6 · compound tick (a: capture handler; b: Shadow DOM banner)

### T+6.a · src/background/capture.ts + 9 tests

Dependency-injected handler — `CaptureDeps { isVaultUnlocked, askForConfirmation, saveToVault }`. Re-validates against the ANCHORED provider `keyShape` (the scan-time anchor stripping in key-scan.ts is the inbound side; this is the outbound guard before anything touches the vault). Rejects on `unknown_service`, `shape_invalid`, `vault_locked`, `user_denied`, `internal`. Emits `audit.capture` only after the vault save succeeds.

`maskCandidate(s)` shows first 8 + last 4 with `…` separator; fully masks candidates ≤14 chars.

9 unit tests cover every reject path and the happy path (assertion that audit-db has the emitted event).

### T+6.b · src/content/detector-banner.ts + 6 tests + defense-in-depth refactor

`mountSaveBanner` attaches a host element to `document.body` with `z-index: 2147483647` and `all: initial`, then a **closed** Shadow DOM root for the actual UI. Single-instance — replaces any prior banner. Returns a `BannerHandle { destroy() }` that's idempotent.

**Security plugin caught an `innerHTML` use** — even though the template was a static string literal with all user fields set via `textContent` afterward, the guidance said no `innerHTML` in a content script at all. Refactored to pure `createElement` + `append` + `textContent`. Same DOM output, zero HTML-parser surface, no drift risk if a future contributor adds a template variable.

6 tests: host attaches to body, single-instance replacement, idempotent destroy, Save click fires `onSave` + destroys, Dismiss click fires `onDismiss` + destroys, plaintext candidate never appears in `host.outerHTML` (the closed-shadow security property).

**Worktree state:** ws/detector now has key-scan + capture + banner with 47/47 tests green. Next tick: detector content-script entry that wires it together + content-script-injected runtime registration + merge prep.

---

## T+7 · compound tick (a: detector entry; b: merge + v0.5.0-alpha)

### T+7.a · src/content/detector.ts + 10 tests + manifest update

Wrote `startDetector(ctx)` and `detectProviderFromHost(host)`. MutationObserver on `document.body` (childList + subtree); on each batch of added nodes, finds dialog ancestors (role=dialog / aria-modal=true / <dialog>) and runs key-scan inside them. First match triggers the Shadow DOM banner. Re-banner protection — same candidate within the same lifetime doesn't re-prompt.

Production boot is gated by `__moltypass_detector_test` global so unit tests can import without auto-starting an observer.

Updated `vite.config.ts` to add a second `content_scripts` entry matching the three provider key-creation URLs at `document_idle`.

10 detector entry tests + flipped two test files from `innerHTML=''` to `replaceChildren()` (consistent "no innerHTML anywhere in detector code" policy after the security-guidance plugin flag).

Detector worktree: **57/57 green** (`4458a91`).

### T+7.b · merge + v0.5.0-alpha tag

- Merged `ws/detector` → main. 57/57 green on main after merge.
- **Tagged v0.5.0-alpha** — council scheduled security + detector for W4 / v0.5.0-alpha; both landed.
- Tore down `moltypass-detector` worktree.

**Main status:** v0.1.0-internal + v0.5.0-alpha both tagged. 8 test files, 57 tests, ~1.8s wall-clock.

Next: T+8 spins ws/picker (Cmd+Shift+M + right-click context menu) and ws/revoke in parallel.
