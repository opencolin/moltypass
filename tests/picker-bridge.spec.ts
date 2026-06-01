(globalThis as Record<string, unknown>)['__moltypass_picker_bridge_test'] = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  onPickerCommand,
  onContextMenuClick,
  installContextMenu,
  CONTEXT_MENU_ID,
  PICKER_COMMAND_NAME,
} from '../src/background/picker-bridge';
import { SYNTHETIC } from './fixtures/synthetic-keys';

function deps(overrides: Partial<{
  getActiveTabId(): Promise<number | undefined>;
  sendToTab(tabId: number, message: unknown): Promise<void>;
  postToCapture(c: any): Promise<void>;
}> = {}) {
  return {
    getActiveTabId: vi.fn(async () => 42),
    sendToTab: vi.fn(async () => {}),
    postToCapture: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => { /* fake-chrome reset is in tests/setup */ });

describe('onPickerCommand', () => {
  it('sends picker.start to the active tab when the shortcut fires', async () => {
    const d = deps();
    await onPickerCommand(PICKER_COMMAND_NAME, d);
    expect(d.getActiveTabId).toHaveBeenCalled();
    expect(d.sendToTab).toHaveBeenCalledWith(42, {
      channel: 'picker',
      payload: { kind: 'picker.start' },
    });
  });

  it('ignores unrelated commands', async () => {
    const d = deps();
    await onPickerCommand('some-other-command', d);
    expect(d.sendToTab).not.toHaveBeenCalled();
  });

  it('is a no-op when no tab is active', async () => {
    const d = deps({ getActiveTabId: async () => undefined });
    await onPickerCommand(PICKER_COMMAND_NAME, d);
    expect(d.sendToTab).not.toHaveBeenCalled();
  });
});

describe('onContextMenuClick', () => {
  it('posts CaptureCandidate with source=right-click on our menu item', async () => {
    const d = deps();
    await onContextMenuClick(
      {
        menuItemId: CONTEXT_MENU_ID,
        selectionText: `   ${SYNTHETIC.anthropic}   `,
        pageUrl: 'https://example.test/page',
      },
      d,
    );
    expect(d.postToCapture).toHaveBeenCalledWith({
      source: 'right-click',
      text: SYNTHETIC.anthropic,
      originUrl: 'https://example.test/page',
    });
  });

  it('ignores clicks on other context-menu items', async () => {
    const d = deps();
    await onContextMenuClick(
      { menuItemId: 'someone-elses-menu', selectionText: SYNTHETIC.openai },
      d,
    );
    expect(d.postToCapture).not.toHaveBeenCalled();
  });

  it('is a silent no-op when selectionText is missing', async () => {
    const d = deps();
    await onContextMenuClick({ menuItemId: CONTEXT_MENU_ID }, d);
    expect(d.postToCapture).not.toHaveBeenCalled();
  });

  it('is a silent no-op when selectionText trims to empty', async () => {
    const d = deps();
    await onContextMenuClick({ menuItemId: CONTEXT_MENU_ID, selectionText: '   ' }, d);
    expect(d.postToCapture).not.toHaveBeenCalled();
  });
});

describe('installContextMenu', () => {
  it('creates the menu entry with selection context', () => {
    const installer = { create: vi.fn() };
    installContextMenu(installer);
    expect(installer.create).toHaveBeenCalledWith({
      id: CONTEXT_MENU_ID,
      title: 'Save selection to Moltypass…',
      contexts: ['selection'],
    });
  });
});
