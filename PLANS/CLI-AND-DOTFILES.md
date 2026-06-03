# Moltypass — CLI, Dotfiles, and the Terminal Surface

**Status:** Strategy doc. Expands `PRD.md` FR-27 ("CLI binary: `moltypass exec` injects auth per subprocess").

The extension solves the **browser surface** of AI credentials. The terminal — where coding agents, CLI tools, and scripts live — is the other half of the user's day, and the half where `.env` files multiply. This doc covers how Moltypass extends to that surface, what already exists in the ecosystem, what's specific to macOS, and how the pieces share state.

---

## 1. The user's terminal problem (concrete)

Same individual-dev ICP from `PRD.md`. Their terminal looks like this:

```
~/.hermes/.env                                 NEBIUS_API_KEY=stat…
~/.continue/.env                               ANTHROPIC_API_KEY=sk-…
~/.config/aichat/config.yaml                   client.api_key: sk-…
~/code/side-project/.env.local                 OPENAI_API_KEY=sk-…
~/code/work/.env.development                   ANTHROPIC_API_KEY=sk-…
~/code/work/.env.production                    ANTHROPIC_API_KEY=sk-…
~/code/another-side-project/.env               ANTHROPIC_API_KEY=sk-…
```

Three things are simultaneously true:

1. **Each tool has its own dotfile** in its own location with its own naming convention.
2. **Plaintext, on disk, in your home directory** — readable by any process you run.
3. **Six copies of the same Anthropic key.** When you rotate (you don't), you'd have to find all six.

There is no single command today that says "give this terminal session my Moltypass-stored Anthropic key for the duration of this command, without writing to disk." That's the gap.

---

## 2. What exists today on macOS

A complete survey, honest about who each tool serves.

### 2.1 Secret-store tools

| Tool | What it is | Who uses it | Why it doesn't solve our problem |
|---|---|---|---|
| **macOS Keychain** (`security` CLI) | OS-level encrypted secret store | macOS apps that explicitly integrate (Mail, Safari…) | Almost no CLI dev tools read from it; per-tool integration is the user's problem |
| **1Password CLI** (`op`) | `op run -- npm start` injects from vault | Pros who already pay for 1Password | Requires 1Password account ($36+/yr); designed for general passwords, not the AI-key UX (no provider deep links, no consent prompts, no per-call audit) |
| **Bitwarden CLI** (`bw`) | Similar shape to `op` | Pros on Bitwarden | Same general-password framing; smaller ecosystem |
| **Doppler / Infisical** | SaaS secrets-as-a-service | Small teams with a cloud-only stance | Requires account + sync trust; org-tier pricing |
| **HashiCorp Vault** | Self-hosted enterprise vault | Platform engineers | Enormous setup; not for individuals |
| **pass / gopass** | GPG-encrypted password store, unix-philosophy | Greybeards who like GPG | GPG ceremony alone disqualifies 95% of the ICP |
| **dotenv-vault** | Encrypted .env files synced via dotenv-vault.com | Some Node teams | Online dependency for what should be local; not AI-aware |
| **chezmoi / yadm w/ age** | Dotfile managers with encryption plugins | Power users | Not designed for secrets; encryption is bolted on |

### 2.2 Env-loading conveniences

| Tool | What it is | What it solves | What it doesn't |
|---|---|---|---|
| **direnv** | Auto-loads `.envrc` when you `cd` | Per-directory env without sourcing | Doesn't store secrets; `.envrc` files still have to come from somewhere |
| **mise / asdf** | Version managers w/ env plugins | Pinned tool versions + env | Same — they don't hold secrets |
| **`vercel env pull`** | Sync env from a Vercel project | Project-bound onboarding | Specific to Vercel; tied to a deploy |
| **GitHub Codespaces secrets** | Cloud dev env injection | Codespaces users | Cloud-only; doesn't help local |

### 2.3 What the ecosystem does NOT have

Nothing today combines all four of:

1. **AI-key-specific UX** — knows what Anthropic / OpenAI / Gemini keys look like, knows which dashboard issues them, knows their auth-header names.
2. **No account required** — works for the individual dev who hates the eleventh subscription.
3. **Tool-aware injection** — knows `hermes` wants `NEBIUS_API_KEY`, `continue` wants `ANTHROPIC_API_KEY`, etc., without per-tool memorization by the user.
4. **Audit + revoke parity with the browser** — terminal calls show up in the same dashboard as browser calls; revoking from the dashboard kills both surfaces.

That's the wedge. None of the tools above are competition; they're each solving a different problem.

---

## 3. The three UX patterns we'd ship

Concrete commands. The user types these. They feel like `git`.

### Pattern A — `moltypass exec` (the headline)

```sh
moltypass exec hermes ai chat
moltypass exec npm run dev
moltypass exec --provider anthropic claude -p "fix this test"
```

What happens:

1. Moltypass infers from the command which providers it likely needs (built-in heuristics: `hermes` → Nebius/OpenAI, `claude` → Anthropic, `npm run dev` → look at the project's `.env.example` for hints; fall through to a prompt if ambiguous).
2. Touch ID prompt to unlock the vault (or cached unlock if within idle window).
3. Spawns the subprocess with the relevant env vars set ONLY in that process's environment. The vars are unset in the parent shell.
4. Logs the invocation: timestamp, command, providers used, exit code. Same audit log as the browser extension.
5. On exit, the env vars die with the process. Nothing on disk.

**Feels-right criterion:** the user replaces `npm run dev` with `moltypass exec npm run dev` once in their shell history and never thinks about it again. They don't have to know which env vars `npm run dev` needs.

### Pattern B — `moltypass get` (the escape hatch)

```sh
$ moltypass get anthropic
sk-ant-………………

$ ANTHROPIC_API_KEY=$(moltypass get anthropic) python script.py
```

For one-off scripts and shell pipelines where wrapping is awkward. Always Touch-ID-prompted. The audit logs include "stdout reveal" as a distinct event kind so the user sees they did this.

### Pattern C — `moltypass env --tool <name>` (the last resort)

```sh
$ moltypass env --tool hermes
# Writes ~/.hermes/.env with the right env var name.
# Adds a header comment naming this file as Moltypass-managed.
# Records the file as a managed .env in the vault so 'moltypass
# rotate' can rewrite it on rotation.

$ moltypass env --tool hermes --dry-run
# Prints what would be written; doesn't touch disk.
```

For tools that genuinely refuse to be parented by `exec` (long-lived daemons launched by `launchd`, IDE-spawned subprocesses we can't intercept). Moltypass tracks every `.env` file it writes; on rotation, all of them get rewritten in lockstep. On `moltypass unmanage --tool hermes`, the file is deleted and the user is back to "no key on disk."

This is the pattern that **directly answers the user's question about "configuring their .env file"**: yes, we'll write the file for them when they need one — but we'll also track it, rewrite it on rotation, and let them yank it back when they don't.

---

## 4. macOS-specific moves

The Mac is the right first OS to ship this on. macOS-specific affordances we should use:

### 4.1 Touch ID for vault unlock

The CLI invokes `LAContext` via a small Swift helper to prompt for Touch ID. Vault stays unlocked for an idle window (default 5 min, configurable). Replaces "type your master password every 5 minutes" with "touch the fingerprint sensor."

This is the single largest UX win for the terminal surface. macOS users expect Touch ID prompts; getting one feels Mac-native.

### 4.2 macOS Keychain for the cached unlock secret

The vault key (derived via Argon2id from the master password) gets cached in the macOS Keychain under a Touch-ID-protected entry while unlocked. Lock → entry deleted. macOS lockscreen / sleep → entry's access automatically revoked by the OS (via `kSecAccessControlBiometryCurrentSet`).

This means even if the laptop is stolen, the cached key isn't available without your fingerprint, even to root.

### 4.3 Menu bar helper app (v1.3)

A small SwiftUI app in the menu bar that shows:

- Whether the vault is locked / unlocked
- Last call across all surfaces
- Quick-pick "Unlock with Touch ID"
- "Open Dashboard" → opens the extension dashboard in the user's browser

This is presence — Mac users want to see their tools in the menu bar. It's also the natural place to put the eventual "Provider keychain integration: import Anthropic key from Safari Keychain" flow if we ever build it.

### 4.4 Homebrew distribution

```sh
brew install moltypass/tap/moltypass
```

The single `moltypass` binary + the Native Messaging manifest installed in the right place for Chrome to discover it. One command from clean Mac to working setup. The Cask install can additionally drop the menu-bar helper into `/Applications`.

---

## 5. Architecture — how the surfaces share state

The browser extension and the CLI must read from the same vault, log to the same audit, and respect the same revocations. Two architecture options:

### 5.1 Native Messaging (the chosen path)

Chrome's `chrome.runtime.connectNative` API lets a browser extension talk to a native helper installed alongside it. This is exactly how 1Password and Bitwarden connect their browser extensions to their native apps.

```
┌────────────────┐        ┌──────────────────┐        ┌─────────────┐
│  Chrome        │  IPC   │  Moltypass       │  IPC   │  CLI        │
│  extension     │ <────> │  native helper   │ <────> │  binary     │
│                │        │  (daemon)        │        │             │
└────────────────┘        └────────┬─────────┘        └─────────────┘
                                   │
                          ┌────────▼─────────┐
                          │  Encrypted vault │
                          │  Audit IDB       │
                          │  (single source) │
                          └──────────────────┘
```

The daemon owns the vault. The extension and CLI are both clients. Both go through the same consent, audit, and revocation paths. Touch ID prompts are handled by the daemon. The vault file lives at `~/Library/Application Support/Moltypass/vault.bin` (macOS conventions).

**Pros:**
- Single source of truth for vault state.
- Touch ID handled in one place.
- Industry-proven pattern.
- Cross-OS portable (Native Messaging exists on all desktop browsers).

**Cons:**
- Requires installing the helper alongside the extension.
- More moving parts to test.

### 5.2 Shared file via storage namespace (rejected)

Have the extension write to a known path and the CLI read it. Rejected because:

- chrome.storage isn't accessible to external processes by design.
- File-based sync requires a poll loop and is racy.
- Touch ID integration would have to happen twice.
- No good audit fan-in.

Native Messaging is the right pattern.

---

## 6. Roadmap

This is concrete enough to drop into `RELEASES.md`.

| Release | What ships | Effort |
|---|---|---|
| **v1.0** | Browser extension only (already specced in `PRD.md`) | — |
| **v1.1** | macOS CLI binary (`moltypass exec`, `get`, `env`) + Native Messaging helper. Touch ID unlock. Homebrew distribution. Extension reads/writes the daemon's vault instead of `chrome.storage.local`. | ~3 weeks |
| **v1.2** | Linux CLI + helper port. Same UX, no Touch ID (uses `polkit`/`pam` where available, falls back to password). | ~1 week (port) |
| **v1.3** | macOS menu-bar helper app (SwiftUI). Adds presence, last-call view, "Unlock with Touch ID" affordance. Provider DOM watchdog notifications ("Anthropic console changed — capture may need updating"). | ~2 weeks |
| **v1.4** | Windows CLI + helper port. Windows Hello unlock. | ~1 week |
| **v1.5** | Tool-awareness library: built-in knowledge of `hermes`, `continue`, `cursor`, `claude`, `aider`, `aichat`, `mods`, `llm`, `goose`, etc. — what env var each wants, what providers each typically uses. User PRs add tools. | ~2 weeks |
| **v2.0** | (Existing v2.0 scope: hosted control plane, admin dashboard, MDM, leak detection.) The CLI inherits all of it — admin push of policies, anomaly findings shared across surfaces. | per existing roadmap |

The order matters: ship the CLI on macOS first because that's where the primary ICP lives and where Touch ID gives us the strongest "this feels native" moment. Linux is a fast port. Windows after we've banked feedback from Mac + Linux.

---

## 7. Is this separate or tangential to the extension?

**Surface-separate, vault-shared.** They look like two products to the user (the Chrome extension and the CLI) but they are one product underneath:

- One vault file.
- One audit log.
- One consent model.
- One rotation operation that updates the browser grants AND rewrites every managed `.env` file in lockstep.
- One revocation that kills the browser-side flow AND aborts any in-flight `moltypass exec` subprocess.
- One Signal B baseline that watches volume across both surfaces.

The user's mental model: "Moltypass is where my AI keys live, whether I'm in the browser or the terminal." We do not want them thinking "the extension" vs "the CLI" — they're two windows onto the same vault.

---

## 8. Open decisions for this workstream

| # | Question |
|---|---|
| CLI-OD-1 | Does the daemon launch on login (`launchd` LaunchAgent) or on first invocation of either the CLI or the extension? First-invocation is more discreet; login-launch makes Touch ID instant. |
| CLI-OD-2 | Idle-unlock window default. 5 minutes matches the extension. Should it be longer on the terminal surface where the user is actively working? |
| CLI-OD-3 | If `moltypass exec npm run dev` infers Anthropic + OpenAI both, do we prompt once for each, or batch the consent? |
| CLI-OD-4 | For `moltypass env --tool hermes`, do we WRITE the file or just emit it on stdout for the user to redirect? Writing is friendlier; emitting is more honest about the on-disk consequences. |
| CLI-OD-5 | Subprocess that double-forks (daemonizes) escapes our env injection by design. Do we accept this limitation or document it as a known limitation in `--help`? |
| CLI-OD-6 | The CLI's audit events use the same kinds (`proxy.ok`, `proxy.error`) as the browser, but with `source:'cli'`. Does the dashboard surface them in the same table, or filter them out by default? |

These are the right size for a follow-up scoping doc, not blockers on whether to build it.

---

## 9. The headline

**Yes, we can help users configure their `.env`** — and the best way to do it is to give them a CLI that means they almost never have to. The browser extension and the CLI share one vault, one consent model, one audit log. macOS is the right first OS because Touch ID + Keychain + Homebrew let us deliver something that feels Mac-native on day one. The architecture is Chrome Native Messaging — the same pattern 1Password and Bitwarden use to bridge their extensions to their native apps.

Tangential in *surface*, integrated in *substance*.
