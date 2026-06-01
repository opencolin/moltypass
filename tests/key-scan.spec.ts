import { describe, it, expect } from 'vitest';
import { findKeyInSubtree, isInsideDialog } from '../src/content/key-scan';
import { SYNTHETIC } from './fixtures/synthetic-keys';
import { PROVIDERS } from '../src/shared/providers';

function tree(html: string): Element {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return doc.body.firstChild as Element;
}

describe('findKeyInSubtree', () => {
  it('finds an Anthropic-shaped key inside a dialog', () => {
    const root = tree(`<div role="dialog"><code id="k">${SYNTHETIC.anthropic}</code></div>`);
    const match = findKeyInSubtree(root, PROVIDERS.anthropic.keyShape!);
    expect(match).not.toBeNull();
    expect(match!.value).toBe(SYNTHETIC.anthropic);
    expect(match!.element.tagName).toBe('CODE');
  });

  it('finds an OpenAI-shaped key in a deeply nested element', () => {
    const root = tree(`<section><div><span>your key: <b>${SYNTHETIC.openai}</b></span></div></section>`);
    const match = findKeyInSubtree(root, PROVIDERS.openai.keyShape!);
    expect(match).not.toBeNull();
    expect(match!.value).toBe(SYNTHETIC.openai);
  });

  it('finds a Gemini-shaped key', () => {
    const root = tree(`<p>API key: ${SYNTHETIC.gemini}</p>`);
    const match = findKeyInSubtree(root, PROVIDERS.gemini.keyShape!);
    expect(match).not.toBeNull();
    expect(match!.value).toBe(SYNTHETIC.gemini);
  });

  it('returns null when no key shape matches', () => {
    const root = tree(`<div>just regular content here</div>`);
    expect(findKeyInSubtree(root, PROVIDERS.anthropic.keyShape!)).toBeNull();
  });

  it('skips hidden subtrees (display:none style attr)', () => {
    const root = tree(`<div><div style="display: none"><code>${SYNTHETIC.anthropic}</code></div></div>`);
    expect(findKeyInSubtree(root, PROVIDERS.anthropic.keyShape!)).toBeNull();
  });

  it('skips elements with hidden attribute', () => {
    const root = tree(`<div><span hidden>${SYNTHETIC.anthropic}</span></div>`);
    expect(findKeyInSubtree(root, PROVIDERS.anthropic.keyShape!)).toBeNull();
  });

  it('returns the FIRST match in document order', () => {
    const root = tree(`<div><code>${SYNTHETIC.anthropic}</code><code>sk-ant-${'B'.repeat(20)}</code></div>`);
    const match = findKeyInSubtree(root, PROVIDERS.anthropic.keyShape!);
    expect(match!.value).toBe(SYNTHETIC.anthropic);
  });
});

describe('isInsideDialog', () => {
  it('returns true when an ancestor has role="dialog"', () => {
    const root = tree(`<div role="dialog"><div><code id="k">x</code></div></div>`);
    expect(isInsideDialog(root.querySelector('#k')!)).toBe(true);
  });

  it('returns true when an ancestor has aria-modal="true"', () => {
    const root = tree(`<div aria-modal="true"><span id="k">x</span></div>`);
    expect(isInsideDialog(root.querySelector('#k')!)).toBe(true);
  });

  it('returns true when the element itself is a DIALOG', () => {
    const root = tree(`<dialog id="k"><span>x</span></dialog>`);
    expect(isInsideDialog(root.querySelector('#k')!)).toBe(true);
  });

  it('returns false when no dialog ancestor exists', () => {
    const root = tree(`<div><p id="k">x</p></div>`);
    expect(isInsideDialog(root.querySelector('#k')!)).toBe(false);
  });
});
