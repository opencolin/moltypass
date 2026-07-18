# Chrome Web Store Listing

Single-purpose justification: **An encrypted vault for AI API keys, with per-site consent and a clipboard-free capture flow.**

## Title (45 char limit)

Moltypass — AI API Key Vault

## Short description (132 char limit)

Encrypted vault for your Anthropic, OpenAI, and Gemini API keys. Per-site consent. Keys never enter the page.

## Detailed description

Moltypass holds your AI API keys in a local encrypted vault and proxies AI requests on your behalf, so the key never enters the page that's using it.

### What you get

**Vault, not a sticky note.** Your Anthropic, OpenAI, and Gemini keys are encrypted at rest with Argon2id + AES-GCM. One master password unlocks the vault; it auto-locks after 5 minutes of inactivity.

**Clipboard-free capture.** When you generate a new key on the provider's console, Moltypass detects it and offers a "Save to Moltypass" banner. The key flows from the page's DOM directly into the encrypted vault — it never touches the system clipboard, where other apps could read it.

**Per-site consent.** When a site wants to use a key, Moltypass shows you which site, which service, and which key, and asks. You decide. Approve once, for a session, or until you revoke.

**Proxy mode.** When you approve a site to use a key, Moltypass forwards the AI request to the provider with the key in the header. The key never enters the page's JavaScript. The site gets the response, not the credential.

**Audit + revoke.** The Moltypass dashboard shows every site that has used each key, when, and how often. Revoke any grant in one click. Rotate any key — Moltypass mints a new one, mirrors your grants to it, and invalidates anything that was using the old key.

**No telemetry. No account.** Moltypass does not send your keys, your usage, or any identifier to any server. Everything stays on your machine.

### For teams

Organizations can deploy Moltypass via Chrome Enterprise policy with a configured collector URL. Devices send structured metadata (origin, service, fingerprint, status, latency) to the org's own collector — never raw keys, never request bodies. Personal users see no enterprise behavior at all.

### Supported providers

- Anthropic (Claude)
- OpenAI
- Google Gemini

More providers will be supported in v1.x.

### Open source

Moltypass is open source under the MIT license. Audit the crypto, the message handlers, and the proxy: <https://github.com/moltypass/moltypass>

## Categories

- Primary: Developer Tools
- Secondary: Productivity

## Languages

English (initial release). Localization queued for v1.x.

## Screenshots required

1. Popup main view — list of stored keys + Add Key + Open Dashboard.
2. Per-site consent prompt for a fresh proxy call.
3. Sharing dashboard — table of sites × keys × last-used × calls.
4. Save banner on console.anthropic.com.

## Marketing tile

1280×800 hero with the tagline: "Your AI API keys belong in a vault, not pasted into every site you visit."

## Privacy policy URL

https://moltypass.app/privacy

## Support URL

https://github.com/moltypass/moltypass/issues
