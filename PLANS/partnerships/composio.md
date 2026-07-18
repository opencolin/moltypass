# Partnership pitch — Composio

**Status:** draft. Pre-warm-intro. Send via Colin's relationship.
**Target:** Composio founders / partnerships lead.
**Ask:** 30-min call to walk through a Local Vault adapter.

---

## Why them

Composio runs a multi-tenant credential broker for ~250 SaaS integrations, used by AI-agent builders. The May 2026 security incident exposed the structural cost of holding millions of customer credentials server-side. The post-incident posture is honest but unresolved: any future incident hits the same blast radius. They need an **architectural** answer, not a procedural one.

Moltypass IS the architectural answer for the customers who care: keep the credential bytes on the customer's machine; let Composio do everything else.

## What we'd offer

**Composio Local Vault mode** — an integration adapter that lets Composio Cloud authenticate downstream calls using credentials held in the customer's Moltypass vault, never transmitted to Composio's servers.

Flow:
1. Customer installs Moltypass (browser ext + local daemon) and connects it to Composio.
2. Customer's credentials (OpenAI, Anthropic, Notion, Linear, etc.) live in their local vault.
3. When Composio orchestrates a tool call, the Composio worker on the customer's machine (or a customer-side runtime) calls the local Moltypass daemon via Native Messaging to authenticate the downstream HTTP call.
4. Composio sees the *response*; never sees the *token*.

Customer-visible win: "Composio never touched my secrets."
Composio-visible win: a credible answer to enterprise procurement asking "what if you get breached again?"

## What we ask for

- 30 min with the right Composio person to align on the integration shape.
- Pointer to whoever owns the SDK / worker runtime.
- Willingness to co-launch as a security-posture story.

We do all the engineering on both sides.

---

## The cold email (founder-to-founder, send via warm intro)

> **Subject:** A local-vault adapter for Composio
>
> Hey [name],
>
> The May incident wasn't a bug — it was the structural cost of being a centralized credential broker for AI agents. The fix isn't more server-side crypto; it's giving the customers who care the option to keep the bytes on their own machine.
>
> We're building **Moltypass** — a local-first vault for AI keys. Chrome extension + native CLI, Argon2id + AES-GCM, Touch ID unlock, free forever for individuals, team tier coming. The whole product is "your credentials never leave the device."
>
> The pitch: **Composio Local Vault mode.** Composio Cloud keeps doing what it does — orchestration, tool routing, the catalog. The customer's credentials live in their Moltypass vault. When Composio needs to authenticate a downstream call, it asks the local Moltypass daemon via Native Messaging on the customer's machine; the request goes out from there. You see the response, not the token. The customers who pick this mode get a "Composio never touched our secrets" trust story you currently can't offer.
>
> What we'd do:
> - **Engineering on both sides.** We build the adapter (you don't write any of it).
> - **Co-launch as the post-incident story.** "Composio + Moltypass: the credentials can't leave the machine."
> - **Route our enterprise customers to Composio** for orchestration. We don't do that and aren't going to.
>
> What we'd need: 30 minutes to walk you through the integration shape. Worth a call?
>
> — Colin

---

## Anticipated objections & responses

| Objection | Response |
|---|---|
| "We already encrypt at rest with KMS." | Encryption-at-rest doesn't help when the credentials must be *decrypted* to make the downstream call. Local Vault mode removes the requirement to ever hold the cleartext server-side. |
| "Our customers don't want to install software." | Optional mode. The customers who don't care keep using Composio Cloud as-is. The customers in regulated industries finally have an answer. |
| "This sounds like it competes with us." | It doesn't. We hold *credentials*; you hold *orchestration*. There's a clean seam. We're not building 250 integrations and you're not building a local vault. |
| "Native Messaging is fragile." | We've already solved the framing/SW-restart/backoff. The integration surface is small (~6 RPC methods); we'll ship a hardened client SDK as part of the adapter. |
| "What if Moltypass gets compromised?" | We don't hold customer credentials in the cloud. There's nothing to compromise centrally. Local vault breach = single user's local machine, same blast radius as `~/.aws/credentials`. |

## What would make this a win

- Composio publishes a "Local Vault mode" page in their docs.
- We co-publish a security-architecture blog post comparing the two trust models.
- 6 months in: a real enterprise customer cites Local Vault mode in their procurement decision.

## What would make this a loss

- They pattern-match this as "competitor with security FUD." Mitigation: lead with structural-not-tactical framing, never reference incident specifics beyond what's already public, position as resilience-for-them.
- They build it themselves. Acceptable outcome — the market still moves the right way, and we've validated the architecture.
