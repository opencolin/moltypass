// Background wiring for the picker workstream's two privileged paths.
//
// Path B (Cmd+Shift+M):
//   chrome.commands.onCommand('start-element-picker') →
//     query active tab → chrome.tabs.sendMessage(picker.start) →
//     content script's handlePickerMessage mounts the overlay.
//
// Path C (right-click):
//   chrome.contextMenus.onClicked with contexts:['selection'] →
//     info.selectionText is delivered by Chrome's privileged channel
//     (NOT via the system clipboard) → forward to the capture handler
//     with source:'right-click'.
//
// Both paths converge on src/background/capture.ts (already in main).
//
// DI-shaped so the test can drive the wiring without coupling to the
// real chrome.* surface beyond what's mocked in tests/setup/fake-chrome.

import type { CaptureCandidate } from '../shared/capture-types';

export interface PickerBridgeDeps {
  /** Look up the active tab id so we know where to inject the overlay. */
  getActiveTabId(): Promise<number | undefined>;
  /** Send a message to a specific tab. */
  sendToTab(tabId: number, message: unknown): Promise<void>;
  /** Hand a candidate string to the background capture handler. */
  postToCapture(candidate: CaptureCandidate): Promise<void>;
}

export const CONTEXT_MENU_ID = 'moltypass-save-selection';
export const PICKER_COMMAND_NAME = 'start-element-picker';

/** Called when chrome.commands.onCommand fires. */
export async function onPickerCommand(command: string, deps: PickerBridgeDeps): Promise<void> {
  if (command !== PICKER_COMMAND_NAME) return;
  const tabId = await deps.getActiveTabId();
  if (tabId === undefined) return;
  await deps.sendToTab(tabId, { channel: 'picker', payload: { kind: 'picker.start' } });
}

/** Called when chrome.contextMenus.onClicked fires. */
export async function onContextMenuClick(
  info: { menuItemId: string | number; selectionText?: string; pageUrl?: string },
  deps: PickerBridgeDeps,
): Promise<void> {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  const text = (info.selectionText ?? '').trim();
  if (!text) return; // nothing selected — silent no-op
  await deps.postToCapture({
    source: 'right-click',
    text,
    originUrl: info.pageUrl,
  });
}

/** Install the context-menu entry on extension install/upgrade. */
export interface ContextMenuInstaller {
  create(opts: { id: string; title: string; contexts: chrome.contextMenus.ContextType[] }): void;
}
export function installContextMenu(installer: ContextMenuInstaller): void {
  installer.create({
    id: CONTEXT_MENU_ID,
    title: 'Save selection to Moltypass…',
    contexts: ['selection'],
  });
}

// ----- production wiring -----

if (typeof chrome !== 'undefined' && !('__moltypass_picker_bridge_test' in globalThis)) {
  const deps: PickerBridgeDeps = {
    async getActiveTabId() {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return tabs[0]?.id;
    },
    async sendToTab(tabId, message) {
      await chrome.tabs.sendMessage(tabId, message);
    },
    async postToCapture(candidate) {
      // capture.ts is in-process — call via runtime message router so
      // origin tracking goes through the existing message handler.
      await chrome.runtime.sendMessage({ channel: 'capture', payload: candidate });
    },
  };
  chrome.commands?.onCommand?.addListener(cmd => { void onPickerCommand(cmd, deps); });
  chrome.contextMenus?.onClicked?.addListener(info => { void onContextMenuClick(info, deps); });
  chrome.runtime?.onInstalled?.addListener(() => {
    if (chrome.contextMenus) {
      installContextMenu(chrome.contextMenus as unknown as ContextMenuInstaller);
    }
  });
}
