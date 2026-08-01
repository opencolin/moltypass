# Moltypass

**[moltypass.app](https://moltypass.app)** — Encrypted vault for AI API keys. Browser + terminal. Touch ID. Open source.

> Your API keys are credentials. Stop treating them like environment variables.

Moltypass is the password manager AI keys never had. One vault for the browser, the terminal, and every tool in between. Capture keys straight from the provider's console without ever copying. Unlock with Touch ID. Rotate or revoke in one click. See every call that ever used one.

`.env` is not a secrets manager — and neither is your clipboard, your chat transcript, or your dotfiles.

---

## Install

**Browser** — Chrome extension (free forever for personal use):

```sh
# Coming to the Chrome Web Store. For now, build locally:
pnpm install && pnpm build
# Load unpacked from dist/
```

**Terminal** — macOS / Linux / Windows CLI (v1.1, in progress):

```sh
brew install opencolin/tap/moltypass   # macOS
# Linux + Windows packages follow on the same release.
```

Visit **[moltypass.app](https://moltypass.app)** for the full pitch, screenshots, and the pricing page.

---

## What it does

| Surface | What it solves |
|---|---|
| **Browser** | Save keys directly from `console.anthropic.com` / `platform.openai.com` / `aistudio.google.com` — no clipboard. Sites call `window.moltypass.fetchFor('anthropic')`; the request goes out from the extension, the key never enters the page. |
| **Terminal** | `moltypass exec npm run dev` injects the right keys for the duration of the process. Tool-aware: knows `hermes` wants `NEBIUS_API_KEY`, `continue` wants `ANTHROPIC_API_KEY`, etc. Nothing on disk. |
| **Vault** | Argon2id KDF + AES-GCM. Touch ID unlock on macOS (cached in Keychain with `kSecAccessControlBiometryCurrentSet` — sleep, lock, or steal the laptop and the cached key is gone, even from root). |
| **Dashboard** | One place to see every site and CLI tool that has used each key — when, how often, how fast. Revoke any grant in one click. Anomaly alerts before the bill arrives. |
| **Rotation** | One `moltypass rotate` updates every browser grant and every managed `.env` file in lockstep. No hunts. |

---

## Documentation

The product strategy and engineering plans live under [`PLANS/`](PLANS/):

- [`PLANS/PROBLEM.md`](PLANS/PROBLEM.md) — The problem definition, anchored on a real AI-agent transcript catching a pasted credential.
- [`PLANS/PRD.md`](PLANS/PRD.md) — Product requirements, ICP, and 9 UX flows with target completion times.
- [`PLANS/CLI-AND-DOTFILES.md`](PLANS/CLI-AND-DOTFILES.md) — Terminal surface strategy: CLI patterns, macOS Touch ID architecture, Native Messaging.
- [`PLANS/ROADMAP.md`](PLANS/ROADMAP.md) — Workstream sequencing.
- [`PLANS/RELEASES.md`](PLANS/RELEASES.md) — Per-version cuts.
- [`PLANS/council/v1-scope-decision.md`](PLANS/council/v1-scope-decision.md) — PM Council binding decision on v1.0 / v2.0 scope.
- [`SECURITY.md`](SECURITY.md) — Trust model, STRIDE table per surface, vulnerability disclosure.

---

## Status

| Version | What landed |
|---|---|
| `v0.1.0-internal` | IndexedDB audit log foundation |
| `v0.5.0-alpha` | Crypto vault (Argon2id) + provider key-creation detector |
| `v0.9.0-beta` | Revoke + key rotation + element picker |
| `v1.0.0` | Chrome Web Store submission, CI gate, release pipeline |
| `v2.0.0` | Auth lib, dashboard lib, enterprise collector, leak detection |

**341 tests on `main`.** All workstreams covered by Vitest with a CI grep guard that refuses any commit containing a key-shaped string outside the synthetic-fixtures file.

---

## Architecture in 60 seconds

```
            ┌────────────────┐                 ┌──────────────┐
 Chrome SW  │  Extension     │  Native         │  CLI binary  │
   page →   │  background    │  Messaging      │  (moltypass) │
            └────────┬───────┘  (4-byte LE     └──────┬───────┘
                     │           length + JSON)       │
                     ▼                                ▼
                ┌──────────────────────────────────────┐
                │     Moltypass native helper          │
                │     (vault owner, Touch ID prompt,   │
                │     audit log, consent prompts)      │
                └────────────────┬─────────────────────┘
                                 ▼
                ┌──────────────────────────────────────┐
                │  Encrypted vault on disk             │
                │  (~/Library/Application Support/…    │
                │   or %APPDATA%\Moltypass\…           │
                │   or ~/.config/moltypass/…)          │
                └──────────────────────────────────────┘
```

One vault, two surfaces. Browser extension and CLI are both clients of the same daemon — they share consent, audit, and revocation paths. Same pattern 1Password and Bitwarden use to bridge their browser extensions to their native apps.

---

## Contributing

PRs welcome — especially adding tool-aware support for AI CLIs we haven't covered yet (see [`PLANS/CLI-AND-DOTFILES.md`](PLANS/CLI-AND-DOTFILES.md) §3 Pattern A).

```sh
pnpm install
pnpm test          # 341 tests, ~3s
pnpm test:gate     # typecheck + tests + key-shape grep guard
```

Issues at [github.com/opencolin/moltypass/issues](https://github.com/opencolin/moltypass/issues).

---

## Security

Disclosure: **[security@moltypass.app](mailto:security@moltypass.app)**. PGP key on the [security page](https://moltypass.app/security).

The CI guard at `scripts/grep-no-keys.ts` blocks any commit whose source contains a key-shaped string outside `tests/fixtures/synthetic-keys.ts`. The full threat model and trust boundaries are in [`SECURITY.md`](SECURITY.md).

---

## License

MIT. See [LICENSE](LICENSE).

© 2026 Moltypass · [moltypass.app](https://moltypass.app) · [github.com/opencolin/moltypass](https://github.com/opencolin/moltypass)
