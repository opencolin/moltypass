# Workstream: picker

## Status: TODO

## Goal
Two clipboard-bypassing capture paths. Path B = Cmd+Shift+M shadow-DOM crosshair element picker. Path C = right-click context-menu on selection (info.selectionText is privileged). Both converge on shared `src/background/capture.ts`.

## Worktree
`/Users/colin/moltypass-picker/` on branch `ws/picker`.

## First file
`/Users/colin/moltypass/src/shared/capture-types.ts`

## Files to create
- `src/shared/capture-types.ts` — CaptureCandidate (source: 'picker'|'selection'), CaptureValidationResult, message contracts
- `src/content/picker-overlay.ts` — full-viewport Shadow-DOM crosshair overlay, hover-highlight tracking mousemove, Escape cancel, ARIA live region, click captures el.textContent
- `src/content/picker-overlay.css` — scoped styles for crosshair, highlight box, focus ring, hidden ARIA live region

## Files to modify
- `manifest.json` — `commands` section with `start-element-picker` (Cmd+Shift+M / Ctrl+Shift+M); `contextMenus` + `activeTab` + `scripting` permissions
- `src/background/index.ts` — chrome.commands.onCommand → broadcast 'picker.start' to active tab; chrome.contextMenus.create on install with contexts:['selection']; route capture.* messages
- `src/content/index.ts` — handle 'picker.start' → lazy mount picker-overlay; relay candidate to background; single-instance; cleanup on navigation
- `src/popup/popup.tsx` — confirm-capture view: masked candidate + detected provider, Confirm → existing add-key flow, Discard; settings affordance for shortcut remap (deep-link chrome://extensions/shortcuts)
- `src/background/consent.ts` — confirm-capture variant of popup-open
- `src/shared/types.ts` — CaptureSource enum + provider-shape regex helpers
- `src/background/capture.ts` — extend with Path C entry: receive info.selectionText from contextMenus.onClicked; shape-validate; open confirm

## Dependencies
- detector (shares `src/background/capture.ts`; picker and right-click are alternative entry points)

## Complexity / days
M / 5

## Top risks
1. Overlay event handlers conflict with host-page capture-phase listeners; teardown must be robust.
2. Cross-origin iframes can't be highlighted or read from top frame — Path B fails inside iframes.
3. Cmd+Shift+M may collide with site/OS shortcuts; Chrome silently drops binding.
4. info.selectionText / textContent of masked fields (dots/asterisks) — validation must reject masked values.
5. SW death between picker.start and candidate receipt — pendingCapture must be storage-backed.

## Open questions
- chrome.commands.update — limited platform support; in-extension remap or just deep-link to chrome://extensions/shortcuts?
- Trim/normalize captured text and extract regex match, or require exact match?
- Pick from inputs/textareas (value vs textContent)?
- Cross-shadow-root selection?
- Confirm consent.ts channel can carry 'confirm-capture' without colliding with proxy consent?

## Exit criteria
- Cmd+Shift+M (or remapped key) opens crosshair; hover highlights; click captures.
- Right-click on selection of a key triggers same confirm flow.
- Both paths route through `src/background/capture.ts`; no clipboard touched on either path.
- Picker overlay accessible: keyboard nav + Escape cancel + ARIA announcement.
