# Branding aliases — Moltypass ↔ Multipass

**Status:** Decision locked. Do not relitigate without a new naming discussion.
**Date:** 2026-07-17.

## Decision

**Canonical brand is Moltypass. `multipass` is an accepted alias in three specific places, not a second brand.**

Rationale, in short: "molty" is an unusual coinage that lowers recall for new users. "Multipass" is a familiar hook (*The Fifth Element*). Aliasing lets us keep the memorable, unique root brand while giving users a familiar handle to grab. Full dual-brand strategy was rejected — see [council-note](#why-not-a-full-dual-brand) below.

## Where the alias applies

| Surface | Alias? | Implementation |
|---|---|---|
| **URI scheme** | ✓ Yes | Both `moltypass://provider/label` and `multipass://provider/label` resolve identically. Canonical form in docs is `moltypass://`; `multipass://` is documented as "also works." Register both schemes in the Chrome extension manifest and in the native daemon's OS-level URL handler entries (macOS `LSHandlerContentType`, Linux `.desktop`, Windows registry). |
| **Domain** | ✓ Yes | `multipass.chat` and `moltypass.app` both point at the same Vercel deployment. Recommend serving the same site rather than 301-redirect so social embeds and cURL requests work the same from either. |
| **SDK / library imports** | ✓ Yes | `import { multipass } from '@moltypass/sdk'` is a re-export of `import { moltypass } from '@moltypass/sdk'`. Same object, two names. Trivial. |
| **CLI binary name** | ✗ **No** | Keep the binary as `moltypass` only. Canonical ships a `multipass` binary (Ubuntu Multipass — active VM-management CLI targeting the same developer audience). If we shipped `multipass` too, `which multipass` collides on any dev machine with Ubuntu Multipass installed. Support-load cost of that collision > branding benefit. |

## Docs treatment

Docs default to `moltypass://` and the CLI stays `moltypass`. On the first URI-scheme reference in every getting-started guide, include a small aside:

> *(Also written as `multipass://` — same thing.)*

Marketing copy on `multipass.chat` can lead with the familiar hook — *"Multipass — get past the AI credential mess"* — and reveal the canonical name as a moment of discovery, not a friction point.

## Why not a full dual-brand

Considered and rejected. Reasons:

1. **Ubuntu Multipass owns the name in dev-tools.** Canonical's Multipass ([multipass.run](https://multipass.run)) is well-established. Full brand-splitting creates search-result confusion and trademark risk.
2. **Two brands = doubled tax, forever.** Two sites, two GitHub orgs, two support inboxes. Wrong direction for a nascent category.
3. **Breaks the "one vault, many surfaces" thesis.** Renaming the enterprise tier says "these are two products," which is the opposite of what the product is.
4. **The upgrade path becomes a name change.** Free-user-becomes-team-user friction spikes.
5. **Split-brand-by-tier is a graveyard pattern.** OpenSolaris/Solaris, MySQL/MariaDB — either dead or a fork. Products that win keep the root brand across tiers (MongoDB Atlas, GitLab Enterprise, Terraform Cloud).

The alias-not-split approach captures the "familiar hook" benefit without the split-brand cost.

## Implementation todos

Small, all cheap:

- [ ] Add `multipass.chat` as a domain in the Vercel project (`web`).
- [ ] Update DNS on `multipass.chat` to Vercel's nameservers (or A/AAAA records).
- [ ] Confirm the certificate provisions cleanly for both hosts.
- [ ] Register `multipass://` URL scheme in the Chrome extension `manifest.json` alongside `moltypass://`.
- [ ] Register `multipass://` in the macOS native-helper Info.plist / Linux `.desktop` / Windows registry when the CLI daemon lands (v1.1).
- [ ] Add `multipass` re-export to `@moltypass/sdk` when it lands (v1.1).
- [ ] Update `PLANS/PRD.md` §2 with a one-line note pointing here.
- [ ] Add a footnote to `README.md` explaining the alias.

## What NOT to do

- Do NOT ship a `multipass` CLI binary.
- Do NOT create a second GitHub org named `multipass`.
- Do NOT split social accounts.
- Do NOT put "Moltypass" and "Multipass" in comparative billing anywhere; Moltypass is always primary.
