// Detector content script. Runs on provider key-creation pages,
// watches the DOM for newly-rendered dialogs containing key-shaped
// strings, and surfaces a Shadow DOM "Save to Moltypass" banner.
//
// Flow:
//   1. MutationObserver on document.body — observes subtree + childList.
//   2. On every batch of additions, find any role=dialog / aria-modal /
//      <dialog> element among the added nodes or their ancestors.
//   3. Inside that dialog, run findKeyInSubtree with the provider's
//      keyShape. If a match is found, mount the banner.
//   4. Banner's Save click sends { kind: 'capture', payload: ... } to
//      the background SW. The candidate plaintext lives only in the
//      detector's local closure until the message is posted, then is
//      no longer referenced.
//
// Single-instance: a debounce + already-mounted check prevents the
// banner from re-firing for the same modal across rapid mutations.

import { findKeyInSubtree, isInsideDialog } from './key-scan';
import { mountSaveBanner, type BannerHandle } from './detector-banner';
import { PROVIDERS, type ProviderId } from '../shared/providers';

interface DetectorContext {
  service: ProviderId;
  /** Send a capture message to the background SW. Injected for testing. */
  postCapture: (req: {
    service: ProviderId;
    candidate: string;
    sourceUrl: string;
    method: 'create-detector';
  }) => void;
}

export function startDetector(ctx: DetectorContext): () => void {
  const provider = PROVIDERS[ctx.service];
  if (!provider?.keyShape) return () => {};

  let banner: BannerHandle | null = null;
  let lastMatch = '';

  const scan = (root: Element) => {
    // Find dialog ancestors among the root or its descendants.
    const dialogs: Element[] = [];
    if (isInsideDialog(root)) dialogs.push(closestDialog(root) ?? root);
    root.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog').forEach(d => dialogs.push(d));
    if (dialogs.length === 0) return;

    for (const dialog of dialogs) {
      const match = findKeyInSubtree(dialog, provider.keyShape!);
      if (!match) continue;
      // Re-banner protection: same candidate within the same lifetime
      // doesn't re-prompt.
      if (match.value === lastMatch && banner) continue;
      lastMatch = match.value;
      banner?.destroy();
      banner = mountSaveBanner({
        masked: maskShort(match.value),
        providerName: provider.displayName,
        onSave: () => {
          ctx.postCapture({
            service: ctx.service,
            candidate: match.value,
            sourceUrl: location.href,
            method: 'create-detector',
          });
        },
        onDismiss: () => { banner = null; },
      });
      return; // one match per scan
    }
  };

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node as Element);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan in case the modal is already mounted at script-load time.
  scan(document.body);

  return () => {
    observer.disconnect();
    banner?.destroy();
    banner = null;
  };
}

/** Resolve a ProviderId from window.location.host. Returns null if unmatched. */
export function detectProviderFromHost(host: string): ProviderId | null {
  if (host === 'console.anthropic.com') return 'anthropic';
  if (host === 'platform.openai.com') return 'openai';
  if (host === 'aistudio.google.com') return 'gemini';
  return null;
}

function closestDialog(el: Element): Element | null {
  let cur: Element | null = el;
  while (cur) {
    if (
      cur.getAttribute('role') === 'dialog' ||
      cur.getAttribute('aria-modal') === 'true' ||
      cur.tagName === 'DIALOG'
    ) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function maskShort(s: string): string {
  if (s.length <= 14) return '*'.repeat(s.length);
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

// ----- production boot -----

if (typeof window !== 'undefined' && !('__moltypass_detector_test' in globalThis)) {
  const service = detectProviderFromHost(location.host);
  if (service) {
    startDetector({
      service,
      postCapture: req => {
        // Production wiring — background SW handles the message.
        chrome.runtime.sendMessage({ channel: 'capture', payload: req });
      },
    });
  }
}
