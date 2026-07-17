# Workstream: uri (moltypass:// URI scheme)

## Status: LANDED IN WORKTREE (23 tests green, awaiting merge to main)

## Goal
Ship the `moltypass://provider/label[/field]` URI scheme (and the `multipass://` alias) as the canonical way to reference vault items from config files, CLIs, MCP tools, and SDK.

## Worktree
`/Users/colin/moltypass-uri/` on branch `ws/uri`.

## First file
`src/shared/moltypass-uri.ts`

## Files created
- `src/shared/moltypass-uri.ts` — parser (`parseMoltypassUri`), sniff (`isMoltypassUri`), canonical formatter (`formatMoltypassUri`). Pure function; no vault lookup.
- `tests/moltypass-uri.spec.ts` — 23 unit tests: happy paths, alias, field types (`key` / `notes` / `file:*`), percent-encoding, error kinds, round-trip.

## Files to modify (v2.1 integration; some pending)
- `src/background/proxy.ts` — accept URIs where sites currently pass `provider`+`label`. Resolver = daemon lookup.
- `src/inpage/inpage.ts` — expose `window.moltypass.fetchByUri(uri)` companion to existing `fetchFor`.
- `moltypass-cli/src/index.ts` — `moltypass get moltypass://…` and `moltypass exec` will accept `moltypass://…` in place of tool name.
- `moltypass-mcp/src/tools/uri_lint.ts` (in ws/mcp) — validates but does not resolve.

## Dependencies
None. Pure function, no vault interaction. **Unblocks:** ws/mcp (uri_lint tool), ws/cli (exec URI resolution).

## Complexity / days
S / 1

## Top risks
1. **Grammar creep** — adding fields ad-hoc breaks referencers. **Mitigation:** field is a closed union in v1 (`key` / `notes` / `file:<name>`). New fields require an ADR.
2. **Percent-encoding footguns** — `/` in labels must be encoded. **Mitigation:** `formatMoltypassUri` percent-encodes labels via `encodeURIComponent`, tests round-trip.
3. **multipass:// alias confusion with Ubuntu Multipass URL handlers** — Ubuntu Multipass doesn't register a `multipass://` URL scheme (confirmed by their docs), only a CLI binary. Safe. But note in docs.

## Open questions
- Do we want `?query=params` for advanced options (e.g. `?verify=fingerprint:abc`)? Deferred to v2.5 if needed.
- Case sensitivity — labels are case-preserving; provider is enforced lowercase kebab-case.

## Exit criteria
- ✅ `parseMoltypassUri` covers 5 error kinds + all valid combos.
- ✅ `formatMoltypassUri` round-trips through `parseMoltypassUri`.
- ✅ `isMoltypassUri` type guard works.
- ✅ 23 tests in worktree (target was 15+).
- ⏳ `pnpm typecheck` in worktree (waiting on install).
- ⏳ Merge to main.

## Tests target
15+ (delivered 23)

## v2.1 tie-in
Foundation for MCP `uri_lint` tool + CLI `moltypass exec moltypass://…` + landing page `.env.example` examples. First workstream to land because it has no dependencies and other workstreams reference it.
