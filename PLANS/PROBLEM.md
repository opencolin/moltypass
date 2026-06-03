# Moltypass — The Problem

## In one sentence

**Developers are pasting live API keys into chat windows, dropping them into `.env` files, and copying them between tools — because there is no system that holds an AI credential as a credential.**

The exhibit below is a real, well-meaning AI coding agent walking a user through the "right" fix after the user pasted a live key into chat. The agent's advice is the status quo. The status quo is broken.

## Exhibit A — the moment the leak happens

> ⚠️ That looks like a live credential — a service-account static key (the `statickey-...` / `serviceaccount-...` payload gives it away, likely a Nebius/cloud token).
>
> I'm not going to use, store, echo, or act on it. A few things:
>
> 1. Treat it as compromised and rotate it now. It's been pasted into a chat transcript, so it should be considered leaked regardless of what happens next. Revoke/regenerate it in the issuing console (if this is the Nebius key for the PR we were just reviewing, do it from the Nebius/Token Factory dashboard).
> 2. Don't paste secrets here. For the live spot-check I offered, the right pattern is to put the key in `~/.hermes/.env` as `NEBIUS_API_KEY=...` yourself — I read it from the environment at runtime and it never has to appear in the conversation:
>
> ```sh
> hermes config set NEBIUS_API_KEY <your-key>   # writes to ~/.hermes/.env
> ```
>
> Then I can run the reasoning spot-check (Qwen3-Thinking, DeepSeek-V4) against the endpoint without the secret ever being in chat.
> 3. If you intended to send me something else and this was a paste accident, no harm — just rotate it and resend the actual message.
>
> Want me to proceed with the live model spot-check once you've set the key via `.env`? I'll only read it from the environment.

## What this exhibit actually proves

The agent did its job: it detected the leak, refused to use the key, and recommended a fix. But every line of that recommendation reveals a hole the user has to plug themselves:

1. **"Treat it as compromised and rotate it now"** — the user must know which dashboard issues this key. The user must navigate to the right tenant. The user must regenerate, then paste the new value into the right place. Friction → users don't rotate.
2. **"Put the key in `~/.hermes/.env` as `NEBIUS_API_KEY=...`"** — the user must know:
   - which CLI's dotfile this tool reads (`~/.hermes/.env`, not `~/.config/hermes/env`, not `~/.env`)
   - which env-var name this tool expects (`NEBIUS_API_KEY`, not `NEBIUS_TOKEN`, not `TOKEN_FACTORY_KEY`)
   - that `~/.hermes/.env` is on disk as **plaintext**
   - that every subprocess that agent spawns inherits the env var
3. **"`hermes config set NEBIUS_API_KEY <your-key>`"** — a per-CLI command. The user has to remember a different command for every coding agent (`hermes config set`, `cursor settings`, `code --secret`, `claude config set`...). The key still ends up in plaintext on disk.
4. **"I'll only read it from the environment"** — the agent has no way to prove this to the user, no way to log which call used the key, no way to refuse keys to other tools that might also read the same env, no way to revoke if it goes bad.

The user, having heeded this advice perfectly, still has:
- a plaintext key in `~/.hermes/.env`
- a plaintext key in `~/.cursor/...`, `~/.claude/...`, `~/.config/aichat/...`, and `.env.local` in three Next.js projects
- zero ability to revoke any of them centrally
- zero audit of which tool used the key when
- zero protection if `~/.hermes/.env` is exfiltrated by a malicious npm postinstall, a clipboard-history app, or a sloppy `git add .`

The agent's advice was the most secure thing it knew. **The most secure thing the ecosystem has invented is `.env`.** That's the problem.

## What's actually missing

A system that holds AI credentials the way a password manager holds passwords:

| Need | `.env` files give you | A real vault gives you |
|---|---|---|
| **Encryption at rest** | none | KDF-derived AES-GCM |
| **Per-app access** | every subprocess inherits | per-origin / per-call consent |
| **Revocation** | edit every `.env` everywhere | one click; in-flight calls aborted |
| **Rotation** | manual find-and-replace across `~/.hermes/.env`, `.env.local`, dotfiles, etc. | one rotate; grants re-pointed; old key invalidated |
| **Audit** | none | every use logged with site, time, status, latency |
| **Onboarding** | "first, set up `.env`. then memorize env-var names per tool. then `gitignore` them. then…" | "click the key in your provider console" |
| **Anti-paste** | none — the agent transcript itself becomes the leak vector | save direct from the provider's DOM; clipboard is never touched |
| **Anti-spread** | every new tool needs its own `.env` copy | one vault, many consented consumers |

## Who has this problem

Three personas, one shape of pain:

1. **The individual developer** uses 4–7 AI APIs (Claude, OpenAI, Gemini, Nebius/Together/Groq for OSS models, Replicate, ElevenLabs…) across 3 coding agents and 5 hobby projects. Their `.env` files are out of sync. They've definitely committed a key once. They don't rotate.
2. **The vibe-coding founder** is paying personally for API access while building. They wire their personal key into the demo. The demo gets shown to investors. The key ends up on a screenshare. Charges show up they don't recognize. They don't know which dashboard issued which key.
3. **The 25-person AI startup** has every engineer using a shared org token. The org token is in a Notion page, in 6 `.env.example` files, in Slack DMs, in a Vault that 3 people remember the URL for. An engineer leaves. The token is not rotated. The next quarter's API spend is 30% higher than it should be and nobody knows why.

All three of them are technically following best practice as told to them by the AI agent above. The best practice is the problem.

## How Moltypass answers each piece

This is the product positioning the landing page should lead with.

1. **No paste.** Capture happens on the provider's key-creation page. The key flows from DOM → encrypted vault. Never the clipboard, never the chat transcript, never the `.env`.
2. **No env vars.** Tools that want a key call `window.moltypass.fetchFor('anthropic')` (or the CLI equivalent — `moltypass exec hermes ...` injects the auth only for that process, only for that provider). No more "which env var does this tool want."
3. **Per-call consent.** The first time a new origin uses your key, Moltypass shows the origin and asks. After that it's silent but audited. Any time, you can revoke.
4. **Rotation that actually rotates.** Rotate in the vault; every consented site keeps working under the new key. The old key is invalidated. In-flight requests die.
5. **Audit.** Every call is logged with origin, time, status, latency. You can see in 10 seconds which site is responsible for the spike on your card.
6. **Leak watch.** A 7-day rolling baseline flags when a key's volume drifts past the noise floor. Advisory — Moltypass never auto-revokes — but the user gets a chance to act before the bill arrives.

## The positioning sentence

> **Your API keys are credentials. Stop treating them like environment variables.**

Subhead:

> Moltypass is the password manager AI keys never had. Save them straight from the provider's console, use them in any app without ever pasting, rotate or revoke in one click, and see every call that ever used one.

## What this means for the landing copy

The hero on `web/app/page.tsx` currently leads with the more abstract "your AI API keys belong in a vault" framing. The above is sharper because it names the concrete moment of leak and the broken thing the user is already doing every day. The next iteration of the landing should:

- Lead with a stylized version of the Exhibit A scenario ("an AI agent caught you pasting your key. that wasn't the win. you still have to fix it. here's what 'fix it' looks like today.")
- Anchor the value props in the table above (rotation, revocation, audit, anti-paste, anti-spread).
- Speak directly to all three personas (consumer dev, vibe-coding founder, small AI startup) — same hero, three named use cases.
