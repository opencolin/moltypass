# Workstream: watchtower

## Status: LANDED IN WORKTREE (24 tests green, awaiting merge to main)

## Goal
Ship Watchtower for AI keys — the 5-check local scanner that closes the "1P has this, we don't" gap for API-key hygiene. Owns an unclaimed lane: 1P Watchtower for Developers covers SSH keys only.

## Worktree
`/Users/colin/moltypass-watchtower/` on branch `ws/watchtower`. `@6361b9f`.

## Files created
- `src/watchtower/types.ts` — `WatchtowerCheck` contract, config, `DEFAULT_CONFIG`, disk-scan defaults, stable `findingId()`.
- `src/watchtower/checks.ts` — 5 checks + `runWatchtower()` orchestrator.
- `tests/watchtower.spec.ts` — 24 tests.

## Checks
1. **stale.rotation** — key not rotated in >180 days (severity escalates at 1.5x / 2x threshold)
2. **stale.unused** — key with zero traffic in >90 days (both never-used and idle-used cases)
3. **grant.zombie** — grant active with no traffic in >30 days
4. **disk.plaintext** — vaulted key ALSO exists in a `~/.env` dotfile (the exact PROBLEM.md anti-pattern)
5. **vault.duplicate** — two entries with the same salted fingerprint

## Zero-plaintext discipline
The disk.plaintext check receives a caller-provided `matchAgainstVault(v) => keyId | null` callback. The check itself extracts candidate values from disk (via env-var regex + JSON key/token/secret regex), passes each to the callback, and never sees the plaintext-vault comparison. No key value ever enters a finding's message or meta.

## Dependencies
None to run. **Unblocks:** ws/exec MCP `list_watchtower_findings` tool + dashboard chip integration.

## Complexity / days
M / 2 (all check logic + tests done; emit-site wiring is a small follow-up)

## Design choices
- **Reuse existing audit log for traffic history.** No new storage — checks read the last-90-days slice caller provides.
- **Fingerprints supplied by orchestrator, not computed by the check.** Keeps the check pure. Vault-crypto ownership stays in one module.
- **Disk-scan mirrors 1P's SSH scanner.** 1 MiB cap, skip missing files silently, follow default paths + up-to-3-levels dir recursion.
- **Findings are stable by (check, target).** Regenerating the same input produces the same ids — so dismissed findings stay dismissed across scans.
- **Orchestrator dedup keeps the higher-severity finding on id collision** — defensive; no current checks collide.

## Top risks
1. **Regex misses / false positives on the extractor.** The env-var + JSON extractors are loose by design. **Mitigation:** callback returns null for non-vault-matches, so false-positive extraction produces zero findings.
2. **Filesystem access model** — currently expects a caller-provided `WatchtowerFs`. Browser environment gives null; a small Node adapter ships with ws/exec.
3. **Retention** — if audit log is thinner than 90 days, `stale.unused` over-flags. Caller must guarantee the slice window.

## Open questions
- Alerting cadence — daily via `chrome.alarms`? Configurable? (Deferred to emit-site wiring.)
- Per-user dismiss vs per-check dismiss? Current design is per-finding-id, which is fine.

## Exit criteria
- ✅ 5 checks land with tests (24)
- ✅ Zero-plaintext invariant verified (test line 190: `JSON.stringify(findings[0])).not.toContain(fakeKey)`)
- ✅ 523/523 tests green in worktree
- ⏳ Emit-site wiring (small T+2.c commit in ws/exec)
- ⏳ Merge to main after ws/exec so MCP tool integration lands together

## Tests target
25+ (delivered 24)

## v2.5 tie-in
Item D from the council decision. Foundation for the MCP `list_watchtower_findings` tool and the dashboard "Watchtower" panel that surfaces per-check counts.
