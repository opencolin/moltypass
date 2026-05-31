# Moltypass — Release plan v0.1 → v2.0

Each release is bounded by exit criteria. Per-release detail lives at `PLANS/releases/v<x.y.z>.md`.

| Version | Code-name | Target | Scope |
|---|---|---|---|
| **v0.1.0** | Foundation | end of W1 | Vault + per-origin consent + proxy mode (already sketched) + IDB audit log. Internal-only. |
| **v0.2.0** | Revoke | end of W2 | Add: revoke (per-grant/per-key/per-origin) + key rotation + revocation epoch + abort-in-flight. |
| **v0.3.0** | Capture | end of W3 | Add: provider key-creation detector + element picker + context-menu save. Clipboard-less in all three paths. |
| **v0.4.0** | Audit UI | end of W3 | Polished sharing-dashboard with revoke, rotate, anomaly sidebar (Signal B local volume baseline). |
| **v0.5.0** | Enterprise bridge | end of W4 | Add: chrome.storage.managed bootstrap + IDB outbox + policy enforcement. Inert for personal users. |
| **v0.6.0** | Web foundation | end of W4 | Hosted collector + admin dashboard (overview, grants, keys, devices, anomalies, policy, tokens) with magic-link auth. |
| **v0.9.0** | Hardening | end of W5 | Argon2id KDF (with PBKDF2 fallback) + IDB-at-rest encryption + collector replay protection (nonce + timestamped Bearer). |
| **v1.0.0** | Public launch | end of W6 | Chrome Web Store submission. CI pipeline. /privacy + permission justifications. Vercel Rolling Releases. Error reporting off by default. |
| **v1.1.0** | Polish | W7 | Bug-fix follow-ups from W6 review. Address Web Store reviewer feedback. |
| **v1.2.0** | More providers | W8 | Mistral, Cohere, Together, Groq. Custom provider registration UI. |
| **v1.3.0** | Leak Signal A | W9 | Promote Signal A (provider-usage polling) from advisory/beta to GA. Add Anthropic Admin + OpenAI usage endpoints. |
| **v2.0.0** | **Council deciding.** | W10+ | Major next milestone — candidates: multi-browser (Firefox+Safari), mobile companion, MCP server bridge, agent orchestration mode. |

## Release exit criteria template

For every version, the per-release file specifies:
- **In:** what's shipped
- **Out:** explicitly cut from this release
- **Exit criteria:** the bar (tests pass, manual smoke pass, dependent workstreams green)
- **Risks:** what could slip the release
- **Rollback:** how to back out if found to be bad

## Versioning rule

Strict semver. The release script in `release` workstream keeps `manifest.json` and `package.json` in sync. Never bump by hand.
