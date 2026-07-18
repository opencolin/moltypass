# Moltypass — Publishing & credentials matrix

What gets published where, who needs an account, and how the credential is stored. The short version: **every publishing credential lives as a GitHub Actions repository secret, not in this conversation, not on a developer laptop, and (once v1.1 ships) eventually managed by Moltypass itself.**

---

## What we publish

| Surface | Channel | First needed | Lives in |
|---|---|---|---|
| Chrome extension | Chrome Web Store | **v1.0** | `chrome.google.com/webstore` |
| Landing + admin app | Vercel | done | `vercel.com/dablclub/web` (aliased to `moltypass.app`) |
| GitHub release binaries (`.zip` of extension + future CLI binaries) | GitHub Releases | **v1.0** | this repo |
| `moltypass` CLI | Homebrew tap | **v1.1** | new repo `opencolin/homebrew-tap` |
| `moltypass` CLI | Direct binary download | **v1.1** | GitHub Releases assets |
| `@moltypass/sdk` (TypeScript helpers for `window.moltypass`) | npm | v1.1 (optional) | `npmjs.com/package/@moltypass/sdk` |
| `moltypass` Python SDK (parallel to the JS SDK) | PyPI | **v1.2+** if we ship it | `pypi.org/project/moltypass` |
| `moltypass` Rust CLI (if we go Rust) | crates.io | TBD | `crates.io/crates/moltypass` |

---

## What we need from you, and when

### Right now (nothing)

For everything currently shipped — landing, repo, README, Vercel deploy — **no new tokens needed**. All set up.

### Before v1.0 ships (Chrome Web Store)

You'll need a **Chrome Web Store publisher account** (one-time $5 fee). The CWS submission flow gives you three values:

- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`

These let the release workflow upload + publish a new version automatically when you push a `v*.*.*` tag. **Put them in `Settings → Secrets and variables → Actions` on `opencolin/moltypass`**, not in chat.

### Before v1.1 ships (Terminal)

If we choose to publish the SDK to npm:
- An **npm automation token** scoped to the `@moltypass` org (`npmjs.com/settings/tokens` → "Granular Access Token" → publish-only on `@moltypass/*`).
- Goes in as `NPM_TOKEN`.

For Homebrew:
- A new public repo at `github.com/opencolin/homebrew-tap` (you create it; no token needed — it's yours).
- A **fine-grained GitHub PAT** with `contents: write` on `opencolin/homebrew-tap` only, so the moltypass release workflow can push a new Formula file when a tag goes live.
- Goes in as `HOMEBREW_TAP_TOKEN`.

### Later (only if we ship Python / Rust)

- **PyPI API token** scoped to project `moltypass` only. `PYPI_TOKEN`.
- **crates.io token** if we add a Rust binary. `CARGO_REGISTRY_TOKEN`.

---

## How they're stored

**Repository secrets, full stop.** They go into:

```
github.com/opencolin/moltypass → Settings → Secrets and variables → Actions
```

The release workflow reads them at publish time:

```yaml
- name: Publish to npm
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
  run: npm publish --access public
```

Never echoed. Never logged. Never written to a `.env`. (Yes, the irony — the project that exists to kill `.env` doesn't use `.env` to publish itself.)

### What I should NEVER see

- Raw token values, in this conversation or any future one.
- Screenshots of a secret in chat.
- A paste like "here's the npm token: …"

If you have to share a token with another agent or developer, share it through a real secret store (the Vercel / GitHub UI for the project; 1Password if a human teammate needs it short-term) — never through chat.

### The dogfood future

When `moltypass exec` ships (v1.1), the release workflow stays on GitHub Actions secrets (that's the right mechanism for CI), but **your local publishing workflow uses Moltypass itself**:

```sh
moltypass exec gh release create v1.1.0 ...   # auth from the vault
moltypass exec npm publish                    # auth from the vault
moltypass exec twine upload dist/*            # auth from the vault
```

You stop having `NPM_TOKEN=…` exported in your shell. You stop having `~/.pypirc` on disk. Token rotation becomes one `moltypass rotate` instead of editing four dotfiles.

---

## Decision: what to provision next

Best order of operations, given where we are:

1. **Chrome Web Store publisher account** ($5, ~30 minutes). This is the only thing that gates a real v1.0 launch on the store.
2. **GitHub Actions repository secrets**: only `CHROME_*` for now. Skip npm / PyPI / Homebrew until you decide whether the SDK ships in v1.1 or v1.2.
3. **Homebrew tap repo creation** (`opencolin/homebrew-tap`) — this is a 30-second step you can do any time.
4. Defer **PyPI** and **crates.io** until we have actual Python / Rust code to publish. There's no real benefit to reserving the names early.

---

## What I do NOT need access to

- Vercel API token (the project is already linked; future deploys auto-trigger from GitHub pushes once we connect the GitHub integration in Vercel).
- GitHub PAT (the `gh` CLI on your machine is authenticated; that's enough for me to push from this session).
- Domain registrar credentials (the DNS for `moltypass.app` is managed by Vercel; no further changes needed).

In short: the only credential expense for v1.0 is the **$5 Chrome Web Store fee + three CWS API values as GitHub Actions secrets.** Everything else can wait until we've decided which SDKs ship and when.
