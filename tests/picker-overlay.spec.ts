import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountPicker } from '../src/content/picker-overlay';

beforeEach(() => {
  document.body.replaceChildren();
});

describe('mountPicker', () => {
  it('attaches a host element to document.body', () => {
    const handle = mountPicker({ onPick: () => {}, onCancel: () => {} });
    const host = document.getElementById('moltypass-picker-overlay');
    expect(host).not.toBeNull();
    expect(host?.parentElement).toBe(document.body);
    handle.destroy();
    expect(document.getElementById('moltypass-picker-overlay')).toBeNull();
  });

  it('replaces a prior overlay on second mount (single-instance)', () => {
    mountPicker({ onPick: () => {}, onCancel: () => {} });
    const first = document.getElementById('moltypass-picker-overlay');
    mountPicker({ onPick: () => {}, onCancel: () => {} });
    const second = document.getElementById('moltypass-picker-overlay');
    expect(second).not.toBe(first);
    expect(document.querySelectorAll('#moltypass-picker-overlay')).toHaveLength(1);
  });

  it('destroy() is idempotent', () => {
    const handle = mountPicker({ onPick: () => {}, onCancel: () => {} });
    handle.destroy();
    handle.destroy();
    expect(document.getElementById('moltypass-picker-overlay')).toBeNull();
  });

  it('Escape key fires onCancel and destroys', () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    mountPicker({ onPick, onCancel });
    expect(document.getElementById('moltypass-picker-overlay')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
    expect(document.getElementById('moltypass-picker-overlay')).toBeNull();
  });

  it('does not respond to keys after destroy', () => {
    const onCancel = vi.fn();
    const handle = mountPicker({ onPick: () => {}, onCancel });
    handle.destroy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('non-Escape keys are ignored', () => {
    const onCancel = vi.fn();
    mountPicker({ onPick: () => {}, onCancel });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(document.getElementById('moltypass-picker-overlay')).not.toBeNull();
  });
});
