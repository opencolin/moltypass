# Moltypass Security

This document is the authoritative threat model and security policy for Moltypass. It is updated with every change that touches a security-sensitive surface and is reviewed before every public release.

> **Status:** v1.0 draft. Work in progress under the `security` workstream. See `PLANS/workstreams/security.md`.

## Reporting a vulnerability

Email `security@moltypass.app` (PGP key TBD before v1.0 public launch). We aim to acknowledge within 72 hours and remediate critical issues within 14 days.

Do not file public issues for security vulnerabilities.

## Trust model — summary

Moltypass is a Chrome MV3 extension that holds AI API keys in a local encrypted vault and proxies AI requests so the key never enters the page.

| Surface | Trust assumption | Mitigations |
|---|---|---|
| **Inpage provider** (page main world) | Hostile by default | `Object.defineProperty {writable:false, configurable:false}`, double-injection guard, captured-trusted-refs to `postMessage`/`structuredClone` |
| **Content script** (isolated world) | Trusted-ish: assumes page may be hostile but extension code is intact | `event.source === window` + `event.origin === location.origin` + per-load random channel token |
| **Background service worker** | Authoritative origin from `MessageSender.origin` only | Single source of origin truth; no handler reads page-supplied origin |
| **Vault** | Plaintext only briefly in SW memory; ciphertext at rest | PBKDF2(600k) for v0; Argon2id (WASM) target for v1.0; AES-GCM; KDF-version field in header |
| **IndexedDB audit** | Encrypted at rest with vault-derived subkey | HKDF subkey, encrypted only while vault is unlocked; key-derivation epoch invalidates records on vault wipe |
| **Collector ingest** (v2.0) | Authenticated, replay-protected | Bearer token + timestamp + single-use nonce + bounded skew |

## KDF — v1.0 launch decision

Council T+1 binding:
- **Ship Argon2id (WASM)** with pinned parameters as the launch KDF.
- **Mandatory KDF-version field** in the vault header — non-negotiable regardless of which primitive ships. Allows clean migration to a future KDF without a flag day.
- PBKDF2(600k) remains available as a fallback if Argon2id WASM cannot load reliably under MV3 CSP. Falling back requires written, reviewed justification.

### Vault header (forward-compatible)

```ts
interface VaultHeader {
  version: number;              // header schema version
  kdf: {
    alg: 'argon2id' | 'pbkdf2';
    version: number;            // KDF param-set version
    params: Record<string, number | string>;
  };
  salt: string;                 // base64
  canary: string;               // encrypted canary for password verification
}
```

## Surfaces and STRIDE — v1.0 in-scope

> Full STRIDE table will populate as workstreams land. Each surface below carries a "S/T/R/I/D/E" annotation: which threats we mitigate, which we accept as residual.

### Inpage provider (`src/inpage/provider.ts`)
- **Spoofing:** Page can attempt to redefine `window.moltypass`. Mitigation: non-writable non-configurable property + initialization event + frozen methods.
- **Tampering:** Page can patch `postMessage`. Mitigation: capture trusted refs at module load before page scripts execute.
- **Repudiation:** N/A — provider is stateless.
- **Information disclosure:** Returned values may include sensitive metadata. Mitigation: documented response shapes contain no key bytes.
- **Denial of service:** Page can flood requests. Mitigation: per-origin rate limiting in background SW.
- **Elevation:** N/A — provider has no authority.

### Background SW (`src/background/`)
- **Spoofing of origin:** Page-supplied origins rejected; only `MessageSender.origin` accepted.
- **Tampering of vault on disk:** AES-GCM authenticated encryption detects tamper.
- **Repudiation:** Audit log records every grant/revoke/proxy/reveal/capture event with cryptographic fingerprint.
- **Information disclosure (logs):** CI grep guard blocks key-shaped strings from source and tests.

### IndexedDB audit (`src/background/audit-db.ts`)
- **At-rest disclosure:** Records encrypted with vault-derived HKDF subkey; unreadable after vault wipe.
- **Tampering of audit history:** Each record carries `seq` + ts; gaps detectable on read. (TODO: per-record HMAC for stronger tamper-evident chain.)

## Pre-launch checklist (v1.0)

- [ ] Argon2id WASM loads under MV3 CSP (or documented PBKDF2 fallback)
- [ ] KDF-version field in vault header + reversible migration tested
- [ ] IndexedDB audit records encrypted at rest with HKDF-derived subkey
- [ ] CI grep guard blocks key-shaped strings outside `tests/fixtures/synthetic-keys.ts`
- [ ] `Object.defineProperty {writable:false, configurable:false}` on `window.moltypass`
- [ ] `MessageSender.origin` is the sole origin source; no handler reads page-supplied origin
- [ ] Revocation epoch read before AND after every upstream fetch; stale-epoch rejected
- [ ] SECURITY.md complete with disclosure channel + PGP key
- [ ] STRIDE table complete for inpage/content/background/audit
- [ ] No `console.log`, `chrome.notifications`, or `fetch` body containing key bytes (audited)

## Out of scope for v1.0 (council T+1)

- Collector ingest replay protection — `enterprise-sw` cut to v2.0
- Magic-link auth abuse prevention — `auth` cut to v2.0
- Leak detection signals — `leak` cut to v2.0

## Residual risks (documented, accepted at v1.0)

- **Hostile sibling extension intercepting `chrome.runtime` messages.** Limited mitigation possible. Documented; users should review installed extensions.
- **Revoke TOCTOU streaming window.** Acceptable per council if epoch enforced, every revoke audit-logged, and residual documented (here). Unit test gating: stale-epoch request must be rejected.
- **Plaintext key visible in provider DOM during capture.** The page itself already has access; we add no new exposure but cannot remove the existing one.
