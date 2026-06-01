# Workstream: test-infra

## Status: TODO

**Added by PM Council T+1.** Peer to `audit` in W1 — not bolted onto `release`. Eng-quality PM's red line: every PR gated on `tsc --noEmit` + unit tests on new business logic. CI grep-blocks key-shaped strings in audit entries, console output, and test fixtures.

## Goal
Provide the test substrate every other workstream merges through:
- `fake-indexeddb` so `audit` and `enterprise-sw` (v2) can be tested headless.
- `@webext-pegasus`-style chrome.* mock or hand-rolled minimal mock for `chrome.storage`, `chrome.runtime`, `chrome.alarms`, `chrome.tabs`.
- Playwright MV3 rig for the content scripts (`detector`, `picker`) against fixture pages.
- CI grep guard rejecting key-shaped strings in `src/**` and `tests/**` outside of `tests/fixtures/synthetic-keys.ts`.
- `tsc --noEmit` gate on every PR.

## Worktree
`/Users/colin/moltypass-test-infra/` on branch `ws/test-infra`.

## First file
`/Users/colin/moltypass/vitest.config.ts`

## Files to create
- `vitest.config.ts` — Vitest config; jsdom env for non-IDB tests; node env for SW logic; fake-indexeddb in setup
- `tests/setup/fake-chrome.ts` — minimal in-memory `chrome.storage.local`, `chrome.alarms`, `chrome.runtime.sendMessage` mocks
- `tests/setup/fake-idb.ts` — wires `fake-indexeddb/auto` plus a per-test reset helper
- `tests/setup/index.ts` — re-export both, loaded via vitest setupFiles
- `tests/fixtures/synthetic-keys.ts` — the only file allowed to contain key-shaped strings (used by all tests)
- `tests/example.spec.ts` — smoke test verifying setup works end-to-end (one chrome.storage round-trip, one IDB round-trip)
- `playwright.config.ts` — Playwright config for MV3 extension loading
- `tests/e2e/extension-loads.spec.ts` — boots the built extension in a Chromium profile and asserts popup HTML renders
- `tests/e2e/fixtures/anthropic-key-modal.html` — synthetic provider modal page for detector tests
- `tests/e2e/fixtures/openai-key-modal.html` — same for OpenAI
- `tests/e2e/fixtures/gemini-key-modal.html` — same for Gemini
- `scripts/grep-no-keys.ts` — CI guard: greps `src/**` + `tests/**` for `sk-ant-`, `sk-`, `AIza` patterns; allowed only in `tests/fixtures/synthetic-keys.ts`
- `.github/workflows/test-gate.yml` — runs typecheck → vitest → grep-no-keys on PRs

## Files to modify
- `package.json` — add devDeps (vitest, jsdom, fake-indexeddb, @types/chrome, playwright, tsx); scripts (`test`, `test:e2e`, `test:gate`, `typecheck`)
- `tsconfig.json` — confirm `noEmit: true` for typecheck script; ensure `vitest` types resolved
- `.gitignore` — `coverage/`, `playwright-report/`, `test-results/`

## Dependencies
None — this is also foundation. Lands in parallel with `audit`.

## Complexity / days
S / 3

## Top risks
1. Playwright MV3 extension loading is finicky — needs `chromium.launchPersistentContext` with `--load-extension` + `--disable-extensions-except`.
2. fake-indexeddb global setup races with parallel test workers — use per-test reset, not module-scope.
3. The grep guard may false-positive on legitimate provider-domain strings — allow-list narrow patterns.
4. chrome.* mock surface drift — only mock what's used; don't try to be comprehensive.

## Open questions
- Vitest vs Jest? Recommend Vitest — already aligned with Vite, lower config burden.
- Coverage tool? Default to `vitest --coverage` with c8/v8.
- Where do Playwright artifacts go on CI? Default: artifact upload on failure.

## Exit criteria
- `pnpm test` runs all unit tests in <30s.
- `pnpm test:e2e` boots the extension in Chromium and runs at least one content-script test against a fixture page.
- `pnpm test:gate` typechecks + tests + greps; non-zero on any failure or any key-shaped string outside the fixtures file.
- GitHub Action runs on every PR; merge blocked on failure.
- A failing example test fails the gate locally and on CI.

## Merge gate (codified for all v1.0 workstreams)
> No workstream merges into `main` without:
> 1. `pnpm typecheck` clean
> 2. `pnpm test` green
> 3. `pnpm test:gate` (grep guard) green
> 4. At least one unit test per new module containing business logic
> 5. For content-script workstreams (`detector`, `picker`): at least one Playwright test against a fixture page
