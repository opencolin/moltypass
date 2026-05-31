# Workstream: enterprise-sw

## Status: TODO

## Goal
Extension ↔ collector bridge. Read managed config from chrome.storage.managed; mirror every audit event to an IDB outbox; drain on 5-min alarm via Bearer-auth POST to ingestUrl; poll policy with If-None-Match; enforce policy locally (forbiddenProviders, revealModeAllowed, retentionDays). Inert when no managed config.

## Worktree
`/Users/colin/moltypass-enterprise/` on branch `ws/enterprise-sw`.

## First file
`/Users/colin/moltypass/src/background/outbox.ts`

## Files to create
- `src/background/outbox.ts` — IndexedDB 'outbox' object store wrapper; enqueue/peekBatch(<=100)/deleteUpTo/count; cap-at-10k with drop-oldest
- `src/background/enterprise.ts` — bridge core: read chrome.storage.managed on startup + onChanged; register/cancel alarms; orchestrate drain + policy fetch + enforcement; no-op when empty
- `src/background/policy.ts` — GET policyUrl with If-None-Match; persist {policy, etag, fetchedAt}; expose isProviderForbidden/isRevealAllowed/retentionCutoffMs
- `src/background/backoff.ts` — exponential state machine: storage-backed failures counter; doubles from base up to 1h
- `src/background/enterprise.test.ts` — fake-indexeddb + mocked fetch/storage/alarms tests

## Files to modify
- `src/background/index.ts` — call enterprise.init() on startup paths; route consent/grant through policy.isProviderForbidden
- `src/background/vault.ts` — on audit.append also call enterprise.enqueueOutbox(event); honor policy.retentionDays for eviction
- `src/background/permissions.ts` — gate grant creation: policy-denied result if provider forbidden
- `src/shared/types.ts` — Policy + ManagedConfig interfaces
- `src/popup/popup.tsx` — hide/disable reveal when policy.revealModeAllowed === false
- `src/background/popup-handler.ts` — return active policy + managed-bootstrap status to UI
- `manifest.json` — alarms + storage permissions; host_permissions for configurable ingestUrl/policyUrl
- `vite.config.ts` — fake-indexeddb in test deps

## Dependencies
- audit (outbox mirrors audit events)
- revoke (no direct dep but policy may block revealed origins)
- auth (the apiToken issued by the web app's token UI)
- dashboard (policy editor produces the configs we apply)

## Complexity / days
L / 8

## Top risks
1. SW killed mid-drain — partial batch must not lose or duplicate. Delete-after-2xx only; collector idempotent on retry.
2. Outbox + audit compete for storage budget — outbox MUST be in IDB, not storage.local; 10k cap enforced.
3. apiToken in chrome.storage.managed — must never be logged or forwarded upstream to providers.
4. Policy enforcement split between SW + UI can drift — SW must be authoritative; reject crafted messages even when UI hides.
5. Backoff to 1h + 10k cap means long collector outage silently drops oldest — surface and audit the drop.
6. Clock skew / ETag mishandling — could re-apply old policy or hammer endpoint.

## Open questions
- Exact ingest request body shape vs Zod schema in web/app/api/ingest/route.ts?
- Policy GET response wrapped or flat?
- retentionDays scope: collector-bound only or also local audit?
- Managed config flips to absent at runtime — drop outbox, stop ticks, clear cached policy?
- revealKey hard-blocked in SW or only hidden in UI?

## Exit criteria
- With managed config: 1000 audit events flow to collector in under 5 minutes; 0 dropped on happy path.
- Forbidden provider: grant returns policy-denied; no audit event emitted.
- revealModeAllowed=false: reveal-key message rejected in SW even if UI bypassed.
- No managed config: no fetch ever made, no alarms registered, no outbox writes.
