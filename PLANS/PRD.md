# Moltypass — Product Requirements Document

**Status:** v1.0 draft. Council-decided scope locked in `PLANS/council/v1-scope-decision.md`. This document is what we're building, who for, and how it should feel.

**Companion docs:** [PROBLEM.md](PROBLEM.md) (problem definition), [ROADMAP.md](ROADMAP.md) (sequencing), [RELEASES.md](RELEASES.md) (per-version cuts).

---

## 1. Vision

**Moltypass is the password manager AI keys never had.** It holds your AI API keys in an encrypted local vault, captures them straight from the provider's key-creation page so the clipboard is never touched, lets any app use them by asking your consent once and proxying without ever revealing the bytes, and gives you a single dashboard to revoke, rotate, and audit every site that ever held one.

When Moltypass is doing its job, the words "`.env`", "copy", "rotate", and "leak" stop being daily anxieties.

---

## 2. Problem (one-paragraph summary)

Developers store, copy, and reuse AI API keys the way they store passwords in 2003. The currently-recommended best practice is `.env` files — plaintext on disk, per-CLI dotfile rituals (`~/.hermes/.env`, `~/.cursor/...`, `~/.claude/...`), env-var name shibboleths memorized per tool, and zero ability to revoke, rotate, audit, or detect abuse. Even AI coding agents themselves recommend this pattern when they catch a leak (see Exhibit A in `PROBLEM.md`). The recommendation is the problem.

---

## 3. ICP — Ideal Customer Profile

### Primary ICP (v1.0): the individual AI-curious developer

**Who they are:**
- A developer who actively uses 3–7 AI APIs across hobby and work projects (Claude, OpenAI, Gemini, plus 1–3 OSS-model hosts like Together/Groq/Nebius).
- Uses 1–3 AI coding agents simultaneously (Claude Code, Cursor, Continue, Aider, etc.).
- Pays personally for at least one provider; the credit card on file is their own.
- Comfortable in the terminal, runs Chrome as primary browser, has a GitHub account, ships side projects.
- Age range: 22–45. Often early-career to senior individual contributor, or a founder building a prototype.

**What their day looks like:**
- Generates a new API key once or twice a month.
- Pastes a key into a `.env` file, Notion page, or chat transcript at least once a quarter (and feels bad about it each time).
- Has at least two keys in their dotfiles right now that they couldn't tell you the last time they rotated.
- Has been spooked by an unexpected charge at least once.

**What they want:**
- "Stop making me think about credentials." They want their AI tools to *just work* without per-tool env-var rituals.
- A place to see "where did I put that key" without grepping their dotfiles.
- The ability to revoke quickly when something feels off.
- Not another subscription. This person hates the third $7/month bill.

**Why they're primary:**
- They install themselves; we don't need a sales motion to reach them.
- They write blog posts and screen-record their workflows. Their adoption seeds the team motion.
- They are the loudest critics of clunky security tools. If we win them, the product is durable. If we don't, we have nothing.

**Anti-persona:** the dev who's happy with `.env` and has never been bitten. We will not market to them. They'll show up when they get bitten.

### Secondary ICP (v1.x → v2.0): the small AI startup (5–30 people)

**Who they are:**
- An AI-product company where most engineers use AI APIs daily.
- Has at least one engineer who has accidentally committed a key, with a Slack thread to prove it.
- Has either no IT person or one IT person who also runs the office WiFi.
- Pays for AI APIs at the org level — there's an org-issued key shared in a Notion page or vault, plus several personal keys floating around.

**What they want:**
- Audit ("which engineer is responsible for this $4000 OpenAI bill last week?").
- Revoke when an engineer leaves.
- A way to say "no personal API keys in our products" and have a tool that enforces it.
- Compliance vocabulary they can show to their first enterprise customer ("SOC 2 process for AI credentials").

**Why they're secondary, not primary, in v1.0:**
- They require admin tooling, MDM, billing, and SSO before they can adopt.
- They will install Moltypass on individual machines first via the primary ICP. We catch them on the way up.

### Tertiary ICP (v2.x): the 100+ engineer org with an IT/security team

Out of scope for v1.0 explicitly. Listed only to keep the architecture aligned: nothing in v1.0 should make the path to enterprise harder.

---

## 4. Goals and non-goals for v1.0

### Goals

1. **A single individual dev installs the extension and within 5 minutes has at least one key in the vault and one site using it.** This is the activation event.
2. **That dev's coding agents, browser-based AI tools, and provider consoles work the same as before from the user's perspective** — Moltypass disappears once it's set up.
3. **The dev can answer "where is my Anthropic key being used?" in 10 seconds** without leaving Moltypass.
4. **The dev can revoke a site's access in 1 click** and trust that the revocation took effect immediately.
5. **The local vault is provably secure enough** that the dev would feel okay storing their production keys in it (Argon2id + AES-GCM, KDF-versioned header, SECURITY.md published).
6. **The product is free for a single user with no asterisk** — no time-limited trial, no upsell modal.

### Non-goals (v1.0)

1. **Not a general password manager.** We don't try to replace 1Password. We hold AI API keys and only AI API keys.
2. **Not a server-side credential proxy.** All keys live on the device. The collector for enterprise mode (v2.0) receives only metadata, never key bytes.
3. **Not an AI gateway / model router.** We don't sit between your code and the provider. We authenticate the call you were already going to make.
4. **Not a billing / cost-tracker.** We surface what providers report; we don't meter ourselves.
5. **Not Firefox, Safari, or Edge.** Chromium-first; cross-browser is v1.x or later.
6. **Not a CLI yet.** The CLI binary that injects keys into terminal subprocesses (`moltypass exec hermes ...`) is on the v1.x roadmap, not v1.0.

---

## 5. UX — the core flows

The product has nine flows that matter. Each has a target completion time and a "feels-right" criterion.

### Flow 1 — Install and first-run

**Target:** install → vault unlocked → first key saved in **< 3 minutes**.

```
1. User clicks "Add to Chrome" on chrome.google.com listing or moltypass.app.
2. Chrome installs; Moltypass icon appears in toolbar.
3. Auto-opens onboarding tab (chrome-extension://.../welcome.html):

   ┌─────────────────────────────────────────────────┐
   │ 🔒 Welcome to Moltypass                         │
   │                                                  │
   │ One password unlocks your AI keys.              │
   │ It never leaves your device.                    │
   │                                                  │
   │  [ Master password ........................... ]│
   │  [ Confirm  ................................... ]│
   │                                                  │
   │  Strength: ████████░░  Strong                   │
   │                                                  │
   │              [ Create vault ]                   │
   └─────────────────────────────────────────────────┘

4. Vault created (Argon2id KDF; ~800ms perceptible spinner).
5. Provider picker:

   "Which AI service do you want to add a key for?"
   [ Anthropic ]  [ OpenAI ]  [ Gemini ]  [ I'll do it later ]

6. User picks Anthropic. Two paths offered:

   [ I have a key — paste it ]      [ Get a new key → ]

7a. Paste path:
    Single-field paste, validated against keyShape, labeled "default".
    Saved. Onboarding done.

7b. Get-a-new-key path:
    Tab opens to console.anthropic.com/settings/keys with an
    overlay tip "When you click Create Key, Moltypass will offer
    to save it — no copying required."
    (Continues into Flow 2.)
```

**Feels-right criterion:** the master password is the only thing the user has to type to get a key into the vault. Everything else is clicks.

### Flow 2 — Save from a provider page (the magic moment)

**Target:** create-key on provider → key in vault in **< 30 seconds, zero clipboard touches**.

This is the single most important interaction. The whole pitch lives here.

```
1. User is on console.anthropic.com/settings/keys.
2. Clicks the provider's "Create Key" button.
3. Provider's one-time-display modal renders the new key.
4. WITHIN 500ms, Moltypass injects a Shadow-DOM banner in the
   bottom-right of the page:

   ┌──────────────────────────────────────────┐
   │ 🔒 Moltypass detected a new Anthropic    │
   │    API key. Save it without copying.     │
   │                                          │
   │    sk-ant-EXa…3kfP                       │
   │                                          │
   │             [ Dismiss ] [ Save to vault ]│
   └──────────────────────────────────────────┘

5. User clicks "Save to vault". Confirmation popup:

   "Save Anthropic key from console.anthropic.com?
    Label: [ personal ]
                                  [ Cancel ] [ Save ]"

6. Save → key encrypted to vault, audit event logged, banner
   self-destructs. Provider's modal is unaffected; user can
   close it as usual.
```

**Feels-right criterion:** the user never touches the clipboard, never sees the key bytes outside the masked banner, and can close the provider's "are you sure you copied it?" modal without anxiety.

**Failure mode handled:** if the provider's DOM changed and the banner doesn't appear, the user can fall back to manual paste (Flow 7) or the element picker (Flow 8).

### Flow 3 — A site uses a key for the first time

**Target:** first-use consent → user decision in **< 10 seconds, with all the info they need to choose**.

```
1. User visits a site that uses Moltypass — e.g. cursor.sh, t3.chat,
   or their own dev server testing window.moltypass.fetchFor.
2. The site calls window.moltypass.fetchFor('anthropic'). This is
   the first time cursor.sh has asked for an Anthropic key.
3. Moltypass opens a small popup window (NOT the extension popup —
   a dedicated consent window so it can't be confused with the page):

   ┌──────────────────────────────────────────────────┐
   │ 🔒 Moltypass                                     │
   │                                                  │
   │  cursor.sh                                       │
   │  wants to use your                               │
   │  Anthropic (Claude) key                          │
   │                                                  │
   │  Which key?  [ personal ▾ ]                     │
   │                                                  │
   │  Mode:                                          │
   │   ● Proxy mode — the site asks Moltypass to     │
   │     make the API call. Your key never enters    │
   │     the page. (recommended)                     │
   │   ○ Reveal mode — give the site the raw key.    │
   │     Older SDKs that need it. ⚠️                  │
   │                                                  │
   │  Duration:                                       │
   │   ○ Just this once                              │
   │   ● Until I revoke                              │
   │   ○ For 8 hours                                 │
   │                                                  │
   │       [ Deny ]              [ Allow ]            │
   └──────────────────────────────────────────────────┘

4. User clicks Allow. Subsequent calls from cursor.sh are silent
   but audited. Badge briefly pulses to confirm the call shipped.
```

**Feels-right criterion:** the user trusts the popup is from Moltypass (its own window, distinctive UI, origin verified). The defaults are safe (proxy mode, until-revoke). The user can be confident "Allow" doesn't give the site forever-access to the raw key bytes.

### Flow 4 — Daily use (the silent path)

After Flow 3, calls from cursor.sh are silent. Moltypass shows ambient signals only:

- Toolbar badge briefly pulses on each proxied call (turnable off in settings).
- Click the badge: dropdown shows "Last call: cursor.sh · Anthropic · just now · 245 tokens".
- The dropdown's "Dashboard ↗" button opens Flow 5.

**Feels-right criterion:** zero modal interruptions during normal use. The user does not see Moltypass for days at a time.

### Flow 5 — The sharing dashboard (Audit)

**Target:** open dashboard → identify any site that has used a key in **< 10 seconds**.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Moltypass — Sharing dashboard                          [ Export ▾ ] │
│                                                                       │
│ You've shared 3 keys with 6 sites. Last shared 2h ago.               │
│                                                                       │
│ [ search… ]   Provider: [All] [Anthropic] [OpenAI] [Gemini]          │
│              Mode: [All] [Proxy] [Reveal]   Group: [By site ▾]       │
│ ──────────────────────────────────────────────────────────────────── │
│ Site                Provider  Key       Mode    Shared  Last   Calls │
│ ──────────────────────────────────────────────────────────────────── │
│ claude.ai           ● Anthr.. personal  proxy   3d ago  2h ago   847 │
│ cursor.sh           ● Anthr.. personal  proxy   7d ago  1d ago  3128 │
│ chat.openai.com     ● OpenAI  work      reveal  2d ago  2d ago    12 │
│ aistudio.google.com ● Gemini  personal  proxy   5d ago  never     0  │
│ perplexity.ai       ● Anthr.. personal  proxy   14d ago 6h ago   234 │
│ t3.chat             ● OpenAI  work      proxy   1d ago  3h ago    56 │
└──────────────────────────────────────────────────────────────────────┘
```

Every row has a hover-state action: `[ Revoke ]`. Group-by-key view (right-side toggle) shows the dual: which sites are sharing this key.

**Feels-right criterion:** the answer to "where is my key being used?" is the first thing the user sees. No drilling in, no scroll.

### Flow 6 — Revoke

**Target:** click revoke → revocation effective in **< 50ms**.

```
1. User clicks [ Revoke ] on the cursor.sh row.
2. Confirm dialog:

   "Revoke Anthropic access for cursor.sh?

    The site keeps any key bytes it has already received from
    REVEAL-MODE grants. If the grant was PROXY, the site never
    saw the bytes.

    Future calls from cursor.sh will fail with 'not_connected'
    until you re-approve. In-flight calls will be aborted.

                       [ Cancel ]  [ Revoke ]"

3. User clicks Revoke.
4. Behind the scenes: bumpEpoch + abortAllInFlight + permissions.revoke.
5. Row disappears from the open list; appears in "Revoked" tab.
6. Audit event logged.
```

**Feels-right criterion:** the user gets honest disclosure (proxy vs reveal disclaimer) and instant confirmation. Revoke is not "submitted" — it is *done*.

### Flow 7 — Manual key paste (the fallback path)

The "I have a key" path from Flow 1, also reachable from popup → "+ Add existing key". Validated against `keyShape`, labeled, saved. Plaintext NEVER displayed back after save; the masked preview is final.

### Flow 8 — Element picker / right-click save (universal fallback)

For pages where the detector banner (Flow 2) doesn't fire — old providers, internal AI gateways, anything custom — two clipboard-bypassing fallbacks:

- **Cmd+Shift+M** (Mac) / **Ctrl+Shift+M** (Win/Linux): a crosshair appears, the user clicks the element containing the key, Moltypass reads its `textContent` and routes through the same confirm flow.
- **Right-click selected text** → "Save selection to Moltypass…" — Chrome's privileged context-menu API delivers the selection directly; the system clipboard is bypassed.

**Feels-right criterion:** even if Anthropic redesigns their console tomorrow, the user has a working path.

### Flow 9 — Rotate a key

**Target:** rotate → all grants pointing at the new key → in **< 60 seconds**.

```
1. User clicks [ Rotate ] in the Keys tab (or per-key row in dashboard).
2. Dialog:

   "Rotate 'personal' (Anthropic)?

    1. Moltypass will open console.anthropic.com so you can
       generate a new key.
    2. When the new key appears, Moltypass will save it under
       label 'personal-rotated-2026-06-03'.
    3. All 4 sites currently using 'personal' will instantly
       start using the new key.
    4. The old key is removed from your vault. Revoke it at
       Anthropic when you're confident the rotation worked.

                              [ Cancel ]  [ Continue ]"

3. User clicks Continue. New tab opens to the provider console.
4. User generates the new key. Moltypass banner detects it.
   Banner copy is rotation-aware: "This looks like a rotation
   of 'personal'. Use it as the rotated key?"
5. User confirms. rotateKey() runs: mint new → mirror grants
   → drop old → bump epoch.
6. Toast: "Rotation complete. 4 sites now use 'personal-rotated-2026-06-03'."
```

**Feels-right criterion:** the user does not have to update any `.env` file, restart any process, or paste anything. The rotation is fully resolved before they switch tabs back.

### Out-of-scope-for-v1.0 flows (named for the roadmap)

- Team-admin MDM onboarding (v2.0).
- Admin web dashboard for fleet visibility (v2.0).
- CLI binary for terminal subprocess injection (v1.x).
- Cross-browser (Firefox / Safari / Edge) parity (v1.x).
- Streaming SSE proxy mode for chat completions (post-launch — non-streaming POST covers MVP).

---

## 6. Functional requirements

In each row, "v1.0" = the council-decided launch scope; everything else is later.

| # | Requirement | v1.0? |
|---|---|---|
| FR-01 | Encrypted local vault with master-password unlock | ✓ |
| FR-02 | Argon2id KDF with PBKDF2 fallback, KDF-version field in vault header | ✓ |
| FR-03 | AES-GCM at-rest encryption of key bytes + audit IDB | ✓ |
| FR-04 | Vault auto-lock after 5 min idle, configurable 1-60 min | ✓ |
| FR-05 | Support Anthropic, OpenAI, Gemini with provider-specific auth headers | ✓ |
| FR-06 | Manual key paste flow with shape validation | ✓ |
| FR-07 | "Get a new key" flow with provider deep-link + inline instructions | ✓ |
| FR-08 | Provider key-creation page detector + Shadow-DOM banner | ✓ |
| FR-09 | Cmd+Shift+M element picker (clipboard-bypassing) | ✓ |
| FR-10 | Right-click "Save selection to Moltypass" context menu | ✓ |
| FR-11 | `window.moltypass.fetchFor(provider)` SDK-compatible proxy API | ✓ |
| FR-12 | Per-(origin, service) consent prompt with proxy / reveal mode toggle | ✓ |
| FR-13 | Three consent durations: once, until-revoke, time-boxed | ✓ |
| FR-14 | Proxy mode: extension makes upstream call; key never enters page | ✓ |
| FR-15 | Reveal mode: explicit louder consent; full key returned to page | ✓ |
| FR-16 | Sharing dashboard (full-tab UI) with sort, search, filter, group | ✓ |
| FR-17 | One-click revoke (per-grant, per-key, per-origin) | ✓ |
| FR-18 | Revocation epoch enforced in proxy: stale-epoch responses dropped | ✓ |
| FR-19 | Key rotation flow: mint new, mirror grants, drop old, bump epoch | ✓ |
| FR-20 | IndexedDB audit log with 5 indexed query dimensions | ✓ |
| FR-21 | JSON + CSV audit export | ✓ |
| FR-22 | Signal B local-volume anomaly detection (advisory, no auto-revoke) | ✓ |
| FR-23 | Chrome Web Store distribution with privacy policy | ✓ |
| FR-24 | Audit-event grep CI guard: no key-shaped strings in logs | ✓ |
| FR-25 | Streaming SSE proxy (`fetchFor` returns a streamable Response) | v1.1 |
| FR-26 | Firefox + Safari extension parity | v1.x |
| FR-27 | CLI binary: `moltypass exec <cmd>` injects auth per subprocess | v1.x |
| FR-28 | Custom provider registration (Cohere, Mistral, Together, etc.) | v1.x |
| FR-29 | Centralized audit collector + admin dashboard + magic-link auth | v2.0 |
| FR-30 | chrome.storage.managed MDM bootstrap + policy enforcement | v2.0 |
| FR-31 | Stripe billing for Team plan | v2.0 |
| FR-32 | Signal A provider-usage polling (admin keys) | v2.0 |
| FR-33 | SAML 2.0 + SCIM for Enterprise tier | post-v2.0 |

---

## 7. Non-functional requirements

### NFR — Security (council T+1 red lines)

- **NFR-S1** Vault encrypted at rest with a key derived from the user's master password — never stored.
- **NFR-S2** The CI test-gate's grep guard refuses any commit containing a key-shaped string outside `tests/fixtures/synthetic-keys.ts`.
- **NFR-S3** SECURITY.md is current at launch with disclosure contact (security@moltypass.app) and STRIDE annotations per surface.
- **NFR-S4** No key bytes appear in any log, console output, error report, or crash dump in any code path. Audited via grep + manual review pre-launch.
- **NFR-S5** Revocation epoch enforced before AND after every upstream fetch. Unit test demonstrating mid-fetch revoke rejection is a launch gate.
- **NFR-S6** TOCTOU residual on streaming responses is documented in SECURITY.md (accepted residual per council).

### NFR — Privacy

- **NFR-P1** No telemetry by default. No analytics endpoint. No "anonymous usage stats" toggle that we secretly default-on.
- **NFR-P2** Error reporting is policy-gated and fails closed (off when /api/policy unreachable).
- **NFR-P3** The collector (v2.0+) never receives raw key bytes or request/response bodies — only structured metadata + salted fingerprints. CI test on the ingest endpoint refuses key-shaped fields.

### NFR — Performance

- **NFR-Perf1** Proxy hot path adds < 10ms median overhead vs. raw `fetch` (epoch checks, audit emit, header scrub).
- **NFR-Perf2** Vault unlock completes in < 1s on a 2018-era laptop with Argon2id pinned params.
- **NFR-Perf3** Dashboard list rendering: 100 rows in < 100ms.
- **NFR-Perf4** Audit query: 10k events filtered + paginated in < 100ms.

### NFR — Reliability

- **NFR-R1** MV3 service-worker death is invisible to the user: any in-progress consent or proxy call recovers on wake.
- **NFR-R2** Audit log survives the SW being killed mid-write (lazy IDB reopen).
- **NFR-R3** Browser restart does not lose grants, audit, or vault contents.

### NFR — Accessibility

- **NFR-A1** All UI surfaces (popup, consent window, dashboard, banner, picker) operable via keyboard only.
- **NFR-A2** ARIA live regions announce: vault unlock, consent prompt, banner appearance, picker active.
- **NFR-A3** Color is never the sole signal — every status (proxy/reveal, open/dismissed, success/error) has a text label.

---

## 8. Success metrics

What we measure post-launch — local only at first, opt-in remote later.

| Metric | How we measure | Target by month 3 |
|---|---|---|
| **Activation** | % of installs that save ≥ 1 key in week 1 | ≥ 60% |
| **Magic-moment** | % of saved keys captured via detector/picker (not paste) | ≥ 40% |
| **Daily usage** | % of week-1-activated users with ≥ 1 proxy call in month 1 | ≥ 50% |
| **Trust signal** | % of users in a quarterly NPS survey who say "I would trust Moltypass with my production keys" | ≥ 70% |
| **Revoke usage** | % of users who revoke ≥ 1 grant in month 1 | ≥ 20% |
| **Rotation usage** | % of users who rotate ≥ 1 key in month 1 | ≥ 5% |
| **Anomaly value** | % of Signal B findings users self-report as "useful" | ≥ 50% |
| **Retention** | % of month-1 actives still active month 3 | ≥ 60% |
| **Word-of-mouth** | % of installs reporting "friend/coworker recommended" | ≥ 30% |
| **CWS rating** | Chrome Web Store average rating after 100 reviews | ≥ 4.5 |

A v1.0 that hits activation + retention but misses revoke usage tells us the audit dashboard is invisible. A v1.0 that hits revoke but misses retention tells us the consent prompts annoy. We will react to whichever signal moves first.

---

## 9. Risks and open decisions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Provider DOM changes break the detector | High | Medium | Shape-regex over selectors; element picker as fallback; v1.1 ships runtime detector registration so users can fix without a release |
| Argon2id WASM doesn't load under MV3 CSP | Medium | Medium | PBKDF2(600k) fallback + KDF-version field is the entire reason this is recoverable |
| Chrome Web Store rejects host permissions or content scripts | Medium | High | store/permission-justifications.md is precise + single-purpose; if rejected, we appeal with the same doc and a video of the legitimate flow |
| Users mistake reveal mode for proxy mode | Medium | High | Reveal-mode consent is visually distinct (warning color), uses different copy ("give the site the raw key"), per-call (not until-revoke) by default |
| Cmd+Shift+M conflicts with a popular site's shortcut | Medium | Low | User-remappable from popup settings + chrome://extensions/shortcuts |
| Anomaly detector false-positives erode trust | Medium | Medium | Advisory only, no auto-revoke; warm-up guard ≥ 3 days; RECENT_HOUR_FLOOR = 20 to avoid noise alerts |
| User loses their master password | Medium | Catastrophic for them | No recovery path — by design — but the onboarding strongly nudges them to back up the password to their primary password manager |

### Open decisions for the team

| # | Question | Who decides | When |
|---|---|---|---|
| OD-1 | Default consent duration: once, until-revoke, or 8 hours? Current PRD says "until-revoke". | UX | Before code freeze |
| OD-2 | Should reveal-mode grants auto-expire after N hours? Council didn't bind this. | Security + UX | Before code freeze |
| OD-3 | What happens when the vault is locked and a site calls `fetchFor`? Block with "unlock to continue" popup, or fail with `vault_locked` error? | UX | Before code freeze |
| OD-4 | Should the audit-export CSV include the keyId column or only the keyLabel? IDs are stable but ugly; labels are human but mutable. | UX | Before code freeze |
| OD-5 | Do we ship a "Forget I asked" gesture on the consent prompt (denies + remembers denial for the session)? | UX | Before code freeze |
| OD-6 | What's the minimum master-password strength we enforce? Current draft has a strength meter but no floor. | Security | Before code freeze |

---

## 10. What "done" looks like for v1.0

A v1.0 ships when, in a 30-minute usability test with a developer who has never seen Moltypass, the following are true:

1. They install and create the vault without asking for help.
2. They save one key via the detector banner (Flow 2) without being prompted.
3. They visit a site that uses Moltypass and complete the consent flow correctly (chooses proxy mode, until-revoke).
4. They open the dashboard and answer "which sites are using your Anthropic key?" within 10 seconds.
5. They revoke one site's access.
6. At the end of the session, when asked "Would you store your production keys here?", they say yes (or articulate a specific thing we could fix to get them to yes).

If 5 of 6 are true, we ship. If only 3 of 6, we hold and fix the broken flow.
