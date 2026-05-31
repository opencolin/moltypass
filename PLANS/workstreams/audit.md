# Workstream: audit

## Status: TODO

## Goal
IndexedDB audit log (`moltypass.audit`) with compound indexes; replace chrome.storage.local-composed sharing ledger with audit-driven queries; JSON/CSV export; 365-day retention sweep; first-boot replay of legacy chrome.storage.local audit tail.

## Worktree
`/Users/colin/moltypass-audit/` on branch `ws/audit`.

## First file
`/Users/colin/moltypass/src/shared/audit-types.ts`

## Files to create
- `src/shared/audit-types.ts` — AuditEventKind union, AuditEvent record, AuditQueryFilter, message contracts
- `src/background/audit-db.ts` — Core IDB module, opens/upgrades 'moltypass.audit' DB, indexes by_ts/by_origin_ts/by_keyId_ts/by_keyFingerprint_ts/by_kind_ts, async iterator for export
- `src/background/audit-log.ts` — High-level façade: proxyOk, proxyError, grant, revoke, reveal, capture helpers
- `src/background/audit-export.ts` — toJSON / toCSV streaming
- `src/background/audit-retention.ts` — Daily chrome.alarms sweep, deletes records older than 365d
- `src/background/audit-migrate.ts` — One-time replay of chrome.storage.local tail into IDB, gated by 'audit.migratedV1' flag

## Files to modify
- `src/background/popup-handler.ts` — replace list-sharing-ledger with audit-db queries; add query-audit + export-audit handlers
- `src/background/proxy.ts` — call auditLog.proxyOk/proxyError on every upstream call
- `src/background/permissions.ts` — emit auditLog.grant on create, auditLog.revoke on remove
- `src/background/consent.ts` — emit auditLog.reveal on reveal-mode approval
- `src/background/index.ts` — call audit-migrate.replayOnce() + audit-retention.registerAlarm() on SW startup
- `src/audit/audit.tsx` — point dashboard at new query-audit/export-audit messages; add filter controls
- `manifest.json` — confirm 'alarms' permission present

## Dependencies
None — this is the foundation.

## Complexity / days
M / 5

## Top risks
1. MV3 SW termination mid-write — must reopen IDB lazily on every entry point.
2. IDB index ordering — `[field, ts]` only filters efficiently on leading field; multi-field UI queries post-filter.
3. Replay-once correctness — crash between IDB writes and setting `audit.migratedV1` could double-import.
4. Export of 365-day log can be large — must cursor-paginate; no buffering full set.
5. IndexedDB unavailable (private mode, quota) — proxy hot path must not block on audit writes.

## Open questions
- Exact storage key for the existing chrome.storage.local audit tail to replay.
- Delete legacy tail after migration or retain read-only?
- Compound index choice for multi-field queries.
- keyFingerprint salt — local-only or matched to collector's scheme?
- Retention cap by time only or also row/size cap?

## Exit criteria
- All events flow through audit-log.ts (no direct chrome.storage.local writes for audit).
- audit.tsx renders the same sharing ledger via query-audit messages.
- Export produces valid JSON + CSV for >10k records without OOM.
- Retention sweep runs daily and deletes expected records.
- `pnpm typecheck` green in worktree.
