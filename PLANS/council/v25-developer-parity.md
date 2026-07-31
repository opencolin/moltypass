# v2.5 Council Binding Decision — Developer Parity

**Status:** BINDING. Head-of-product decision after 3-PM vote (unanimous on top items).
**Date:** 2026-07-30.
**Signal:** Goal set 2026-07-30 by Colin — build v2.5 with council + worktrees + timers + docs.

## PM vote (raw)

Three PMs scored the 8 candidates from [PLANS/competitors/1password-developer-features.md](../competitors/1password-developer-features.md):

| Item | Description | Priya (Individual-Dev) | Marcus (Enterprise) | Sam (Ex-1P) | Consensus |
|---|---|---|---|---|---|
| **A** | `moltypass exec` CLI daemon | MUST | MUST | MUST | **3/3** |
| **D** | Watchtower (5 local checks) | MUST | MUST | MUST | **3/3** |
| **F** | Validation hooks (Cursor/Continue/Aider) | MUST | stretch | MUST | 2/3 |
| **G** | `moltypass-mcp diagnose` | MUST | stretch | MUST | 2/3 |
| B | `moltypass env --tool` (FIFO fallback) | stretch | punt | stretch | 0/3 must |
| C | `shell-plugin --touchid-every-call` | punt | MUST | stretch | 1/3 |
| E | `@moltypass/sdk` JS/TS npm package | stretch | punt | punt | 0/3 must |
| H | MDM policy keys | punt | MUST | punt | 1/3 |

## Binding decision

### Must ship in v2.5

1. **A — `moltypass exec`** (unanimous) — CLI daemon + parent-process env injection. Turns the CLI from a stubbed protocol into a working tool. Without this, the whole "browser + terminal" story is browser-only.
2. **D — Watchtower** (unanimous) — 5 local checks: `stale.rotation`, `stale.unused`, `grant.zombie`, `disk.plaintext`, `vault.duplicate`. Owns the unclaimed lane (1P Watchtower is SSH-only).
3. **F — Validation hooks** (2/3) — small wrapper scripts that fail-fast when the vault is locked or the required key is missing. Ships bundled with A (same worktree).
4. **G — `moltypass-mcp diagnose`** (2/3) — troubleshooter subcommand. Small extension to existing MCP surface. Ships bundled with A.

### Stretch (in v2.5 if time)

- **B — `moltypass env --tool`** — managed FIFO mount for tools that refuse env inheritance. Ships in the same worktree as A if it fits.

### Punt to v3.0

- **C — shell-plugin biometric** — per-op Touch ID. Marcus wanted it for enterprise, but Sam is right: v2.5 doesn't have Touch ID daemon yet (that's v1.1 punch bundled here). Layering per-op biometric on top is v3.0 work.
- **E — `@moltypass/sdk` JS/TS npm** — nobody voted MUST. Solo devs use the CLI, orgs need the SDK, we don't have orgs at v2.5.
- **H — MDM policy keys** — premature without SSO/SCIM in v3.0. Marcus's argument is real but the ordering is wrong.

## Workstreams (2 in parallel)

Bundle A + F + G into one CLI-flavored workstream; D stands alone.

| # | Name | Worktree | Branch | Bundles | Deliverable | Tests target |
|---|---|---|---|---|---|---|
| 1 | **cli-exec** | `moltypass-exec/` | `ws/exec` | A + F + G + (B stretch) | `bin/moltypass` binary with `exec`/`hook`/`env` subcommands; `moltypass-mcp diagnose`; Native Messaging daemon-client that reads the existing vault | 30+ |
| 2 | **watchtower** | `moltypass-watchtower/` | `ws/watchtower` | D | `src/watchtower/` module with 5 checks + orchestrator; dashboard chip; MCP `list_watchtower_findings` tool | 25+ |

### Kickoff order (parallel)

Both can spin at once — no dependencies between them.

1. `ws/exec` — bigger surface, start immediately
2. `ws/watchtower` — pure local logic, start immediately

### Merge order (leaves first)

1. `ws/watchtower` — no external deps
2. `ws/exec` — extends MCP surface (adds `list_watchtower_findings`), depends on watchtower module being importable

## Launch headline

> **v2.5: Moltypass is a proper terminal tool now — and it watches your keys while you work.**

The two features answer the two "1P has this, we don't" complaints a v2.1.0-alpha user would file: "the CLI is stubbed" (fixed by A/F/G) and "how would I know if my key was compromised" (fixed by D — with 1P's own Watchtower conspicuously not covering API keys).

## Invariants (unchanged from v2.1)

1. Local-first — keys never leave the machine.
2. Zero-knowledge — the MCP client (and the daemon caller) never receives raw key values from tools that don't own the injection surface.
3. AI-keys-only — no general password features.
4. Open source MIT.
5. User consent per action.

## Explicit skips (from this round)

- MDM policy keys → v3.0 (with SSO/SCIM)
- Shell-plugin per-op biometric → v3.0
- JS/TS SDK → v3.0 (paired with team-sharing)
- General passwords, TOTP, SSH keys → off-mission forever
- AWS Secrets Manager sync → off-mission forever

## Sources

- 3-PM council raw votes: workflow `w2bh6ggyd` (synth killed at result stage — analog to v2.1 council; consensus captured here directly)
- Deep-dive research: [PLANS/competitors/1password-developer-features.md](../competitors/1password-developer-features.md)
- Preceding council: [PLANS/council/v21-beat-1password.md](v21-beat-1password.md)
