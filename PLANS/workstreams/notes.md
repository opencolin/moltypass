# Workstream: notes (item notes)

## Status: LANDED IN WORKTREE (13 tests green, awaiting merge to main)

## Goal
Add an encrypted, per-item free-text notes field to VaultEntry, exposed via `addKey(…, notes?)`, `getNotes(id)`, `setNotes(id, notes)`. Foundation for MCP `annotate_item` tool + item-detail UI.

## Worktree
`/Users/colin/moltypass-notes/` on branch `ws/notes`. `@6a8a40d`.

## Files created
- `tests/vault-notes.spec.ts` — 13 tests

## Files modified
- `src/shared/types.ts` — added `notesCiphertext?`, `notesUpdatedAt?` to VaultEntry; RedactedVaultEntry now includes `hasNotes: boolean`.
- `src/background/vault.ts` — new `getNotes`/`setNotes`; addKey signature gains optional 4th arg; **also aligned to current vault-crypto API** (was importing non-existent `encrypt`/`decrypt` — latent break since proxy tests mock vault).

## Dependencies
None. **Unblocks:** ws/history (mutation events on notes changes), ws/mcp (annotate_item tool).

## Complexity / days
S / 0.5 (as estimated; +0.25 for the vault-crypto alignment)

## Design choices

- **Separate ciphertext, not envelope versioning.** `notesCiphertext` is its own AES-GCM blob using the master key. Legacy entries have no such field → `hasNotes: false`, `getNotes` returns `''`. Zero migration.
- **`notesUpdatedAt` stays outside ciphertext.** So the dashboard can sort/list by "recently noted" without unlocking. Metadata leak is intentional and minimal.
- **Empty string clears.** `setNotes(id, '')` deletes both `notesCiphertext` and `notesUpdatedAt`. Idempotent.
- **hasNotes is on the redacted view, not the raw entry.** Prevents callers from accidentally reading the persisted `notesCiphertext` field directly.

## Top risks
1. Vault-crypto API alignment could regress mocked-vault tests. **Mitigation:** ran full ws/notes suite — 354/354 green.
2. Notes length not capped; a large blob could bloat chrome.storage.local. **Mitigation:** enforce 4096-char cap in UI + MCP tool; not in vault.ts (schema is agnostic).

## Open questions
- Search over notes? Requires unlock. Deferred to v2.5 (would need in-memory index).
- Notes revision history? Subsumed by ws/history — each `setNotes` should emit an item-mutation event.

## Exit criteria
- ✅ addKey/getNotes/setNotes with all edge cases (13 tests)
- ✅ Legacy entries backward-compatible (test #10)
- ✅ 354/354 tests green in ws/notes
- ⏳ Merge to main after ws/history so mutation events fire

## Tests target
10+ (delivered 13)

## v2.1 tie-in
Powers MCP tool #7 `annotate_item`. `notes` also surfaces in `list_keys` metadata. Landing page's dashboard preview should show a "notes:" column.
