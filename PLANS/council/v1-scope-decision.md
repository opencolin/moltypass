# PM Council — v1.0 Scope Decision

**Date:** T+1
**Workflow:** `wdvlstti0` (5 PM personas + synthesizer)
**Output file:** `/private/tmp/.../wdvlstti0.output`

## Decision

### v1.0 scope (7 workstreams)
- `test-infra` (new — peer to audit, not bolted onto release)
- `audit`
- `security`
- `detector`
- `picker`
- `revoke`
- `release`

### Cut from v1.0 → v2.0
- `auth` → v2.0 (hosted control plane: Resend magic-link + workspace creation)
- `dashboard` → v2.0 (admin fleet-visibility console, paired with auth + enterprise-sw)
- `enterprise-sw` → v2.0 (chrome.storage.managed policy enforcement, IDB outbox, MDM/Docker bundle)
- `leak` → v2.0 (Signal A + Signal B together, with a real user-facing alerting surface)

### First-wave worktrees (spin now)
- `test-infra` — branch `ws/test-infra`, dir `/Users/colin/moltypass-test-infra/`
- `audit` — branch `ws/audit`, dir `/Users/colin/moltypass-audit/`
- `security` — branch `ws/security`, dir `/Users/colin/moltypass-security/`

### Release schedule

| Version | Week | Contents |
|---|---|---|
| v0.1.0-internal | 2 | test-infra + audit |
| v0.5.0-alpha    | 4 | security + detector |
| v0.9.0-beta     | 5 | picker + revoke |
| v1.0.0          | 6 | release (Chrome Web Store submission) |
| v2.0.0          | 10 | auth + dashboard + enterprise-sw + leak |

### v2.0 vision
> v2.0 is the billable "open + enterprise control plane" release, built on a battle-tested local-first extension. It lands the hosted control plane as one coherent B2B bundle that is sold together or not at all: Resend magic-link auth → workspace creation → Stripe per-seat subscription (~$8–12/seat/mo) as the billing spine; the admin dashboard rendering real fleet visibility (who holds keys, revoke-from-console, SOC2-ready audit trail); and enterprise-sw managed-policy enforcement (chrome.storage.managed, IDB outbox, MDM bundle) so the dashboard controls rather than merely observes. It graduates leak detection to a real user-facing alerting surface and ships "open" as a sales/design-partner-driven motion: open-source the proxy + crypto core (the strongest trust signal a key vault can send, now auditable in public) and first-class supported self-host/Docker.

## Resolved open decisions

| Question | Decision | Reasoning |
|---|---|---|
| **KDF** | Argon2id (WASM) + **mandatory KDF-version field in vault header** | Memory-hard defense against GPU/ASIC offline attacks. Version field non-negotiable regardless — 1-day insurance against being locked in. Schedule headroom comes from cutting the 26-day B2B layer. |
| **Hosted vs self-host** | Self-host / local-first is v1.0 primary; hosted control plane is v2.0 primary | 3-of-5 PMs. Hosted is a second product with its own attack surface; stand it up after the crypto is battle-tested. |
| **Resend timing** | Deferred to v2.0 with the rest of auth | Auth moves, Resend follows. Rate limiting + link-replay enforcement must ship together when it does. |
| **Leak Signal A scope** | Cut entirely from v1.0 → v2.0 (with Signal B) | Half-baked "we protect you" is a worse trust signal than not claiming it. Needs real-traffic baselines and a real alerting surface. |
| **Revoke TOCTOU residual** | Ship in v1.0 IF (a) epoch enforced + stale-epoch requests rejected, (b) audit log records every revoke, (c) residual documented (not silently shipped) | Unit test proving stale-epoch rejection is the gate. |
| **Test infrastructure** | `test-infra` in W1 as a first-wave workstream. Every PR gated on `tsc --noEmit` + unit tests on new business logic. CI grep-blocks key-shaped strings in audit/logs/fixtures. | Uncontested by any PM, purely a sequencing call. ~3 dev-days for fake-indexeddb + chrome.* mock + Playwright MV3 rig. The gate is the floor, not gold-plating. |
| **Picker (load-bearing or polish?)** | Stays in v1.0 | UX red line: no "paste your key here" textbox as the primary onboarding path. Picker is the universal fallback if detector misses a provider DOM. |
| **Audit + revoke** | Both stay in v1.0 | Audit is the trust spine; revoke delivers standalone user value (delete + rotate + epoch enforcement) without any server. |

## Consensus (all 5 PMs agreed)
- detector, security, release in v1.0
- IndexedDB-at-rest encryption ships in v1.0 (no "encryption later")
- Heavy leak-detection stack does not belong in v1.0
- The key must never enter the page, the clipboard, or any log/telemetry/crash dump — permanent across every version
- 4-of-5: audit is foundational
- 4-of-5: hosted dashboard + auth + Stripe stack is a distinct second product
- Test infrastructure / CI merge gate uncontested

## Dissents (captured for the record)

- **Business PM:** Strongly dissents from cutting auth + dashboard + enterprise-sw + Stripe billing from v1.0. Without an end-to-end billing path on launch, v1.0 is "just a free Chrome extension." Captured as the explicit rationale for v2.0 being the billable control plane.
- **UX PM:** Dissents from cutting dashboard. Half-finished dashboard reads as abandonware. In a local-first v1.0 there is no hosted dashboard to look unfinished; the audit-events-must-be-real standard carries forward to v2.0.
- **Ship-Fast PM:** Wanted PBKDF2(600k) shippable and a 3-workstream vault (detector + security + release). Overruled on KDF; honored on "do not slip ship" by cutting the 26-day B2B layer.
- **Eng-quality PM:** Wanted enterprise-sw IN as table stakes for MDM/self-host buyer. Overruled — enterprise-sw moves to v2.0 with the rest of managed-policy bundle.

## Action items

1. Spin worktrees for `test-infra`, `audit`, `security` (this tick).
2. Start audit foundation: `src/shared/audit-types.ts` in `moltypass-audit/` (this tick).
3. Update `PLANS/STATE.md` to reflect new scope (CUT entries marked).
4. Update `PLANS/RELEASES.md` to match the council schedule.
5. Write `PLANS/workstreams/test-infra.md`.
