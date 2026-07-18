# Workstream: history (per-item mutation log)

## Status: LANDED IN WORKTREE (12 tests green, awaiting merge to main)

## Goal
Per-item mutation history — the "History" tab of an item, and the backing query for MCP `item_history`. Zero new storage; extends the existing IndexedDB audit log with 6 new event kinds and a `itemHistory()` query facade.

## Worktree
`/Users/colin/moltypass-history/` on branch `ws/history`. `@6bccea8`.

## Files created
- `src/background/item-history.ts` — `itemHistory(keyId, opts)` returning `{ events, nextCursor }`. Thin filter over `audit-db.query()`.
- `tests/item-history.spec.ts` — 12 tests.

## Files modified
- `src/shared/audit-types.ts` — 6 new `AuditEventKind` values + `ITEM_MUTATION_KINDS` constant.
- `src/background/audit-log.ts` — 6 new façade methods: `itemCreated`, `itemRenamed`, `itemNotesUpdated`, `itemFileAttached`, `itemFileRemoved`, `itemDeleted`.

## Dependencies
None to run. Emit-site integration deferred to a small follow-up:
- `vault.addKey` should call `itemCreated`
- `vault.setNotes` should call `itemNotesUpdated`
- Attachment code (ws/attach, v2.1 stretch) will call `itemFileAttached`/`itemFileRemoved`

## Complexity / days
S / 1

## Design choices

- **Reuse the audit log; don't build a second store.** Same by_keyId_ts compound index makes per-item queries efficient.
- **`ITEM_MUTATION_KINDS` includes existing `rotate.complete` and `revoke`.** They mutate the item too, and users expect them in the history tab.
- **Notes CONTENT is never in audit — only length + `hadNotesBefore`.** Preserves the "no plaintext in audit" invariant.
- **Long labels/filenames clipped to 64/128 chars in meta.** Rows stay small under `chrome.storage.local` quotas at scale.
- **`itemHistory` returns a page shape (events + nextCursor), not a flat list.** Matches `audit-db.query()` and lets the item-detail UI paginate cleanly.

## Top risks
1. Kind proliferation — future item mutations (tags, categories) would need new event kinds. **Mitigation:** ADR every new item-mutation kind through a review, don't add ad-hoc.
2. Emit-site coverage — if `vault.addKey` and `setNotes` don't call the facade, item-history is silent. **Mitigation:** small follow-up in ws/notes or a merge-time integration commit before v2.1 tag.

## Open questions
- Should notes actual content be *available* to the item-history reader on unlock? Deferred to v2.5. Current answer: no — history shows metadata; view current notes via `getNotes`.
- Retention policy: does item history follow the 365-day audit retention? Yes, they share storage.

## Exit criteria
- ✅ All 6 new kinds emit + query correctly (12 tests)
- ✅ Cursor pagination round-trips (test #10)
- ✅ Proxy events excluded from item history (test #8)
- ✅ 353/353 tests green in ws/history
- ⏳ Emit-site wiring (integration commit at merge time)
- ⏳ Merge to main after ws/notes so notes events fire

## Tests target
12+ (delivered 12)

## v2.1 tie-in
Powers MCP tool #6 `item_history`. Also powers the item-detail "History" tab that ships in ws/dashboard punch-list.
