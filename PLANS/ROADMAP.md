# Moltypass — Roadmap

Synthesized from the 10-workstream PM fan-out (see prior workflow output for raw plans).

## Critical path

```
audit → revoke → detector → leak → picker → auth → dashboard → enterprise-sw → security → release
```

## Parallelizable waves (per workflow synthesizer)

| Wave | Workstreams | Notes |
|---|---|---|
| 1 | audit | foundation; everyone reads from it |
| 2 | revoke, detector | both depend on audit but not each other |
| 3 | leak, picker, auth+dashboard | leak needs audit+revoke; picker needs detector; auth/dashboard co-developed |
| 4 | enterprise-sw, security | enterprise-sw needs audit+revoke+auth+dashboard; security touches everything |
| 5 | release | final |

## 6-week schedule (T0 = today)

| Week | Active | Deliverable |
|---|---|---|
| W1 | audit | IDB audit log, lazy SW-safe reopen, JSON/CSV export, 365-day retention sweep |
| W2 | revoke + detector + (auth+dashboard schema kickoff) | Revoke epoch, rotate flow, shape-regex detector banner, shared Drizzle schema |
| W3 | detector + picker + auth+dashboard + leak start | Detector custom registration, picker (Cmd+Shift+M + context-menu), RSC dashboard, leak signals |
| W4 | picker + leak + enterprise-sw start | Picker complete, anomalies wired, managed bootstrap + IDB outbox |
| W5 | enterprise-sw + security | Outbox cap, backoff, KDF migration (Argon2id with PBKDF2 fallback), replay protection |
| W6 | security + release | SECURITY.md, CI, Chrome Web Store assets, version-lockstep release script |

## Estimated effort

~70 days of solo-dev work; 6 calendar weeks via the parallel waves above.

## Workstream files

- [audit](workstreams/audit.md)
- [revoke](workstreams/revoke.md)
- [leak](workstreams/leak.md)
- [detector](workstreams/detector.md)
- [picker](workstreams/picker.md)
- [enterprise-sw](workstreams/enterprise-sw.md)
- [dashboard](workstreams/dashboard.md)
- [auth](workstreams/auth.md)
- [release](workstreams/release.md)
- [security](workstreams/security.md)

## Key decisions (open until council resolves)

1. **Self-host vs hosted SaaS primary target** — recommended: hosted first, self-host Docker as degraded option.
2. **Argon2id vs PBKDF2** — recommended: spike Argon2id WASM under MV3 in W1; PBKDF2 stays as fallback.
3. **When to wire Resend** — recommended: W2 with shared schema.
4. **Leak detection scope for v1** — recommended: Signal B at launch, Signal A advisory/beta.
5. **TOCTOU streaming window** — recommended: document residual; don't buffer.
6. **v2.0 vision** — open. Council deciding.
