# Workstream: revoke

## Status: TODO

## Goal
Global revocation epoch + per-grantId AbortController registry. Any revoke aborts in-flight upstream fetches and prevents new ones using the revoked grant. Key rotation flow: mint new vault entry → mirror grants to new keyId → drop old entry → bump epoch.

## Worktree
`/Users/colin/moltypass-revoke/` on branch `ws/revoke`.

## First file
`/Users/colin/moltypass/src/background/revocation.ts`

## Files to create
- `src/background/revocation.ts` — getEpoch/bumpEpoch backed by chrome.storage.local key `moltypass.revocation.epoch`; module-scope `Map<grantId, Set<AbortController>>`; `RevokedError` class
- `src/background/rotation.ts` — rotateKey(keyId): read old, mint new, mirror grants (preserve mode/expiry, reset callsUsed), delete old, bump epoch

## Files to modify
- `src/background/proxy.ts` — read epoch before AND after upstream fetch; create AbortController per grantId; throw RevokedError on mismatch; unregister in finally
- `src/background/permissions.ts` — add revokeGrant/revokeKey/revokeOrigin helpers; each calls bumpEpoch
- `src/background/popup-handler.ts` — handle revoke-grant, revoke-key, revoke-origin, rotate-key
- `src/background/index.ts` — register new message kinds in router
- `src/background/vault.ts` — expose secret-by-keyId, add-new-keyId, delete-by-keyId for rotation.ts
- `src/popup/popup.tsx` — Revoke + Rotate buttons with confirm
- `src/audit/audit.tsx` — Revoke buttons per row, Rotate per key
- `src/shared/types.ts` — message-kind types + RevokedError variant

## Dependencies
- audit (revoke must emit audit events through the new audit-log module)

## Complexity / days
M / 4

## Top risks
1. SW dies mid-fetch — module-scope AbortController registry is lost; epoch-from-storage is the durable backstop.
2. TOCTOU window between post-fetch epoch check and bytes reaching caller; streaming exposed.
3. Global epoch bump aborts all in-flight, not just affected grant; consider scoping abort to grantId while epoch stays global.
4. rotateKey multi-step — SW death partway could strand vault entries. Write-new-and-mirror before delete-old.
5. Resetting callsUsed on rotation could bypass per-key call budget if enforced elsewhere.

## Open questions
- On rotation, keep grantId stable or regenerate?
- Should revoked in-flight be retried by inpage provider or surfaced as RevokedError?
- Does rotation emit a specific audit kind?

## Exit criteria
- Revoke + grant + proxy under concurrent load: revoked grants always fail with RevokedError; non-revoked grants succeed.
- rotateKey: idempotent — crash mid-rotation never strands the secret (only-copy safety).
- Popup + audit dashboard wire all three revoke granularities and rotation.
