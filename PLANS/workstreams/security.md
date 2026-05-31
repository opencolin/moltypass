# Workstream: security

## Status: TODO

## Goal
Complete STRIDE pass + ship prioritized mitigations: harden inpage provider, validate cert-verified origins, upgrade KDF to Argon2id (WASM) with PBKDF2 fallback, encrypt IDB at rest, add replay protection (nonce + timestamped Bearer) to collector ingest, produce SECURITY.md.

## Worktree
`/Users/colin/moltypass-security/` on branch `ws/security`.

## First file
`/Users/colin/moltypass/SECURITY.md`

## Files to create
- `SECURITY.md` — STRIDE per surface, trust boundaries, residual risks, responsible-disclosure, pre-launch checklist
- `docs/threat-model.md` — attack trees, data-flow diagrams, Argon2id-vs-PBKDF2 decision record
- `src/crypto/argon2.ts` — WASM wrapper, lazy-loaded, deriveKey(password, salt, params); capability check for fallback
- `src/crypto/idb-crypto.ts` — envelope encryption for IDB records via HKDF from unlocked vault master key; key-derivation epoch makes records unreadable after vault wipe
- `src/shared/origin-trust.ts` — origin allow-list + punycode/look-alike rejection; isTrustedProviderConsole(origin)
- `web/lib/replay-guard.ts` — timestamp + nonce verification; bounded skew; constant-time compare
- `web/lib/nonce-store.ts` — TTL-evicting nonce store backed by Drizzle table
- `src/crypto/vault-crypto.test.ts` — KDF selection, Argon2id correctness, PBKDF2 fallback, migration
- `web/lib/replay-guard.test.ts` — skew + nonce single-use + clock-skew boundaries

## Files to modify
- `src/inpage/provider.ts` — Object.defineProperty {configurable:false, writable:false}; double-injection guard; freeze methods; capture trusted refs to postMessage/structuredClone
- `src/content/index.ts` — validate event.origin === location.origin and event.source === window; per-load random channel token; document hostile-extension residual risk
- `src/background/consent.ts` — use origin-trust to display verbatim cert-verified origin; flag look-alikes
- `src/background/index.ts` — assert sender.origin on every message; reject untagged messages; central origin derivation
- `src/crypto/vault-crypto.ts` — KDF abstraction with {alg, params, version} header; Argon2id when available, PBKDF2 fallback; re-wrap-on-unlock migration; expose master key for HKDF
- `src/background/vault.ts` — derive + hold IDB subkey in SW memory; auto-lock zeroizes; never persist subkey
- `src/audit/audit.tsx` — read/write via idb-crypto; render locked state when subkey unavailable
- `web/app/api/ingest/route.ts` — invoke replay-guard before persist; assert metadata+fingerprints only
- `web/lib/auth.ts` — bearer with issued-at + skew validation; constant-time SHA-256 compare
- `web/lib/db.ts` — ingest_nonces table (orgId, nonce, expiresAt; unique + ttl index)
- `manifest.json` — strict CSP (no unsafe-eval; wasm-unsafe-eval only if Argon2id requires); minimize host_permissions; audit web_accessible_resources

## Dependencies
- detector (cert-verified-origin path is enforced inside detector)
- auth (bearer + nonce store live in web/lib + db)
- audit (IDB encryption envelope wraps audit records)
- enterprise-sw (replay-guarded ingest receives outbox events)

## Complexity / days
L / 9

## Top risks
1. Argon2id WASM may not load under MV3 CSP/SW — fallback to PBKDF2 partial mitigation.
2. Encrypting IDB at rest conflicts with storage-backed-while-locked invariant — audit writes during locked state may be blocked/buffered.
3. KDF migration is destructive if mishandled — needs reversible migration + strong tests.
4. Replay-protection insert per ingest = hot path / contention; TTL eviction critical.
5. Punycode/look-alike origin detection — overly strict breaks legit subdomains; loose leaves phishing surface.
6. Hostile extension chrome.runtime interception — no robust in-product fix; documented as residual.
7. Constant-time + skew handling — easy to get subtly wrong.

## Open questions
- Argon2id WASM lib choice (argon2-browser vs hash-wasm) + CSP requirements?
- Argon2id parameters (memory KiB / iterations / parallelism) hitting <1s unlock on low-end hw?
- Skew window + nonce store backend (Drizzle vs KV/Redis at scale)?
- IDB subkey derivation — re-derive on every wake or accept buffered writes when locked?
- Residual hostile-extension risk acceptable for launch?
- Does create-detector have cert-verified-origin signal under MV3?

## Exit criteria
- Argon2id loads under MV3 CSP, or PBKDF2 fallback documented + verified.
- Vault migration from PBKDF2 → Argon2id reversible; no user lockout possible.
- IDB audit records ciphertext on disk; readable only with unlocked vault.
- /api/ingest rejects stale + replayed requests.
- SECURITY.md + docs/threat-model.md complete and reviewed.
- Manifest CSP minimal and audited.
