# Workstream: leak

## Status: TODO

## Goal
Detect key leaks via two independent signals; advisory only (never auto-revoke). Signal A = provider-usage polling with admin keys, correlating upstream delta vs local audit delta. Signal B = local volume anomaly vs 7-day baseline.

## Worktree
`/Users/colin/moltypass-leak/` on branch `ws/leak`.

## First file
`/Users/colin/moltypass/src/shared/leak-types.ts`

## Files to create
- `src/shared/leak-types.ts` — LeakFinding, DetectionKeyMeta, BaselineBucket
- `src/background/leak-detection.ts` — orchestrates Signal A poll + Signal B check; persists findings; manages badge
- `src/background/detection-keys.ts` — per-provider admin "detection key" slot; role:'admin' tag excluded from grant/proxy
- `src/background/provider-usage.ts` — Anthropic Admin (/v1/organizations/usage_report) + OpenAI usage clients; normalize to per-fingerprint deltas
- `src/background/baseline.ts` — rolling 7-day per-fingerprint volume buckets (hourly + daily)
- `src/audit/leak-sidebar.tsx` — audit-page sidebar grouping open findings, dismiss action, "no auto-revoke" note

## Files to modify
- `src/popup/popup.tsx` — Detection-key slot per provider (Anthropic, OpenAI; Gemini disabled with note)
- `src/background/index.ts` — wire init(); register 60-min jittered alarm; route detection messages
- `src/background/proxy.ts` — on proxy.ok call leak-detection.checkSignalB(event) + baseline.recordEvent
- `src/background/vault.ts` — support role:'admin'; isLocked() for poll-skip guard
- `src/background/popup-handler.ts` — list-leak-findings, dismiss-leak-finding, set/clear/get-detection-key-meta
- `src/audit/audit.tsx` — mount LeakSidebar
- `manifest.json` — host_permissions for api.anthropic.com + api.openai.com; ensure alarms permission

## Dependencies
- audit (findings need keyFingerprint scheme + audit events to compute deltas)
- revoke (no direct dep but UI gives revoke/rotate as response to findings)

## Complexity / days
L / 9

## Top risks
1. Provider usage APIs may not expose per-key granularity (org-level only) — Signal A attribution coarse.
2. Usage API reporting latency (hours) misaligns delta windows.
3. Admin detection keys are high blast-radius secrets; role:'admin' exclusion must be airtight.
4. SW death mid-poll can corrupt lastPollCursor — must advance only after fully-reconciled poll.
5. Signal B baseline is cold for first week and new fingerprints — needs warm-up guard.
6. Polls skip while locked — leaking key during long lock undetected. Accepted, but surface.
7. 60-min cadence × many fingerprints could throttle/cost provider endpoints.

## Open questions
- Anthropic Admin endpoint shape — per-key vs org-aggregate?
- OpenAI per-key usage endpoint + auth scope?
- Unit normalization (requests vs tokens vs cost)?
- Detection key stored in unlocked vault only, or separate at-rest store to poll while locked?
- Badge UX when both signals fire / when dismissed?

## Exit criteria
- Signal B raises a finding when a grant's recent-hour rate > 10× 7-day baseline and recent > 20 calls.
- Signal A (when admin key present) raises a finding when upstream delta − local delta > tolerance.
- Findings persist across SW restart; dismiss works; badge clears on dismiss-all.
- No auto-revoke. Ever. Tested with mock leak.
