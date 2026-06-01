// Content-script entry for the element picker. Loaded on every page
// via the existing universal content_scripts entry (src/content/index.ts
// dispatches by message kind).
//
// Flow:
//   1. Background dispatches { channel: 'picker', payload: { kind: 'picker.start' } }
//      when the user hits Cmd+Shift+M.
//   2. We lazy-mount the Shadow-DOM crosshair overlay.
//   3. On pick: send a CaptureMessage to the background "capture"
//      channel with source: 'picker' and the element's text.
//   4. On cancel (Escape) or pick: tear down the overlay.
//
// Single-instance: ignore picker.start if an overlay is already mounted.

import { mountPicker, type PickerHandle } from './picker-overlay';
import type { CaptureCandidate, PickerStartMessage, PickerCancelMessage } from '../shared/capture-types';

let active: PickerHandle | null = null;

export interface PickerEntryDeps {
  /** Post a CaptureCandidate to the background "capture" channel. */
  postCapture(candidate: CaptureCandidate): void;
  /** Tell the background that the user cancelled. */
  postCancel(): void;
}

/** Public entry — call from the content-script message handler. */
export function handlePickerMessage(
  msg: PickerStartMessage | PickerCancelMessage,
  deps: PickerEntryDeps,
): void {
  if (msg.kind === 'picker.start') {
    if (active) return; // single-instance
    active = mountPicker({
      onPick(text, _element) {
        active = null;
        // Strip surrounding whitespace; background re-validates against
        // the provider keyShape before any vault interaction.
        const trimmed = text.trim();
        if (!trimmed) {
          deps.postCancel();
          return;
        }
        deps.postCapture({
          source: 'picker',
          text: trimmed,
          originUrl: location.href,
        });
      },
      onCancel() {
        active = null;
        deps.postCancel();
      },
    });
    return;
  }
  if (msg.kind === 'picker.cancel') {
    active?.destroy();
    active = null;
    return;
  }
}

/** Test helper — read or clear the in-flight overlay state. */
export const __testing = {
  hasActiveOverlay: () => active !== null,
  reset: () => { active?.destroy(); active = null; },
};

// ----- production wiring -----

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage && !('__moltypass_picker_test' in globalThis)) {
  chrome.runtime.onMessage.addListener((message: unknown) => {
    const msg = message as { channel?: string; payload?: PickerStartMessage | PickerCancelMessage };
    if (msg.channel !== 'picker' || !msg.payload) return;
    handlePickerMessage(msg.payload, {
      postCapture(candidate) {
        void chrome.runtime.sendMessage({ channel: 'capture', payload: candidate });
      },
      postCancel() {
        void chrome.runtime.sendMessage({ channel: 'capture', payload: { kind: 'picker.cancel' } });
      },
    });
  });
}
