# Moltypass MCP

The Moltypass MCP server exposes AI-key management as [Model Context Protocol](https://modelcontextprotocol.io) tools, so AI agents (Cursor, Claude Desktop, Kiro, Continue, Aider, hermes, Codex, Cline) can:

- Discover which provider keys the user has stored
- Revoke a grant if a leak is suspected
- Run terminal commands with the right keys injected — **without ever seeing the key values**
- Add or view notes and mutation history on a key
- Trigger a fresh browser capture

**Zero-knowledge**: the MCP client (agent) never receives a raw key. Metadata, command output (with keys redacted), and existence-checks only.

## Install

```json
{
  "mcpServers": {
    "moltypass": {
      "command": "moltypass-mcp"
    }
  }
}
```

Add this to your MCP client config:

- **Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Cursor:** Cursor Settings → MCP → Add server
- **Kiro:** [Power Marketplace](https://kiro.dev/powers) — search "Moltypass"
- **Continue:** `~/.continue/config.json` → `mcpServers`

You'll need Moltypass installed and unlocked at least once: **[moltypass.app](https://moltypass.app)**.

## Tools

12 tools total. See [PLANS/mcp-spec.md](../../PLANS/mcp-spec.md) for full input/output schemas.

| Tool | Purpose | Zero-knowledge? |
|---|---|---|
| `list_providers` | Providers Moltypass knows how to capture | ✓ |
| `list_keys` | Vault items metadata only | ✓ (no values) |
| `list_grants` | Active consent grants | ✓ |
| `list_tools` | Tool-aware CLI catalog | ✓ |
| `list_anomalies` | Volume anomaly signals | ✓ |
| `item_history` | Per-item mutation log | ✓ |
| `annotate_item` | Set free-text notes | ✓ (writes only) |
| `revoke_grant` | Revoke a specific grant | ✓ |
| `capture_key` | Trigger browser capture flow | ✓ |
| `rotate_key` | Rotate a key with crash-safe grant mirroring | ✓ |
| `exec` | Run a command with keys injected | ✓ (redacts stdout/stderr) |
| `uri_lint` | Validate a `moltypass://` reference | ✓ (existence only) |

## Design principles

- **Local stdio only in v2.1.** No HTTP/SSE transport, no OAuth. The MCP client and the Moltypass daemon run on the same machine.
- **The daemon shows the Touch ID prompt.** The MCP client asks; Moltypass authorizes. The client name (`clientInfo.name` from MCP handshake) appears on the sheet as `mcp:cursor`, `mcp:claude-desktop`, etc.
- **`exec` output is redacted.** Even if a child process prints its own key, the MCP client sees `[REDACTED-BY-MOLTYPASS]` and a counter tag.
- **Free forever.** No paid gate on any tool. Enterprise MDM can DISABLE MCP entirely; it can't upcharge.

## Comparison to 1Password MCP

| Capability | 1Password | Moltypass |
|---|---|---|
| Scope | Environments (.env) | AI keys, vault-native |
| Tools | 7 | 12 |
| `exec` support | ✗ | ✓ |
| Per-origin / per-tool consent | ✗ | ✓ |
| Anomaly signals | ✗ | ✓ |
| Item mutation history | ✗ | ✓ |
| Tool-aware injection | ✗ (mount-then-read) | ✓ (env vars from catalog) |
| Zero-knowledge | ✓ | ✓ |
| Touch ID per write | ✓ | ✓ |
| Free | Enterprise plan | Free forever |
| Open source | ✗ | ✓ (MIT) |
