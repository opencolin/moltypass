# Competitive analysis — 1Password

**Status:** Reference doc. 1Password is our closest structural analog and the incumbent developer-focused password manager. Every "beat 1Password" release plan should be checked against this doc.

**Date:** 2026-07-17.

## Positioning takeaway (do not relitigate)

Moltypass is **the vertical AI-key player**. 1Password is the **horizontal generalist that added shell plugins for developers**. We win by going deeper into one credential class than they ever will.

- Do NOT market as "cheaper 1Password" — race to zero.
- DO market as "AI-native, deeper" — console-capture + tool-aware CLI + `fetchFor` proxy as the pitch. Free-forever is the objection-remover, not the pitch.

## Full comparison table

| Feature | 1Password | Moltypass v1.0 | Moltypass v2.0 | Ship? | Priority |
|---|---|---|---|---|---|
| Local encrypted vault | ✓ | ✓ | ✓ | — | — |
| Touch ID unlock | ✓ | v1.1 planned | ✓ | — | — |
| Browser extension | ✓ | ✓ | ✓ | — | — |
| CLI env injection | `op run` | `moltypass exec` | ✓ | — | — |
| Multi-device sync | ✓ (their cloud) | ✗ | ✗ | **Strategic call** | v3.x |
| Free tier | 14-day trial | Forever | Forever | Advantage — keep | — |
| Open source | ✗ | ✓ (MIT) | ✓ | Advantage — keep | — |
| AI-key capture from console | ✗ | ✓ | ✓ | Advantage — expand | — |
| Provider-aware tool catalog | ✗ | ✓ | ✓ | Advantage — expand | — |
| Fetch proxy (browser) | ✗ | ✓ | ✓ | Advantage — expand | — |
| Per-site consent | ✗ (autofill model) | ✓ | ✓ | Advantage — keep | — |
| Audit log (call-level) | ✓ | ✓ | ✓ | — | — |
| URI scheme (`op://` / `moltypass://`) | ✓ | ✗ | ✗ | **YES** | v2.1 must |
| Item notes | ✓ | ✗ | ✗ | **YES** | v2.1 must |
| Item history / mutation log | ✓ | ✗ | ✗ | **YES** | v2.1 must |
| Watchtower (stale/breached) | ✓ | ✗ | Partial | **YES — enhance** | v2.1 should |
| Emergency Kit (printable recovery) | ✓ | ✗ | ✗ | **YES** | v2.1 should |
| Shell plugin biometric | ✓ | ✗ | ✗ | Consider | v2.5+ |
| Attached files (JSON keyfiles) | ✓ | ✗ | ✗ | **YES** | v2.1 must (GCP) |
| Connect (unattended CI) | ✓ | ✗ | Planned | Formalize | v2.5 |
| Enterprise SSO/SCIM | ✓ | ✗ | Planned | — | v3.0 |
| Secret sharing (teammate) | ✓ | ✗ | Planned | — | v3.0 |

## Recommended add list (priority-ordered)

### Must add (small work, expected)
1. **`moltypass://` URI scheme** — parallel to `op://vault/item/field`. `.env.example` can ship `ANTHROPIC_API_KEY=moltypass://anthropic/personal` verbatim. ~2 days. **Also register `multipass://` as alias** (see [branding-aliases.md](../branding-aliases.md)).
2. **Item notes** — free-text field per vault item. Trivial. ½ day.
3. **Item history** — per-item mutation log (created, rotated, revoked, renamed). We have call-level audit; item-level adds a "History" tab. 3–4 days.
4. **Attached files** — vault items carry a binary blob. Needed for GCP service accounts (JSON keyfiles), AWS SSO configs, self-hosted cert bundles. ~1 week.

### Must add (formalize existing plans)
5. **Watchtower-style stale-key alerts** — "3 keys not rotated 90+ days" dashboard chip. 2–3 days.
6. **Emergency Kit** — printable PDF: master-password blank line, vault-file location per OS, "next-of-kin should…" instructions. ~2 days.
7. **Connect mode** — signed long-lived machine token for unattended CI. Sketched in [CLI-AND-DOTFILES.md](../CLI-AND-DOTFILES.md); needs proper spec. ~2 weeks.

### Should consider
8. **Shell plugin biometric mode** — `moltypass shell-plugin aws --touchid-every-call` opt-in wrapper for higher-security workflows. 1–2 weeks for the pattern + one tool.
9. **Multi-device sync** — strategic call. Options: (a) peer-to-peer Syncthing-style, (b) user-provided S3 with client-side encryption, (c) explicit vault export/import only. Punt to v3.x but decide the shape now — affects vault format.

## Explicitly not adding (off-mission)

- **General passwords, TOTP/2FA, passkeys, SSH keys** — their 1Password holds those; we hold AI keys.
- **Cloud sync via our own service** — breaks the local-first wedge.
- **Autofill on login forms** — wrong shape for API keys (we proxy, don't autofill).

## Also-competitor snapshots

Where the 1Password analysis is not enough. For their own detailed docs, see the individual files below (create as needed).

- **Composio** — see [../partnerships/composio.md](../partnerships/composio.md). Their central credential broker had a May 2026 incident; partnership target for "Local Vault mode."
- **Station70 Gatekeeper** — MCP gateway + OAuth broker + policy plane. Adjacent, not head-to-head. Steal: per-tool ALLOW/DENY UX, allowed/denied ratio tiles, live-sessions panel with per-row REVOKE.
- **Bitwarden** — OSS 1Password competitor. Doesn't hold specialized AI-key features. Not head-to-head; users who prefer OSS + free may still choose them for general passwords + us for AI keys.

## Sources of truth

- `PLANS/PROBLEM.md` — anchor problem definition.
- `PLANS/PRD.md` — ICP + UX flows.
- `PLANS/branding-aliases.md` — moltypass:// / multipass:// URI scheme decision.
- `PLANS/partnerships/` — Composio + Hermes pitches.
- `PLANS/council/v21-beat-1password.md` — v2.1 scope binding decision (written by PM Council on 2026-07-17).
