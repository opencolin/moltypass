# v2.1 Council Binding Decision — Beat 1Password

**Status:** BINDING. Head of product decision.
**Date:** 2026-07-17.
**Signal:** Goal set 2026-07-17 by Colin. Mid-turn signal: 1Password shipped an MCP server for their new "Environments" feature. This changes v2.1 scope — MCP becomes centerpiece.

## Binding thesis

**Moltypass beats 1Password in the AI-key vertical by shipping a zero-knowledge MCP server that goes DEEPER on the AI use case than they can — because we already have per-tool consent, per-origin grants, tool-aware CLI, and browser console capture, and they don't.**

1Password's MCP is narrow (Environments only) and defensive (zero-knowledge). Our MCP will be zero-knowledge too — that's the right pattern — but with a tool surface that maps 1:1 onto the AI-agent workflow (list keys, exec commands with keys injected, revoke grants, capture from providers, inspect anomalies). We are still early to the market: 1Password just shipped v1 in July 2026. First real launch wins the mindshare in this space.

## Non-negotiable invariants

1. **Local-first.** Keys never leave the machine. No cloud key storage. Ever.
2. **Zero-knowledge MCP.** The MCP client (agent) NEVER receives raw key values. Metadata and command output only.
3. **AI-keys-only.** No general password features. Stay vertical.
4. **Open-source MIT.** No feature is gated by paid tier when it protects security — audit, revoke, anomaly signals stay free.
5. **User consent per action.** Touch ID unlock at MCP call time; per-origin/per-tool grants respected in MCP just like in browser/CLI.

## v2.1 — MCP + Vault Depth (target: 2 weeks)

**Theme:** Ship the MCP server + the vault-item depth 1Password has and we don't.

### Must ship

1. **Moltypass MCP server** — zero-knowledge, stdio transport, ~12 tools. See [PLANS/mcp-spec.md](../mcp-spec.md). This is the launch.
2. **`moltypass://` URI scheme** — resolver on the daemon side, alias `multipass://`. Referenced by MCP + CLI + any config file.
3. **Item notes** — free-text field per vault item. Encrypted inside the existing AES-GCM envelope.
4. **Item history / per-item audit** — mutation log extending the existing IndexedDB audit. Referenced by MCP `item_history`.
5. **Auth + Dashboard punch-list** — route handlers + RSC pages that were pending from v2.0 workstreams.

### Stretch

6. **Attached files** — encrypted binary blobs for GCP service-account JSON keyfiles. Referenced by MCP `list_keys` (field=`file:<name>`).
7. **Emergency Kit** — printable PDF recovery doc.

### v2.1 workstreams

| # | Name | Worktree | Branch | Depends on | Deliverable | Tests target |
|---|---|---|---|---|---|---|
| 1 | `mcp-server` | `moltypass-mcp/` | `ws/mcp` | daemon protocol (ws/cli merged) | Standalone `moltypass-mcp` binary, stdio MCP transport, 12 tools, integration tests with mock daemon | 30+ |
| 2 | `uri-scheme` | `moltypass-uri/` | `ws/uri` | none | `parseMoltypassUri` + resolver, alias `multipass://`, wired into MCP + CLI | 15+ |
| 3 | `item-notes` | `moltypass-notes/` | `ws/notes` | none | Notes field in vault schema, encrypted, popup UI + MCP `annotate_item` | 10+ |
| 4 | `item-history` | `moltypass-history/` | `ws/history` | none | Item-mutation audit event kind + History tab in item detail + MCP `item_history` | 12+ |
| 5 | `dashboard-rsc` | existing `moltypass-dashboard/` | existing `ws/dashboard` | none | Finish route handlers + RSC pages from v2.0 punch-list | brings ws/dashboard to green on latest main |
| 6 | `auth-rsc` | existing `moltypass-auth/` | existing `ws/auth` | dashboard schema | Finish route handlers + magic-link flow from v2.0 punch-list | brings ws/auth to green on latest main |

### Kickoff order

Spin worktrees in this order (highest priority first for parallel work):

1. `ws/mcp` — biggest new surface, blocks the launch
2. `ws/uri` — small, referenced by MCP tools
3. `ws/notes` — small, referenced by MCP `annotate_item`
4. `ws/history` — medium, referenced by MCP `item_history`
5. `ws/dashboard` — existing worktree, needs punch-list completion
6. `ws/auth` — existing worktree, follows dashboard schema

Merge order to main: `ws/uri` → `ws/notes` → `ws/history` → `ws/dashboard` → `ws/auth` → `ws/mcp` (last because it depends on all others).

## v2.5 — Enterprise Wedge (target: 1 month after v2.1)

**Theme:** Ship what enterprise procurement asks about — SSO + Connect + retention.

### Must ship

- **SSO via SAML/OIDC** — team sign-in
- **SCIM provisioning / deprovisioning** — auto-revoke tied to revoke epoch
- **Audit retention + SIEM streaming** — Splunk/Datadog webhook, built on v2.1 export
- **Watchtower stale-key alerts** — dashboard chip: "3 keys not rotated 90+ days"
- **Connect mode** — signed machine token for unattended CI runners

### v2.5 workstreams

| Name | Worktree | Branch | Deliverable |
|---|---|---|---|
| `sso-scim` | `moltypass-sso/` | `ws/sso` | SAML/OIDC + SCIM in `web/lib/auth` + dashboard settings pages |
| `audit-retention-siem` | `moltypass-retention/` | `ws/retention` | Retention policy engine + Splunk/Datadog stream, built on IDB export |
| `stale-key-watchtower` | `moltypass-watchtower/` | `ws/watchtower` | Age-tracking + dashboard chip + email notification |
| `connect-machine-token` | `moltypass-connect/` | `ws/connect` | Signed JWT-shape machine token + verify endpoint on daemon |

## v3.0 — SOC 2 + Team Sync (target: 2 months after v2.5)

**Theme:** Enterprise trust story + team-scale multi-device.

### Must ship

- **SOC 2 Type II readiness** — control implementation, evidence collection, tamper-evident audit log
- **Peer-to-peer / user-owned-S3 team sync** — never our cloud
- **Shell-plugin biometric mode** — per-call Touch ID for `moltypass exec <tool>`
- **MDM policy engine** — Chrome MDM + Homebrew policy for managed installs
- **1P Business feature-parity matrix** — sales enablement kit

### v3.0 workstreams

| Name | Worktree | Branch | Deliverable |
|---|---|---|---|
| `soc2-readiness` | `moltypass-soc2/` | `ws/soc2` | Evidence bundle + control-implementation checklist + tamper-evident audit hashchain |
| `team-sync-p2p` | `moltypass-sync/` | `ws/sync` | Syncthing-pattern P2P OR user-S3 with client-side encryption |
| `mdm-policy` | `moltypass-mdm/` | `ws/mdm` | ExtensionSettings bundle expansion + policy fetch + enforcement |
| `shell-plugin-biometric` | `moltypass-plugin/` | `ws/plugin` | `moltypass shell-plugin <tool> --touchid-every-call` wrapper pattern |

## Explicitly not building

- General passwords, TOTP/2FA, passkeys, SSH keys — off-mission, that's 1Password's core.
- Cloud sync via our own service — breaks local-first invariant.
- Autofill on login forms — wrong shape for API keys (we proxy, don't autofill).
- Third-party integrations catalog (Slack, Notion, etc.) — Composio/Station70 lane, not ours.
- Passwords in the MCP — the MCP is AI keys only.
- Returning raw key values from MCP tools — zero-knowledge invariant.

## Signals that shaped this decision

- **1Password MCP shipped July 2026** (feature-flagged Labs). We are still early, and if we ship a fuller MCP with tool-aware exec + per-origin consent + browser capture, we own the "AI-first credential manager" narrative.
- **1P MCP is narrow (Environments only)** — deliberately safe. Our MCP can be broader because our whole product IS the AI-key vertical.
- **5-PM council consensus** (see [council-proposals-raw.md](council-proposals-raw.md) once written): 4 of 5 PMs voted `moltypass://` URI + CLI GA for v2.1. 3 of 5 voted item history. Universal: v2.0 punch-list finish.
- **Sam (Ex-1P PM) argument** was strongest for v2.1: "close the day-one 'why can't I do X' complaints" — item notes, item history, attached files, `moltypass://`, Emergency Kit.
- **Marcus (Enterprise PM) argument** shifts to v2.5+: Connect mode, SSO/SCIM, audit retention — real, but not first-day pain.

## Sources

- 1Password MCP official docs: https://www.1password.dev/environments/mcp-server
- 1Password Cursor Plugin: https://github.com/1Password/cursor-plugin (7 MCP tools, `1password-mcp` binary, macOS-only)
- 1Password Kiro Plugin: https://github.com/1Password/1password-kiro-plugin
- Third-party CakeRepository/1Password-MCP: https://github.com/CakeRepository/1Password-MCP (13 tools, breaks zero-knowledge, NOT our model)
- 5-PM council raw proposals: see workflow transcript `wf_cc941682-da5`
