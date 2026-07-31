# 1Password developer surface — deep dive

**Purpose:** Comprehensive per-feature analysis of 1Password's developer stack, mapped to Moltypass. Complements [1password.md](1password.md) which is the higher-level competitive framing.

**Date:** 2026-07-30.

**Method:** Direct WebFetch pass over the six canonical 1Password developer-product pages:
- MCP Server — https://www.1password.dev/environments/mcp-server
- Environments (broader) — https://www.1password.dev/environments
- SSH agent — https://www.1password.dev/ssh
- Touch ID (Mac) — https://support.1password.com/touch-id-mac/
- Watchtower for developers — https://www.1password.dev/watchtower
- Local MCP client-side (Claude Desktop tutorial) — https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers

## Executive read

The single most important finding: **1Password Watchtower for Developers only covers SSH keys** — not API keys, not tokens, not anything else. The "breach detection" story a developer might assume applies to their AI-provider keys does not exist there. That is an unclaimed lane and we should own it.

Second finding: **Environments is beta**, MCP is beta. 1Password is actively building this surface in mid-2026. **The race window is now** — first-mover shipping across all major AI-agent clients wins mindshare.

Third finding: **1Password's MCP is scoped to Environments (`.env`-file management)** — 7 tools, all metadata-only. Ours is vault-wide with 12 tools including `exec`. Structurally our surface is broader because our whole product is the AI-key vertical.

## Feature-by-feature analysis

### 1. MCP Server

**What 1Password ships**

- Beta feature, feature-flagged under **Settings > Labs > Enable local MCP server** in the desktop app.
- Second gate at **Settings > Developer > Integrate with MCP clients**.
- Enterprise gate at **Policies > Agentic permissions > Local MCP server**.
- Stdio transport, `1password-mcp` binary bundled inside the desktop app (macOS: `/Applications/1Password.app/Contents/MacOS/onepassword-mcp`; Linux: bundled).
- 7 tools (Environments-only): `authenticate`, `list_environments`, `create_environment`, `list_variables`, `append_variables`, `create_local_env_file`, `list_local_env_files`.
- Zero-knowledge — the MCP client sees variable names + mount paths, never values.
- User approval prompt from the desktop app on every action.
- Supported clients: Codex (Mac/Linux), Cursor (Mac/Linux), Kiro (Mac only), plus any MCP-compatible client via manual JSON/TOML config.

**Where we are**

`v2.1.0-alpha` ships a superset. See [PLANS/mcp-spec.md](../mcp-spec.md) and [src/mcp/](../../src/mcp/). Twelve tools instead of seven, with `exec` (key-shape redaction), per-origin/per-tool consent grants, anomaly signals, item mutation history, and tool-aware injection. Zero-knowledge invariant enforced at three layers with a sweep test.

**Priority:** Done in v2.1 tool surface + JSON-RPC transport. Remaining work is transport wire-up + marketplace listings ([mcp.md](../workstreams/mcp.md) T+1.f).

**What to steal from their design:**
- **Two-gate feature flag.** Users toggle in Labs first, then enable per-client. Reduces "MCP server exposed by default" attack surface. **Add:** a similar per-user toggle in our popup (`enable_mcp_server: boolean`, off by default until v2.2).
- **Enterprise policy toggle** at `Policies > Agentic permissions`. **Add:** an MDM policy key `mcp_enabled: boolean` (default true for individuals, false for enterprise until admin opts in). Extends the existing ExtensionSettings bundle.
- **Zero-knowledge as the marketing pillar.** Their docs lead with "the MCP server only sees variable names, and never returns secret values." Ours should too, on every install page.

### 2. Environments (broader than the MCP tool)

**What 1Password ships**

- Beta feature. Organizes project env vars separately from vault items.
- Local `.env` file mounting **without persisting credentials to disk** — mounted via FIFO/hook validation.
- Validation hooks for **Cursor and GitHub Copilot** — the shell command that would `source .env` blocks until the mount exists and is fresh.
- SDKs in **Go, JavaScript, Python** for programmatic access.
- **AWS Secrets Manager sync (beta)** — one-way replication out to AWS.
- **GitHub Actions runtime secret provisioning** — inject at workflow-run time.
- Team collaboration via shared vault access.

**Where we are**

The direct analog is `moltypass exec <cmd>` (already the CLI story) and `moltypass env --tool hermes` (last-resort managed dotfile). Neither ships in `v2.1.0-alpha` — `bin/moltypass-mcp` stubs and the CLI daemon-client are ws/cli work that's landed as a protocol but not the CLI surface itself.

**Priority ranking of Environments features to build:**

| Feature | Moltypass module | Release |
|---|---|---|
| `moltypass exec <cmd>` — parent-process injection | `moltypass-cli` bin + daemon Native Messaging | **v2.1 non-alpha (must-ship)** |
| `moltypass env --tool <name>` — managed FIFO mount for CLIs that refuse env inheritance | `moltypass-cli` write-then-cleanup | v2.1 non-alpha |
| Validation hooks in Cursor / Continue / Aider / Codex | Marketplace listings + tiny hook scripts | v2.5 |
| SDK: `@moltypass/sdk` for JS/TS | Existing plan | v2.5 |
| SDK: `moltypass` for Python | New | v3.0 |
| SDK: `github.com/moltypass/go` for Go | New | v3.0 |
| GitHub Actions runtime provisioning | `moltypass-action` composite action | v2.5 (paired with Connect mode) |
| AWS Secrets Manager sync | Not our lane — cloud-in-cloud replication contradicts local-first | **SKIP** |
| Team-shared Environments | v3.0 P2P sync surfaces this | v3.0 |

**What to steal:**
- **Validation-hook pattern.** A tiny wrapper script that fails-fast when the vault is locked or the required key is missing. Better UX than a mysterious runtime failure inside the child. Add as `moltypass hook --tool cursor`.
- **Multi-language SDK.** Three languages (Go/JS/Python) is table stakes. Prioritize JS first (Node + browser), then Python, then Go.

**What to skip:**
- **AWS Secrets Manager sync.** Cloud-to-cloud replication is not our story. Users who need AWS Secrets Manager should use AWS Secrets Manager. We integrate with the AI-agent workflow, not the cloud-secrets ecosystem.

### 3. Touch ID (Mac unlock)

**What 1Password ships**

- User-facing docs only; no cryptographic detail public.
- Toggle: `Settings > Security > Unlock using Touch ID`.
- Configurable password-re-entry window: `Settings > Security > Confirm my account password` — user-set interval after which the master password (not just Touch ID) is required.
- Requires a Mac with Touch ID sensor or a Magic Keyboard with Touch ID.
- The technical implementation likely uses `LAContext` + Keychain items protected by `kSecAccessControlBiometryCurrentSet`, based on general Apple APIs — 1Password does not document this publicly. (Any deep implementation detail below is a *proposal* for us, not observed behavior at 1Password.)

**Where we are**

Planned for v1.1 CLI daemon (see [PLANS/CLI-AND-DOTFILES.md](../CLI-AND-DOTFILES.md)). The design:

- Master password unlocks vault once, at first CLI or extension use.
- Master key wrapped in a Keychain item with `kSecAccessControlBiometryCurrentSet` — this ties the wrapped key to the *current* enrolled fingerprints. Enroll a new finger → old wrap invalidated, forcing password re-entry.
- CLI daemon holds the unwrapped key in memory only.
- Idle-lock timer (default 5 min, user-configurable) re-wraps.
- Sleep, lock, or crash → cached key vanishes even from root.

**Priority:** v1.1 must-ship. **Blocks:** `moltypass exec` (needs biometric prompt for consent). Should ship *with* the daemon-client wire-up on `ws/mcp` T+1.f, since both surfaces need the same primitive.

**What to steal:**
- **User-configurable re-entry window.** Their pattern maps 1:1 to our `idle_lock_minutes` default (5) + `max_session_hours` hard cap (24). Ship both.
- **Enrollment-set binding via `kSecAccessControlBiometryCurrentSet`.** Correct default. Adding or removing a fingerprint should force password re-entry — that's an anti-tampering feature.

**Enterprise controls to add (1P doesn't document these publicly, but they matter for our v2.5 enterprise story):**
- MDM key `require_biometric: boolean` — force Touch ID for every unlock, no password fallback for the org.
- MDM key `idle_lock_minutes: number` — pin the timeout, users can't extend.
- MDM key `require_touchid_per_call: boolean` — the paranoid mode (see §4).

### 4. SSH agent (Moltypass shouldn't build this — but read the pattern)

**What 1Password ships**

- Full SSH agent implementation replacing `ssh-agent`.
- Intercepts `SSH_AUTH_SOCK` — every `ssh`/`git`/`scp`/`rsync` call talks to 1Password instead of the system agent.
- Biometric approval per SSH use (not per session).
- Autofills public keys on GitHub/GitLab/Bitbucket key-add pages via the browser extension.
- Git commit signing via SSH (as opposed to GPG) auto-configuration.
- Config file (`~/.config/1Password/ssh/agent.toml` or similar) supports:
  - Multiple vault sources (`shared`, per-project custom vault)
  - Per-host key selection
  - Rate limit management for OpenSSH servers
- No unattended-CI story.

**Where we are**

Not on the roadmap. SSH keys are not AI provider keys. Building an SSH agent means becoming a general credential broker — the exact off-mission drift we agreed to avoid.

**Priority:** **SKIP.** Explicitly off-mission. If we grow into a broader dev-credentials product in v4.x we can reconsider, but at v3.0 we still stay AI-only.

**What to learn from the pattern (applied to non-SSH surfaces):**
- **Biometric-per-use is a real UX.** We should ship an opt-in `moltypass exec --touchid-every-call` mode by v2.5 (analog to their shell plugins). Higher friction, higher security. Some users want this.
- **Per-host / per-project key selection.** For us: per-agent key selection. `hermes` from `~/moltypass-personal.toml` should be able to override "personal Nebius key" vs "work Nebius key" declaratively.

### 5. Watchtower for developers

**What 1Password ships**

- **SSH-key-only.** No API-key coverage. This is critical.
- Local scan of `~/.ssh` up to 3 levels deep.
- Checks: weak types (DSA, RSA <2048), unencrypted private keys, duplicates already in the vault, unsupported formats.
- Skips symlinks, mounted filesystems, files >1 MiB.
- Public-key fingerprint match against existing 1Password SSH Key items.
- No API or webhook surface.
- No breach-list check for developer credentials (their consumer Watchtower has HaveIBeenPwned integration, but that's separate).

**Where we are**

Not built. The v2.0 leak detection ships anomaly signals (`Signal A` provider-usage polling; `Signal B` local volume baseline), which is closer to Datadog Cloud Security than to 1P Watchtower. **Different problem, different solution.**

**Priority:** v2.1 non-alpha (Watchtower add) + v2.5 (breach-list). Big lane, unclaimed.

**Moltypass Watchtower for AI Keys — proposed feature matrix:**

| Check | Local or cloud | Priority |
|---|---|---|
| **Key age** — flag keys not rotated in 90/180/365 days | Local | v2.1 non-alpha |
| **Unused keys** — flag keys with zero use in 90 days | Local (from audit log) | v2.1 non-alpha |
| **Over-privileged grants** — flag grants active >30 days with no usage | Local | v2.1 non-alpha |
| **Plaintext key on disk** — scan `~/.env`, `~/.hermes/.env`, `~/.cursor/.env`, `~/.continue/config.json`, `~/.aider.conf.yml` for keys that ALSO live in the vault | Local (mirrors 1P's SSH scan pattern) | v2.1 non-alpha |
| **Duplicate keys** — same key stored twice in the vault under different labels | Local (fingerprint match) | v2.1 non-alpha |
| **Provider-side revocation** — poll provider APIs for admin-tagged "detection keys" (see [PLANS/workstreams/leak.md](../workstreams/leak.md) Signal A) | Cloud (opt-in) | v2.0 (already shipped, extend) |
| **Public-repo scan** — search GitHub Gists / public repos for salted-hash fingerprint prefixes of vault keys | Cloud (opt-in) | v2.5 |
| **Provider breach feed** — subscribe to provider-issued breach notices (Anthropic status API, OpenAI trust page, etc.) | Cloud | v2.5 |
| **DLP-style export** — scan clipboard managers, screenshot OCR cache | Local (opt-in, high sensitivity) | v3.0 |

**What to steal:**
- **Local `~/.env`-style scan.** Directly mirrors their `~/.ssh` scan. Powerful because it flags "you have this key both in the vault AND still on disk in plaintext" — the exact anti-pattern from PROBLEM.md. Small work, huge trust signal.
- **Skip-list defaults.** Their symlink / mount / >1 MiB skip list is the correct default. Copy it.
- **Fingerprint-match approach.** We already fingerprint (salted SHA-256) in the audit log; extend it to the file scan.

**What to build (v2.1 non-alpha):**

New workstream `ws/watchtower`:
- `src/background/watchtower.ts` — local checks framework
- `src/watchtower/checks/{age,unused,over-privileged,disk-scan,duplicate}.ts` — one file per check
- `src/watchtower/index.ts` — orchestrator + dashboard chip data
- Dashboard: "Watchtower" panel with per-check counts, click-through to the offending items
- MCP tool: extend `list_anomalies` to include Watchtower findings, or add new `list_watchtower_findings`

### 6. Local MCP client-side (Claude Desktop tutorial)

**What the MCP protocol docs cover**

- Config file locations:
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Log locations:
  - macOS: `~/Library/Logs/Claude`
  - Windows: `%APPDATA%\Claude\logs`
- `mcp.log` = general connection log
- `mcp-server-<name>.log` = per-server stderr
- Manual test: run the server's `command args` from a shell and see if it errors
- Approval UI: every action requires user click

**Where we are**

Our stdio server handles the wire format. Docs at `src/mcp/README.md` cover Claude Desktop / Cursor install already. Not much to do here beyond copying the log-file location tips into the troubleshooting section of the README.

**Priority:** v2.1 non-alpha polish. **Add a `moltypass-mcp diagnose` subcommand** that:
1. Prints the effective Claude Desktop / Cursor config paths
2. Attempts a self-test round-trip (initialize → tools/list → shutdown)
3. Points at the client's log path

This is the "1P debugging story" done better.

## Cross-cutting proposal — the v2.5 "1P developer parity" release

Bundle the ws/watchtower + moltypass exec + validation hooks + Environments SDKs work into a single v2.5 release themed **"Everything 1Password's developer surface does, deeper, for AI keys."**

Concretely, v2.5 ships:

1. `moltypass exec <cmd>` — the CLI surface backed by the ws/cli daemon-client (v1.1 punch)
2. `moltypass env --tool <name>` — managed FIFO mount for tools that refuse env inheritance
3. `moltypass shell-plugin <tool> --touchid-every-call` — per-op biometric mode
4. `ws/watchtower` — the 5 local checks above (age, unused, over-priv, disk-scan, dup)
5. `@moltypass/sdk` JS/TS package on npm — the SDK surface Environments has
6. `moltypass hook --tool cursor` — validation-hook pattern
7. `moltypass-mcp diagnose` — MCP troubleshooter
8. MDM policy keys for biometric + MCP + idle-lock

Sits between the current v2.1.0-alpha (MCP + vault depth) and the v3.0 enterprise release (SOC 2, SSO, MDM engine, team sync). Cost estimate: ~3-4 weeks after v2.1.0 non-alpha ships.

## Explicit skip list (from this research pass)

1. **SSH agent.** Off-mission. AI keys, not SSH.
2. **AWS Secrets Manager sync.** Cloud-to-cloud replication is not local-first.
3. **General password/TOTP/passkey/credit-card storage.** Their 1Password holds those.
4. **Consumer Watchtower** (HaveIBeenPwned integration for passwords). Their Watchtower is for consumer creds; ours is for developer AI creds.
5. **A bundled desktop app on every platform.** We ship an extension + CLI + MCP; the "desktop app" surface can wait until we have a business reason (v4.x+).

## Race-window signals

Two beta-labelled products (Environments + MCP) means 1P is actively shipping in this space. Windows we should race:
- **Ship the CLI to Homebrew + npm before 1P adds `moltypass exec`-equivalent parity.** (They currently only do `.env` mount, not parent-process env injection.)
- **Own "Watchtower for API keys" naming.** Their public docs make clear this doesn't exist yet in their product.
- **Beat them to marketplace listings.** They shipped Cursor + Kiro; we should add Continue, Aider, hermes, and Codex first.

## Sources

- 1P MCP Server: https://www.1password.dev/environments/mcp-server
- 1P Environments (broader): https://www.1password.dev/environments
- 1P SSH agent: https://www.1password.dev/ssh
- 1P Touch ID (Mac): https://support.1password.com/touch-id-mac/
- 1P Watchtower for Developers: https://www.1password.dev/watchtower
- MCP protocol (Claude Desktop tutorial): https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers
