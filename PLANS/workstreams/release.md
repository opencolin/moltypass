# Workstream: release

## Status: TODO

## Goal
Build, CI, Chrome Web Store. Verified Vite + @crxjs HMR for all four entry points (popup, content, inpage, audit). Reproducible production build → loadable .zip. GitHub Actions pipeline. Version lockstep between manifest.json + package.json. Conventional-commits release notes. Chrome Web Store submission assets. Vercel Rolling Releases. Policy-gated error reporting (off by default, fails closed).

## Worktree
`/Users/colin/moltypass-release/` on branch `ws/release`.

## First file
`/Users/colin/moltypass/vite.config.ts`

## Files to create
- `.github/workflows/ci.yml` — pnpm install → typecheck → ext build → web build → upload artifact → Vercel preview
- `.github/workflows/release.yml` — on tag: build + zip + release notes + GitHub Release
- `scripts/release.ts` — bump semver, sync manifest.json + package.json + web/package.json, validate match, create tag
- `scripts/sync-version.ts` — CI guard asserting versions match
- `scripts/zip-extension.ts` — deterministic .zip from dist/
- `scripts/release-notes.ts` — conventional-commits parser → grouped markdown
- `src/shared/error-reporting.ts` — gated wrapper, no-op until policy.errorReportingEnabled
- `web/app/privacy/page.tsx` — privacy policy: metadata + salted fingerprints only, never raw keys or bodies
- `store/listing.md` — Chrome Web Store listing copy
- `store/permission-justifications.md` — per-permission justifications for CWS reviewer
- `CHANGELOG.md`
- `web/vercel.json` — Rolling Releases config

## Files to modify
- `package.json` — scripts (build, zip, typecheck, release, sync-version, release-notes); devDeps (tsx, archiver, conventional parser)
- `vite.config.ts` — confirm all four entry points configured; deterministic output
- `manifest.json` — version field as single source bumped by release script
- `src/background/index.ts` — wrap top-level try/catch with error-reporting (gated)
- `web/lib/db.ts` — policies.errorReportingEnabled column, default false
- `web/app/api/policy/route.ts` — include errorReportingEnabled in payload

## Dependencies
- enterprise-sw (collector + policy must work end-to-end before release)
- dashboard (privacy policy + admin docs visible)

## Complexity / days
M / 6

## Top risks
1. @crxjs HMR for MV3 content/inpage is historically flaky — risk of dev-server time sink.
2. Chrome Web Store reviewers reject broad host_permissions and remote-code concerns; justifications must precisely match single purpose.
3. Version-sync brittleness — release script must be sole writer.
4. Vercel Rolling Releases plan/availability — may not be vercel.json-configurable.
5. Policy-gated error reporting must fail closed (OFF default) when /api/policy unreachable.
6. SW death during build's runtime smoke could produce false CI failures.

## Open questions
- Error-reporting backend (Sentry vs self-hosted ingest extension)?
- CWS dev account: personal vs org?
- CI auto-submits to CWS API on tag, or stop at .zip artifact?
- Pnpm lockfile present? Reconcile with any npm/yarn lockfile?
- Vercel Rolling Releases canary % + bake time?

## Exit criteria
- `pnpm dev` boots extension dev server with HMR working on all four entries.
- `pnpm build` produces loadable .zip; Chrome accepts it.
- CI passes on a clean PR; preview URL deploys for web.
- `pnpm release minor` bumps versions in lockstep, writes changelog, creates tag.
- /privacy live on production domain.
- v1.0.0 submitted to Chrome Web Store.
