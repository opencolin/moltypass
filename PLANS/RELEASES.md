# Moltypass — Release plan v0.1 → v2.0

**Council-decided T+1.** See [council/v1-scope-decision.md](council/v1-scope-decision.md).

| Version | Code-name | Target | Scope |
|---|---|---|---|
| **v0.1.0-internal** | Foundation | end of W2 | `test-infra` + `audit`. Vault + per-origin consent + proxy mode (existing sketch) + IDB audit log with the merge gate working. Internal builds only. |
| **v0.5.0-alpha** | Hardened capture | end of W4 | Adds `security` (Argon2id WASM + KDF-version field + encrypted IDB + SECURITY.md) and `detector` (clipboard-less capture from provider key-creation pages). Alpha builds; trusted external testers. |
| **v0.9.0-beta** | Universal capture + revoke | end of W5 | Adds `picker` (Cmd+Shift+M + right-click selection save) and `revoke` (per-grant/per-key/per-origin + key rotation + revocation epoch). Public beta. |
| **v1.0.0** | Public launch | end of W6 | Adds `release` (CI, /privacy, Chrome Web Store assets, version-lockstep script, Vercel Rolling Releases). **Chrome Web Store submission.** |
| **v2.0.0** | Open + enterprise control plane | W10 | `auth` + `dashboard` + `enterprise-sw` + `leak`. Hosted control plane as one B2B bundle: Resend magic-link → workspace → Stripe (~$8-12/seat/mo); admin fleet visibility; chrome.storage.managed policy enforcement; Signal A + B leak detection; open-source the proxy + crypto core; first-class self-host/Docker. |

## Release exit criteria template

For every version, the per-release file specifies:
- **In:** what's shipped (workstream ids + concrete features)
- **Out:** explicitly cut from this release
- **Exit criteria:** the bar (tests pass, manual smoke, dependents green)
- **Risks:** what could slip the release
- **Rollback:** how to back out if found to be bad

## Versioning rule

Strict semver. The release script in `release` workstream keeps `manifest.json` and `package.json` in sync. Never bump by hand.

## v1.0 launch invariants (council red lines)

These must hold at v1.0 release. Any workstream that violates them blocks the release:
1. **IndexedDB encrypted at rest** with a vault-key-derived subkey. No plaintext on disk.
2. **KDF-version field** in the vault header. Migration-path-preserving.
3. **No key bytes** in any audit entry, log, telemetry, or crash dump. CI grep-enforced.
4. **Clipboard-less capture** stays clipboard-less in detector AND picker paths.
5. **Revocation epoch** enforced; stale-epoch requests rejected; every revoke audit-logged.
6. **SECURITY.md** + coordinated-disclosure channel published.
7. **Test gate green** on every PR (typecheck + vitest + grep-no-keys).
