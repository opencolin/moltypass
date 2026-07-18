# Partnership pitch — Hermes

**Status:** draft. Pre-warm-intro. Send via Colin's relationship.
**Target:** Hermes Forge founders.
**Ask:** 20-min call to add `hermes` to the Moltypass tool-aware catalog and reciprocally appear in Hermes install docs.

---

## Why them

Hermes Forge is the coding agent in the [PROBLEM.md](../PROBLEM.md) transcript exhibit — the one whose agent caught a live API credential in chat, refused to use it, and then recommended the user put it in `~/.hermes/.env` with `hermes config set NEBIUS_API_KEY`. The agent did the right thing at the *detection* layer and the wrong thing at the *recommendation* layer.

This is the cleanest possible partnership setup: their own tool has already validated the problem. Their own blog ([Hermes Agent Blog — API Key Management for Always-On Agents](https://hermesforge.dev/blog/post-274-api-key-management-agents)) lays out the lifecycle question they care about. The pitch is "your recommendation should point at us."

## What we'd offer

**`hermes` as a first-class entry in the Moltypass tool catalog.**
- We add `hermes` to the tool-aware-CLI registry in v1.1.
- `moltypass exec hermes …` injects `NEBIUS_API_KEY` (and any other env vars Hermes reads) into the child process for the lifetime of the run.
- First-time Touch ID prompt, then session-cached unlock. Zero clipboard, zero `~/.hermes/.env`.
- Auto-detected provider — if the user already has a Nebius key in their vault, Hermes Just Works on first install.

Customer-visible win: `brew install moltypass/tap/moltypass && moltypass exec hermes …` replaces the multi-step `.env` ritual.

Hermes-visible win: their install docs stop telling users to put a plaintext credential on disk. Their transcript-incident frequency drops to zero because there's nothing on disk to leak.

## What we ask for

- Confirmation that `hermes` reads `NEBIUS_API_KEY` from process env (looks like yes from `hermes config` flow).
- A line in Hermes install docs once we ship: *"Recommended: `moltypass exec hermes` to inject your key without a dotfile."*
- Optional: a sentence in the Hermes security FAQ.
- Optional: a featured slot in the Moltypass landing page comparison table, currently anonymized in our PROBLEM.md transcript exhibit, attributed at co-launch.

We do all the engineering.

---

## The cold email (founder-to-founder, send via warm intro)

> **Subject:** Make `moltypass exec hermes` your install path
>
> Hey [name],
>
> We anchored Moltypass's whole problem statement on a Hermes transcript: your agent caught a live API key mid-chat, refused to echo it, and recommended the user put it in `~/.hermes/.env` with `hermes config set NEBIUS_API_KEY`. The agent did exactly the right thing. The *recommendation* is the problem — `.env` is plaintext, persistent on disk, per-tool, no audit, no rotate, no revoke.
>
> Moltypass is what that recommendation should have been: a local-first vault that captures keys directly from `aistudio.google.com` / `console.anthropic.com` / Nebius's console without the clipboard, unlocks with Touch ID, and injects them into a child process on demand. `moltypass exec hermes` runs your agent with the right `NEBIUS_API_KEY` set for the lifetime of that process. Nothing on disk. Nothing in `~/.hermes/.env`. Nothing for the next paste-the-transcript-to-the-model accident to leak.
>
> The pitch: **make `moltypass exec hermes` your documented install path.**
>
> What we'd do:
> - **Add `hermes` to the tool-aware catalog this sprint.** Env-var mapping, provider auto-detect, prompted Touch ID on first call.
> - **Co-launch as "the first coding agent that handles secrets properly."**
> - **Feature you on the moltypass.app landing page** in the comparison table — currently anonymized in our PROBLEM.md transcript, attributable in the launch post.
>
> What we'd need: confirmation `hermes` reads `NEBIUS_API_KEY` from process env (looks like yes from your CLI), a line in your install docs once we ship, and optionally a sentence in your security FAQ.
>
> Worth 20 minutes?
>
> — Colin

---

## Anticipated objections & responses

| Objection | Response |
|---|---|
| "Our users are fine with `.env`." | Your own agent disagrees — the transcript proof point is *their* tool's recommendation. Users aren't fine with plaintext credentials; they tolerate them because nothing better was on the menu. Now there is. |
| "We don't want to depend on a third-party install." | Optional install path, not required. The current `.env` flow keeps working. We just show up in your "recommended" line. |
| "What if Moltypass doesn't ship / abandons the project?" | MIT-licensed, open source, vault format is a documented spec. Worst case: a fork can read the same vault file. No lock-in. |
| "We want our own credential manager." | If Hermes ships its own vault, you're now in the security-product business with a one-tool surface area. Moltypass is the credential-manager-as-shared-infra across every AI tool the user runs. The user wins; you don't have to maintain a vault. |
| "Why not just use 1Password CLI?" | 1Password CLI requires the user to manually configure each item, name each field, and run `op run`. Moltypass auto-captures from provider consoles, auto-detects which env var Hermes wants, and ships with Hermes already mapped. Zero config. |

## What would make this a win

- Hermes install docs include `moltypass exec hermes` as recommended.
- The PROBLEM.md transcript becomes a co-marketing asset ("here's what we caught and how we fixed it together").
- v1.1 launches with `hermes` as one of 5-7 tool-catalog entries; Hermes is the headline tool.

## What would make this a loss

- They build their own vault. Acceptable — we've still validated the install-flow story and can pitch the next agent.
- They want exclusivity. Decline politely — Moltypass is a shared layer, not a per-tool partnership.
