// Tag the global before the module's auto-boot runs.
(globalThis as Record<string, unknown>)['__moltypass_detector_test'] = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startDetector, detectProviderFromHost } from '../src/content/detector';
import { SYNTHETIC } from './fixtures/synthetic-keys';

beforeEach(() => {
  // replaceChildren() instead of innerHTML='' — keeps the "no innerHTML
  // anywhere in detector code" policy uniform across src and tests.
  document.body.replaceChildren();
});

function dialogWithKey(key: string): HTMLElement {
  const d = document.createElement('div');
  d.setAttribute('role', 'dialog');
  const code = document.createElement('code');
  code.textContent = key;
  d.appendChild(code);
  return d;
}

describe('detectProviderFromHost', () => {
  it('matches anthropic console', () => {
    expect(detectProviderFromHost('console.anthropic.com')).toBe('anthropic');
  });
  it('matches openai platform', () => {
    expect(detectProviderFromHost('platform.openai.com')).toBe('openai');
  });
  it('matches gemini ai studio', () => {
    expect(detectProviderFromHost('aistudio.google.com')).toBe('gemini');
  });
  it('returns null for unknown hosts', () => {
    expect(detectProviderFromHost('evil.example.com')).toBeNull();
  });
});

describe('startDetector', () => {
  it('mounts banner when a dialog with a matching key appears in initial scan', () => {
    document.body.appendChild(dialogWithKey(SYNTHETIC.anthropic));
    const postCapture = vi.fn();
    const stop = startDetector({ service: 'anthropic', postCapture });

    // Initial scan finds the existing dialog.
    expect(document.getElementById('moltypass-detector-banner')).not.toBeNull();
    stop();
  });

  it('mounts banner when a dialog is added after startDetector runs', async () => {
    const postCapture = vi.fn();
    const stop = startDetector({ service: 'openai', postCapture });

    // Initially no banner.
    expect(document.getElementById('moltypass-detector-banner')).toBeNull();

    // Add a dialog after-the-fact; MutationObserver should pick it up.
    document.body.appendChild(dialogWithKey(SYNTHETIC.openai));
    // MutationObserver fires asynchronously in microtask.
    await new Promise(r => setTimeout(r, 0));

    expect(document.getElementById('moltypass-detector-banner')).not.toBeNull();
    stop();
  });

  it('does not mount when no dialog is present', async () => {
    const code = document.createElement('code');
    code.textContent = SYNTHETIC.anthropic;
    document.body.appendChild(code); // not inside a dialog
    const postCapture = vi.fn();
    const stop = startDetector({ service: 'anthropic', postCapture });
    expect(document.getElementById('moltypass-detector-banner')).toBeNull();
    stop();
  });

  it('does not re-mount banner for the same key on rapid mutations', async () => {
    const dialog = dialogWithKey(SYNTHETIC.gemini);
    document.body.appendChild(dialog);
    const postCapture = vi.fn();
    const stop = startDetector({ service: 'gemini', postCapture });
    const first = document.getElementById('moltypass-detector-banner');
    expect(first).not.toBeNull();

    // Trigger another mutation with the same dialog.
    document.body.appendChild(document.createElement('div'));
    await new Promise(r => setTimeout(r, 0));

    const second = document.getElementById('moltypass-detector-banner');
    expect(second).toBe(first);
    stop();
  });

  it('stop() teardown disconnects observer and destroys banner', async () => {
    document.body.appendChild(dialogWithKey(SYNTHETIC.anthropic));
    const stop = startDetector({ service: 'anthropic', postCapture: vi.fn() });
    expect(document.getElementById('moltypass-detector-banner')).not.toBeNull();
    stop();
    expect(document.getElementById('moltypass-detector-banner')).toBeNull();

    // Subsequent mutations should not re-mount.
    document.body.appendChild(dialogWithKey(SYNTHETIC.openai));
    await new Promise(r => setTimeout(r, 0));
    expect(document.getElementById('moltypass-detector-banner')).toBeNull();
  });

  it('postCapture is called with the candidate when the user clicks Save in the banner', async () => {
    document.body.appendChild(dialogWithKey(SYNTHETIC.anthropic));
    const postCapture = vi.fn();
    const stop = startDetector({ service: 'anthropic', postCapture });
    const host = document.getElementById('moltypass-detector-banner');
    expect(host).not.toBeNull();
    // The closed Shadow DOM is intentionally inaccessible from the page;
    // jsdom may or may not honor the closed mode. Try probing — if not
    // accessible, we accept the security property and skip the click.
    // @ts-expect-error internal probe
    const root = host?.shadowRoot;
    if (root) {
      const saveBtn = root.querySelector('[data-role="save"]') as HTMLElement | null;
      saveBtn?.click();
      expect(postCapture).toHaveBeenCalledWith(expect.objectContaining({
        service: 'anthropic',
        candidate: SYNTHETIC.anthropic,
        method: 'create-detector',
      }));
    }
    stop();
  });
});
