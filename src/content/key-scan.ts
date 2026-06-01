// Pure, framework-free key-shape scanner. The detector content script
// uses this to find candidate API keys inside provider key-creation
// modals; the picker overlay uses it to validate clicked elements.
//
// This module DOES briefly hold key plaintext in its scope (as the
// matched substring). Callers must:
//   - never persist it,
//   - never log it,
//   - hand it to the background "capture" channel immediately,
//   - and let it fall out of scope.
//
// The CI grep guard (test-infra) blocks key-shaped strings anywhere
// outside tests/fixtures/synthetic-keys.ts, so any persistence regression
// is caught at PR time.

export interface KeyMatch {
  /** The matched substring — the candidate plaintext key. */
  value: string;
  /** The DOM element whose textContent contained the match. */
  element: Element;
}

/**
 * Walk `root` (depth-first) looking for the first text node whose value
 * matches `shape`. Returns the nearest containing Element + the matched
 * substring, or null if nothing matches.
 *
 * Search order is document order; the first match short-circuits the
 * walk. Hidden subtrees (display:none, visibility:hidden, hidden attr)
 * are skipped so we don't false-positive on tutorial/docs panels that
 * happen to be off-screen.
 */
export function findKeyInSubtree(root: Element, shape: RegExp): KeyMatch | null {
  // Provider keyShapes are anchored (/^...$/) for full-string VALIDATION.
  // For substring SCANNING inside text nodes we strip the anchors so
  // "API key: sk-ant-…" finds the key in the middle of a paragraph.
  // The matched substring is still re-validated by the background
  // capture handler against the original anchored shape before storage.
  const scanShape = unanchor(shape);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE && isHidden(node as Element)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_SKIP;
    },
  });

  let current = walker.nextNode();
  while (current) {
    const text = current.textContent ?? '';
    const m = text.match(scanShape);
    if (m && m[0]) {
      // Walk back to the nearest Element ancestor of the text node.
      let host: Node | null = current.parentNode;
      while (host && host.nodeType !== Node.ELEMENT_NODE) host = host.parentNode;
      if (host) return { value: m[0], element: host as Element };
    }
    current = walker.nextNode();
  }
  return null;
}

function unanchor(re: RegExp): RegExp {
  let src = re.source;
  if (src.startsWith('^')) src = src.slice(1);
  if (src.endsWith('$')) src = src.slice(0, -1);
  return new RegExp(src, re.flags);
}

/**
 * Is this element inside a dialog/modal container? Most provider key-
 * creation pages display the one-time key in a `role="dialog"` or
 * `aria-modal="true"` element. We use this as a heuristic gate before
 * triggering the save banner, to avoid firing on tutorial panels or
 * documentation that happens to include example keys.
 */
export function isInsideDialog(el: Element): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (cur.getAttribute('role') === 'dialog') return true;
    if (cur.getAttribute('aria-modal') === 'true') return true;
    if (cur.tagName === 'DIALOG') return true;
    cur = cur.parentElement;
  }
  return false;
}

function isHidden(el: Element): boolean {
  if (el.hasAttribute('hidden')) return true;
  const html = el as HTMLElement;
  // Skip getComputedStyle in environments that don't implement it (older jsdom).
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(html);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  } else {
    if (html.style?.display === 'none' || html.style?.visibility === 'hidden') return true;
  }
  return false;
}
