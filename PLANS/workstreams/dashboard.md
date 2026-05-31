# Workstream: dashboard

## Status: TODO

## Goal
Build out the admin dashboard routes — Grants, Keys (fingerprint-grouped with rotation chain), Devices, Anomalies, Policy editor, API tokens. RSC reading Drizzle queries against `web/lib/db.ts`. Filters, CSV/JSON export. Show-once raw tokens, SHA-256 hash storage. admin_actions audit table.

## Worktree
`/Users/colin/moltypass-dashboard/` on branch `ws/dashboard`.

## First file
`/Users/colin/moltypass/web/lib/db.ts` (extend)

## Files to create
- `web/app/(dashboard)/layout.tsx` — shared shell + sidebar + auth gate
- `web/app/(dashboard)/grants/page.tsx`
- `web/app/(dashboard)/keys/page.tsx` — fingerprint grouped with rotation chain
- `web/app/(dashboard)/devices/page.tsx`
- `web/app/(dashboard)/anomalies/page.tsx` — Signal A + B findings, ack action
- `web/app/(dashboard)/policy/page.tsx`
- `web/app/(dashboard)/policy/policy-form.tsx` — client form, server action savePolicy bumps version
- `web/app/(dashboard)/tokens/page.tsx`
- `web/app/(dashboard)/tokens/token-actions.tsx` — issuance shows raw once
- `web/app/(dashboard)/_components/filters.tsx` — URL-search-param-driven filter bar
- `web/app/(dashboard)/_components/export-button.tsx`
- `web/app/(dashboard)/_components/data-table.tsx`
- `web/app/api/export/route.ts` — stream CSV/JSON, bearer + org-scoped
- `web/lib/queries.ts` — centralized Drizzle filter builders shared by RSC + export
- `web/lib/actions.ts` — savePolicy, issueToken, revokeToken server actions, each writes admin_actions row + revalidates

## Files to modify
- `web/lib/db.ts` — admin_actions table, ensure policies.version + policies.updatedAt, ensure api_tokens.{label, prefix, status, lastUsedAt}
- `web/app/(dashboard)/overview/page.tsx` — replace mock data with real Drizzle aggregates via queries.ts; adopt shared layout
- `web/lib/auth.ts` — admin-session/role helper for dashboard gate + actorTokenId for admin_actions
- `web/app/api/policy/route.ts` — ETag derived from policies.version

## Dependencies
- auth (mutual — sessions, RBAC)
- audit (events are the source of grants/keys/anomalies queries)
- revoke (token revoke flow mirrors extension's grant revoke patterns)
- leak (anomalies page surfaces leak findings)

## Complexity / days
L / 9

## Top risks
1. Schema collision with auth workstream — both edit web/lib/db.ts.
2. Policy version/ETag contract shared with extension — mismatch silently leaves stale policy on devices.
3. Token issuance must show raw exactly once; regression = credential leak.
4. RSC + server actions caching — stale data after writes unless revalidatePath/tags wired correctly.
5. Unbounded query/export over audit_events could OOM the function.
6. admin_actions logging must be transactional with the write it records.

## Open questions
- Grants/keys/anomalies materialized as separate tables or derived from audit_events on the fly?
- Rotation chain: explicit predecessor/successor link, or order by fingerprint+createdAt?
- Auth gate via bearer api_tokens only or full admin session?
- Pagination: keyset cursors from day one or offset OK for v1?
- Export caps / streaming, PII redaction?

## Exit criteria
- All six routes render against live Drizzle queries (no mock data).
- Policy edit → bumped version → ETag invalidation → extension refetches on next poll.
- Token issue → raw shown once in modal → SHA-256 stored.
- admin_actions row written for every mutating action and is queryable by route+actor.
- CSV/JSON export streams >100k rows without timeout.
