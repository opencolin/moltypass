// Tag global before module load so the production listener is skipped.
(globalThis as Record<string, unknown>)['__moltypass_picker_test'] = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePickerMessage, __testing } from '../src/content/picker';
import { SYNTHETIC } from './fixtures/synthetic-keys';

beforeEach(() => {
  document.body.replaceChildren();
  __testing.reset();
});

function deps() {
  return {
    postCapture: vi.fn(),
    postCancel: vi.fn(),
  };
}

describe('handlePickerMessage', () => {
  it('mounts overlay on picker.start', () => {
    const d = deps();
    handlePickerMessage({ kind: 'picker.start' }, d);
    expect(__testing.hasActiveOverlay()).toBe(true);
    expect(document.getElementById('moltypass-picker-overlay')).not.toBeNull();
  });

  it('ignores a second picker.start while overlay is already active (single-instance)', () => {
    const d = deps();
    handlePickerMessage({ kind: 'picker.start' }, d);
    const first = document.getElementById('moltypass-picker-overlay');
    handlePickerMessage({ kind: 'picker.start' }, d);
    const second = document.getElementById('moltypass-picker-overlay');
    expect(second).toBe(first); // same overlay, not replaced
  });

  it('picker.cancel destroys the active overlay', () => {
    const d = deps();
    handlePickerMessage({ kind: 'picker.start' }, d);
    expect(__testing.hasActiveOverlay()).toBe(true);
    handlePickerMessage({ kind: 'picker.cancel' }, d);
    expect(__testing.hasActiveOverlay()).toBe(false);
    expect(document.getElementById('moltypass-picker-overlay')).toBeNull();
  });

  it('picker.cancel is a no-op when no overlay is active', () => {
    const d = deps();
    expect(() => handlePickerMessage({ kind: 'picker.cancel' }, d)).not.toThrow();
    expect(__testing.hasActiveOverlay()).toBe(false);
  });

  it('Escape on a live overlay calls postCancel and clears state', () => {
    const d = deps();
    handlePickerMessage({ kind: 'picker.start' }, d);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(d.postCancel).toHaveBeenCalledTimes(1);
    expect(d.postCapture).not.toHaveBeenCalled();
    expect(__testing.hasActiveOverlay()).toBe(false);
  });

  it('inbound picker.cancel from background tears down without posting anything', () => {
    // 'picker.cancel' is the message FROM background TO content script.
    // Unlike Escape (which fires the overlay's onCancel -> deps.postCancel),
    // an inbound cancel just tears down silently. Verify both invariants.
    const d = deps();
    handlePickerMessage({ kind: 'picker.start' }, d);
    expect(__testing.hasActiveOverlay()).toBe(true);
    handlePickerMessage({ kind: 'picker.cancel' }, d);
    expect(__testing.hasActiveOverlay()).toBe(false);
    expect(d.postCancel).not.toHaveBeenCalled();
    expect(d.postCapture).not.toHaveBeenCalled();
  });

  it('after Escape teardown, a follow-up picker.start mounts a fresh overlay', () => {
    const d = deps();
    handlePickerMessage({ kind: 'picker.start' }, d);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(d.postCancel).toHaveBeenCalledTimes(1);
    expect(__testing.hasActiveOverlay()).toBe(false);
    handlePickerMessage({ kind: 'picker.start' }, d);
    expect(__testing.hasActiveOverlay()).toBe(true);
  });
});
