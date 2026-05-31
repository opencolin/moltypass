# Workstream: auth

## Status: TODO

## Goal
Magic-link sign-in (Resend) + org onboarding for admin dashboard. Signed-cookie sessions, CSRF on mutations, role-based access (admin/viewer/billing), MDM-policy export bundle for Chrome Enterprise, Stripe billing for Team plan, optional BotID gating ingest/policy endpoints, single self-host Docker image.

## Worktree
`/Users/colin/moltypass-auth/` on branch `ws/auth`.

## First file
`/Users/colin/moltypass/web/lib/db.ts` (extend) — co-owned with dashboard, land first

## Files to create
- `web/lib/auth/session.ts` — signed/encrypted cookie sessions
- `web/lib/auth/magic-link.ts` — issue + verify single-use, time-boxed tokens (SHA-256 hashed)
- `web/lib/auth/csrf.ts` — double-submit token helpers, assertCsrf() guard
- `web/lib/auth/rbac.ts` — role enums + requireRole/can guards
- `web/lib/email/resend.ts` — Resend client + sendMagicLinkEmail; no-op when RESEND_API_KEY unset
- `web/lib/billing/stripe.ts` — Checkout + Portal + webhook signature verification
- `web/lib/mdm/policy-bundle.ts` — downloadable JSON for chrome.storage.managed
- `web/lib/botid.ts` — optional BotID/Turnstile verification helper
- `web/app/api/auth/magic-link/route.ts` — POST email, rate-limit, send token
- `web/app/api/auth/callback/route.ts` — GET verify token, mint session+CSRF, redirect
- `web/app/api/auth/logout/route.ts` — POST CSRF-guarded, destroy session
- `web/app/api/org/route.ts` — POST create org, GET metadata
- `web/app/api/org/members/route.ts` — invite/list/patch/delete members
- `web/app/api/org/policy-bundle/route.ts` — download MDM JSON
- `web/app/api/billing/{checkout,portal,webhook}/route.ts` — Stripe wiring
- `web/app/(auth)/login/page.tsx` — email entry + sent-state
- `web/app/(dashboard)/onboarding/page.tsx` — first-run org creation
- `web/app/(dashboard)/settings/page.tsx` — members, MDM bundle download, billing portal
- `web/middleware.ts` — edge auth check on /(dashboard)/*
- `web/lib/ratelimit.ts` — per-IP/email limiter
- `Dockerfile` — single self-host image, BYO env
- `web/.env.example` — required + optional env documented

## Files to modify
- `web/lib/db.ts` — users, memberships(role enum), magic_link_tokens, orgs.{plan, stripe_*, policy_version}
- `web/lib/auth.ts` — add getSession/requireUser/requireRole; keep device-token bearer for ingest
- `web/app/api/{ingest,policy}/route.ts` — optional BotID gate (env-toggled), backward compatible
- `web/app/(dashboard)/overview/page.tsx` — wrap in requireRole(viewer+); redirect to /login or /onboarding
- `web/app/page.tsx` — add Sign in / Get started CTAs
- `web/app/pricing/page.tsx` — wire Team CTA → login/checkout

## Dependencies
- dashboard (mutual — co-developed; schema lands first as a single owner)

## Complexity / days
L / 9

## Top risks
1. MV3 invariant: BotID + auth must NOT cause collector to receive raw keys/bodies.
2. Self-host parity: Stripe/BotID SaaS-coupled — Docker image must degrade gracefully.
3. Session security: SESSION_SECRET management + CSRF double-submit must be correct.
4. Optional BotID on ingest/policy could break existing extension clients if not strictly env-gated.
5. Magic-link must be single-use, short-TTL, hashed at rest, rate-limited.
6. Shared schema migration with dashboard — coordinate ownership.

## Open questions
- Stateless cookies vs server-side sessions table (for log-out-everywhere)?
- Cookie primitive: AES-GCM, iron-session, JWT, HMAC?
- Org creation self-serve or invite-only?
- BotID = Vercel BotID vs Cloudflare Turnstile?
- Stripe price IDs in env or config?
- Magic-link TTL (15 min?), rate-limit thresholds for self-host without Redis?

## Exit criteria
- Sign in with magic link → land on /overview.
- First-run user gets /onboarding to create org.
- Mutating actions require CSRF; reads gated by role.
- MDM policy bundle downloadable, valid JSON, populates chrome.storage.managed correctly.
- Stripe Checkout → webhook → org plan transition; portal accessible to billing role.
- `docker run -e DATABASE_URL=... moltypass:latest` works on a fresh DB.
