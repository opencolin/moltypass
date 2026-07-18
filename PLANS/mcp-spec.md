# Moltypass MCP — Server Specification

**Status:** Design lock for v2.1. Implementation lives on `ws/mcp` in `moltypass-mcp/` worktree.
**Date:** 2026-07-17.
**Reference competitor:** 1Password MCP shipped July 2026 (Environments-only, zero-knowledge, `1password-mcp` binary bundled in desktop app). Their design is correct; ours is broader and AI-native.

## Elevator pitch

Moltypass MCP is a **zero-knowledge, local, stdio Model Context Protocol server** that lets AI agents (Cursor, Claude Desktop, Kiro, Continue, Aider, Cline, Codex, hermes, etc.) discover which AI-provider keys the user has, inject them into commands the agent wants to run, and revoke a leaked grant — **without ever seeing the key values**.

## Non-negotiable invariants

1. **Zero-knowledge.** The MCP client (agent) never receives a raw key value. Not in any tool response. Not in any error message. Not in any resource.
2. **User consent per action.** Every write action re-verifies vault-unlocked state; if the vault is locked, the tool prompts Touch ID via the daemon. If the user declines, the tool returns a structured "user_denied" error.
3. **Local-first transport.** stdio only in v2.1. HTTP/SSE variant deferred to v2.5+ for remote-team use with signed machine tokens.
4. **Origin/tool consent respected.** MCP `exec` calls the same daemon path as `moltypass exec` — the origin here is the MCP client name (e.g. `mcp:cursor`, `mcp:claude-desktop`) treated as a first-class origin.
5. **Free forever.** No paid gate on any MCP tool. Enterprise MDM can DISABLE MCP entirely, but cannot upcharge for it.

## Transport + install

**Transport:** stdio, standard MCP protocol per Anthropic MCP spec (2026 revision).

**Binary:** `moltypass-mcp`. Shipped via:
- `brew install moltypass/tap/moltypass-mcp` (macOS)
- `npx -y @moltypass/mcp` (cross-platform, wraps a native binary or a Node fallback)
- Bundled inside the Moltypass extension host on Chrome (auto-installed by desktop app when present)

**Client config example** (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "moltypass": {
      "command": "moltypass-mcp"
    }
  }
}
```

**Zero-arg default.** No `--service-account-token`, no env variable required. The MCP server discovers the running Moltypass daemon via the Native Messaging socket. If the daemon is not running, the first tool call returns a "daemon_not_running" error with instructions.

## Auth model

- **Daemon-mediated.** `moltypass-mcp` is a thin proxy: it opens a Native Messaging connection to the same daemon the browser extension and CLI use.
- **Touch ID unlock at first read** — the daemon prompts on the user's screen (macOS UI is not shared with the agent).
- **Idle re-lock respects the daemon's policy** — same 5-min default as the extension.
- **Per-caller origin.** The daemon sees the MCP call as origin `mcp:<client-name>` (client-name comes from the MCP `clientInfo.name` field). Per-origin consent grants apply.

## The 12 tools

Grouped by capability. **All tools return structured JSON. No tool returns a raw key value.**

### Read-only intel (safe to expose to any LLM)

#### 1. `list_providers`
List the AI providers Moltypass knows how to handle.

- **Args:** none
- **Returns:** `{ providers: [{ slug, name, keyShape, console_url }] }`
- **Example:** `[{ slug: "anthropic", name: "Anthropic", keyShape: "sk-ant-*", console_url: "https://console.anthropic.com/settings/keys" }, ...]`

#### 2. `list_keys`
List all keys in the vault. **Metadata only** — no key values.

- **Args:** `{ provider?: string }` (optional filter by provider slug)
- **Returns:** `{ keys: [{ id, provider, label, notes?, fingerprint, created_at, last_used_at, has_attachments: boolean }] }`
- **fingerprint:** a salted local hash (not the raw key). Used by the agent to disambiguate keys; never proves anything remotely.
- **notes:** the free-text field from item-notes (also v2.1).

#### 3. `list_grants`
List active per-origin/per-tool consent grants.

- **Args:** `{ key_id?: string, origin?: string }`
- **Returns:** `{ grants: [{ id, key_id, origin, tool?, mode: "proxy"|"reveal", created_at, expires_at?, calls_last_hour, calls_total }] }`

#### 4. `list_tools`
List the tool-aware CLI catalog Moltypass knows how to run.

- **Args:** none
- **Returns:** `{ tools: [{ name, env_vars: string[], provider_hints: string[] }] }`
- **Example:** `[{ name: "hermes", env_vars: ["NEBIUS_API_KEY"], provider_hints: ["nebius"] }, { name: "claude", env_vars: ["ANTHROPIC_API_KEY"], provider_hints: ["anthropic"] }, ...]`

#### 5. `list_anomalies`
List current volume anomalies flagged by the extension.

- **Args:** `{ since?: string }` (ISO timestamp)
- **Returns:** `{ anomalies: [{ id, kind, key_id, origin, severity, message, detected_at }] }`

#### 6. `item_history`
Return the mutation log for a single vault item.

- **Args:** `{ key_id: string, limit?: number }`
- **Returns:** `{ events: [{ ts, kind: "created"|"rotated"|"revoked"|"renamed"|"note_added"|"file_attached", actor, detail }] }`

### Write actions (require Touch ID via daemon)

#### 7. `annotate_item`
Set the notes field on a vault item.

- **Args:** `{ key_id: string, notes: string }`
- **Returns:** `{ ok: true, updated_at }`
- **Side effect:** appends to `item_history`.

#### 8. `revoke_grant`
Revoke a specific consent grant. Any in-flight calls using that grant are terminated via revoke epoch.

- **Args:** `{ grant_id: string }`
- **Returns:** `{ ok: true, revoked_at, in_flight_terminated: number }`
- **Side effect:** appends to `item_history` for the associated key.

#### 9. `capture_key`
Trigger the browser capture flow for a provider. The browser extension opens the provider's key-creation page and the user creates + captures a key there. This tool does NOT return the captured key value.

- **Args:** `{ provider: string, label: string, notes?: string }`
- **Returns:** `{ ok: true, capture_url: string, key_id_when_ready: string }`
- **Blocking?** No. Returns a placeholder ID. The MCP client can call `list_keys` after user completes capture to see the new item.

#### 10. `rotate_key`
Trigger the rotation flow for a key. Daemon does the crash-safe write-new-then-mirror-then-delete dance.

- **Args:** `{ key_id: string, new_key_from_capture?: string }` (if empty, opens capture flow)
- **Returns:** `{ ok: true, new_key_id, retired_key_id }`

### Execute (returns stdout/stderr/exit only, never key values)

#### 11. `exec`
Run a command with the right keys injected into its environment. This is the marquee tool. Delegates to `moltypass exec` under the hood.

- **Args:** `{ command: string[], provider_hint?: string, label?: string, cwd?: string, timeout_ms?: number }`
- **Example call:** `{ command: ["hermes", "generate", "hello world"] }`
- **Daemon action:**
  1. Resolves which env vars the tool `hermes` wants (from `list_tools` catalog).
  2. Prompts Touch ID (or uses cached unlock).
  3. Spawns the child with the env vars set.
  4. Streams stdout/stderr back to the MCP server.
  5. On exit, unsets the env vars (they were never on disk).
- **Returns:** `{ ok: true|false, stdout: string, stderr: string, exit_code: number, duration_ms: number }`
- **Zero-knowledge check:** stdout and stderr are returned verbatim, but the caller MUST NOT be able to trivially extract the key from them. The daemon inspects stdout/stderr for key-shaped strings (using the same shape regexes the CI grep guard uses) and, if found, replaces them with `[REDACTED-BY-MOLTYPASS]` before returning to the MCP client.
- **Consent:** if origin `mcp:<client>` has no prior grant for the resolved key, the daemon prompts consent (Touch ID sheet with agent name shown). This makes the daemon UI, not the MCP tool response, the trust surface.

### Reference validation (does not resolve to a value)

#### 12. `uri_lint`
Given a `moltypass://<provider>/<label>[/<field>]` URI, return whether it is well-formed AND whether the referenced item exists in the vault. **Does NOT return the value.**

- **Args:** `{ uri: string }`
- **Returns:** `{ valid_syntax: boolean, syntax_error?: string, exists: boolean, key_id?: string }`
- **Use case:** the agent is about to write a `.env.example` file with `ANTHROPIC_API_KEY=moltypass://anthropic/personal` and wants to check the reference resolves before committing.

## Resources (browsable via MCP resource protocol)

- `moltypass://vaults/` — list all vaults (v2.1 has one; multi-vault is v3.x)
- `moltypass://vaults/default/keys` — list keys metadata
- `moltypass://vaults/default/keys/<id>/history` — mutation log
- `moltypass://tools/` — CLI catalog
- `moltypass://grants/active/` — active grants

## Prompts (guided flows the agent can offer to invoke)

- `capture-key` — walks the user through creating a new provider key.
- `rotate-key` — walks the user through rotating a key.
- `audit-usage` — asks the daemon for a per-key usage summary in prose.
- `run-with-key` — asks which tool + provider, then invokes `exec`.
- `debug-missing-key` — inspects the tool catalog for a named CLI, tells the user what env var it expects and whether a matching vault item exists.

## Threat model additions vs. 1Password's

| Threat | 1P MCP mitigation | Moltypass MCP mitigation |
|---|---|---|
| Malicious LLM asks to read secret | Zero-knowledge; never returns value | Same. Plus `exec` redacts key-shaped strings from child stdout. |
| Prompt injection in child stdout | N/A (no exec) | Redact via key-shape regex; length-limit output at 1 MB. |
| MCP client impersonation | 1P prompts every action | Origin is derived from MCP `clientInfo.name`. Daemon shows the agent name on Touch ID prompt. |
| Compromised MCP binary | Bundled inside signed desktop app | Signed Homebrew formula + npm package with npm attestations + supply-chain provenance |
| Enterprise wants to disable MCP entirely | Policy toggle | ExtensionSettings / MDM: `mcp_disabled: true` |

## Comparison to 1Password Environments MCP

| Capability | 1Password | Moltypass |
|---|---|---|
| Scope | Environments (.env files) | AI keys (vault-native) |
| Tools count | 7 | 12 |
| Exec support | ✗ | ✓ (`exec`) |
| Per-origin/per-tool consent | ✗ | ✓ (native, from browser/CLI) |
| Anomaly signals | ✗ | ✓ (`list_anomalies`) |
| Item mutation history | ✗ | ✓ (`item_history`) |
| Tool-aware injection | ✗ (mount-then-read model) | ✓ (`exec` picks env vars from catalog) |
| Zero-knowledge | ✓ | ✓ |
| Touch ID prompt per write | ✓ | ✓ |
| Free | Enterprise plan | Free |
| Open source | ✗ | ✓ (MIT) |

## Package + repo layout

- Repo: `moltypass-mcp` (new sibling to `moltypass` and `moltypass-cli`)
- Language: TypeScript (matches CLI + extension)
- Distribution:
  - `@moltypass/mcp` on npm (npx-runnable, wraps native daemon connection)
  - `moltypass/tap/moltypass-mcp` Homebrew formula
  - GitHub Releases for direct binary download
- Test harness: Vitest with a fake-daemon at `tests/fixtures/fake-daemon.ts` (mirrors the Native Messaging protocol from `moltypass-cli/src/shared/native-protocol.ts`).

## Marketplace targets (v2.1 launch)

Ship listings for each on the day of the v2.1 tag:

- Claude Desktop (README instructions)
- Cursor Marketplace
- Kiro Power Marketplace
- Continue extension (VS Code)
- Cline / Aider (README instructions)
- Codex CLI (README instructions)
- hermes (per the partnership pitch)

Each listing: 30-second install video, one-command install, screenshot of `exec` in action.

## What lives in the v2.1 ws/mcp worktree

- `src/server.ts` — MCP stdio server bootstrap
- `src/tools/*.ts` — one file per tool (12 tools total)
- `src/resources.ts` — resource enumeration
- `src/prompts.ts` — guided prompts
- `src/daemon-client.ts` — Native Messaging client for the daemon
- `src/redact.ts` — key-shape regex redaction for `exec` output
- `tests/*.spec.ts` — one spec per tool, plus integration test with fake daemon
- `bin/moltypass-mcp` — Node entry-point wrapper
- `homebrew/moltypass-mcp.rb` — Homebrew formula
- `package.json` — `"bin": {"moltypass-mcp": "bin/moltypass-mcp"}`, npm publish config

## Exit criteria for v2.1 ws/mcp merge

- All 12 tools implemented + tested.
- Fake-daemon integration tests green.
- Real-daemon smoke test with `moltypass-cli` running: `list_keys` returns known-mock data.
- `exec redact` unit tests confirm no `sk-ant-*` / `sk-*` / `AIza*` shape leaks through child stdout.
- README with install instructions for Claude Desktop, Cursor, and Kiro.
- CI grep guard extended to reject any key-shaped string in MCP source or tests.
- `pnpm test` + `pnpm test:gate` green.
- 30+ new tests.
