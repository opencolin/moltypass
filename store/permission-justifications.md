# Chrome Web Store — Permission Justifications

These are the per-permission justifications pasted into the Chrome Web Store reviewer form. Each one explains the single-purpose use that requires the permission.

## `storage`

Required to persist the encrypted vault (API keys as AES-GCM ciphertext), per-site grant records, and the local audit log on the user's device. No data is sent anywhere — `storage` is the only mechanism by which Moltypass keeps state between browser sessions.

## `alarms`

Required for two background timers, both essential to the single purpose:
1. **Vault auto-lock** — re-locks the vault after 5 minutes of inactivity so an unlocked vault is not left exposed.
2. **Audit-log retention sweep** — once per day, prunes audit records older than 365 days so the local IndexedDB log doesn't grow unbounded.

Neither alarm performs network activity.

## `tabs`

Required only to open the Moltypass sharing dashboard (a bundled extension page) in a new tab when the user clicks "Open Dashboard" in the popup. Moltypass does not enumerate the user's tabs, does not read tab URLs, and does not modify other tabs' content.

## `contextMenus`

Required to register the right-click menu item "Save selection to Moltypass…". When the user right-clicks selected text and chooses this item, the selection is passed through Chrome's privileged context-menu API (`info.selectionText`) directly into the encrypted vault. This bypasses the system clipboard — a security improvement over copy-paste, since other extensions and clipboard-history apps cannot intercept the key.

## Host permissions: `https://api.anthropic.com/*`, `https://api.openai.com/*`, `https://generativelanguage.googleapis.com/*`

Required for the core proxy feature. When a user grants a site access to a stored key, Moltypass forwards the AI request directly from the background service worker to the provider's API endpoint with the key in the appropriate header (e.g. `x-api-key` for Anthropic, `Authorization: Bearer` for OpenAI, `x-goog-api-key` for Gemini). This is what allows the key to *never* enter the page that's making the request — the host permissions are the mechanism that makes "proxy mode" possible.

Moltypass does not make speculative or background requests to these endpoints. Every request is initiated by an explicit, consented user action.

## Content scripts on provider key-creation URLs

Match patterns:
- `https://console.anthropic.com/settings/keys*`
- `https://platform.openai.com/api-keys*`
- `https://aistudio.google.com/apikey*`

Required for the clipboard-free capture flow. When the user generates a new API key on one of these provider pages, the page briefly displays the plaintext key in a modal. The content script:
1. Watches the page's DOM via `MutationObserver` for a key-shaped string inside a dialog/modal container.
2. Renders a Shadow DOM banner ("Save to Moltypass") next to the modal.
3. When the user clicks Save, reads the key text from the page's own DOM (the same DOM the page itself can see — no new exposure) and sends it through the extension's private message channel to the background service worker, which encrypts it into the vault.

The content scripts on these specific URLs replace the only point in the API-key workflow where users currently copy a high-value credential through the system clipboard. They run only on these URLs, never on arbitrary websites.

## Web-accessible resources

The inpage provider script (`src/inpage/provider.ts`, declared as a web-accessible resource on `<all_urls>`) exposes a `window.moltypass` JavaScript API that sites can use to request AI calls through the vault without ever receiving the key. The script itself contains no secret material; it is a thin RPC client that posts messages to the content script. The content script forwards them to the background service worker, which makes the upstream call.

## Single purpose

All of the permissions above serve a single purpose: **letting a user store AI API keys in an encrypted local vault and use them in their browser without the key ever touching the page or the clipboard.** Moltypass does not have a secondary purpose; it does not display ads, modify pages it does not need to modify, or send data to any server.
