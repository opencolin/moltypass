# Workstream: detector

## Status: TODO

## Goal
URL-matched content scripts on provider key-creation pages. MutationObserver + shape-regex scanning of role=dialog/aria-modal subtrees. Shadow-DOM banner offers one-click save without clipboard. Custom-detector registration for additional providers at runtime.

## Worktree
`/Users/colin/moltypass-detector/` on branch `ws/detector`.

## First file
`/Users/colin/moltypass/src/content/key-scan.ts`

## Files to create
- `src/content/key-scan.ts` — pure key-extraction helpers (walk text nodes, return first shape-matching candidate); unit-testable
- `src/content/detector.ts` — main content script: MutationObserver watching dialog subtrees, debounces, dedupes, triggers banner
- `src/content/detector-banner.ts` — Shadow-DOM banner UI attached to document.body
- `src/content/detector-banner.css` — scoped styles inside shadow root
- `src/background/capture.ts` — background "capture" channel handler: re-validate shape, open confirm popup, call vault.addKey, audit kind:'capture'
- `src/background/custom-detectors.ts` — runtime detector registry persisted in chrome.storage.local; uses chrome.scripting.registerContentScripts
- `src/content/detector.test.ts` — unit tests for key-scan across all three providers

## Files to modify
- `manifest.json` — content_scripts for console.anthropic.com/settings/keys*, platform.openai.com/api-keys*, aistudio.google.com/apikey*; add 'scripting' permission
- `vite.config.ts` — register new content script entries with @crxjs
- `src/shared/providers.ts` — verify keyShape + add host/path match patterns + helper to resolve ProviderConfig from hostname
- `src/shared/types.ts` — CaptureRequest/CaptureResult/CustomDetectorSpec types
- `src/background/index.ts` — wire 'capture' channel; register custom-detector register/unregister; rehydrate on SW startup
- `src/popup/popup.tsx` — reuse confirm/consent popup for capture confirmation; entry point for managing custom detectors

## Dependencies
- audit (capture emits audit kind:'capture')

## Complexity / days
L / 8

## Top risks
1. Provider DOMs change silently — selectors and key shapes can break with no error.
2. Reading el.textContent of modal pulls plaintext into content-script context — minimize retention, never log.
3. chrome.scripting.registerContentScripts for user-defined detectors is a code-injection surface.
4. Dialog may unmount before user clicks Save — snapshot candidate at detect time.
5. False positives on docs/example keys could trigger spurious banners.
6. SW death between banner action and vault.addKey — capture flow state must be storage-backed.

## Open questions
- Hardcode keyShape regexes or fetch from policy endpoint to update without release?
- Provider-specific container selector fallback when role=dialog absent?
- Trust gate for custom detector specs (limit to host_permissions already granted)?
- Capture confirm = same "louder consent" as reveal?
- Does capture auto-create an OriginPermission, or stay separate?

## Exit criteria
- Banner appears within 500ms of a modal showing a key on all three provider pages.
- Click "Save" stores the key (encrypted) and emits audit kind:'capture'.
- Plaintext never enters the page outside of where it already was (provider DOM only).
- Custom detector registered at runtime survives SW restart.
