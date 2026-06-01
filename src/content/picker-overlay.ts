// Shadow-DOM crosshair element picker. Activated by Cmd+Shift+M
// (via the background SW broadcasting picker.start to the active tab).
//
// UX:
//   - Crosshair cursor + dimmed backdrop covering the viewport.
//   - On hover, the candidate element under the cursor gets a colored
//     outline.
//   - On click: read el.textContent, fire onPick, tear down.
//   - On Escape: fire onCancel, tear down.
//   - Tab / Shift+Tab cycle through focusable elements with the same
//     hover-outline highlight (keyboard parity).
//   - ARIA live region announces "Element picker active. Hover to
//     highlight, click to capture, Escape to cancel."
//
// The picker DOES briefly hold the picked element's textContent in
// the onPick callback's argument. Caller is responsible for handing
// it to the background "capture" channel and letting it fall out of
// scope. Never logged, never persisted in the overlay.

export interface PickerOptions {
  /** Called on click with the element's textContent and the element. */
  onPick(text: string, element: Element): void;
  /** Called when the user hits Escape or otherwise cancels. */
  onCancel(): void;
}

export interface PickerHandle {
  destroy(): void;
}

const HOST_ID = 'moltypass-picker-overlay';

export function mountPicker(opts: PickerOptions): PickerHandle {
  const prior = document.getElementById(HOST_ID);
  if (prior) prior.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    all: 'initial',
    pointerEvents: 'auto', // intercept hovers/clicks
    cursor: 'crosshair',
  } as CSSStyleDeclaration);

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.05);
      cursor: crosshair;
    }
    .outline {
      position: fixed; pointer-events: none;
      border: 2px solid #2563eb;
      border-radius: 4px;
      box-shadow: 0 0 0 9999px rgba(37, 99, 235, 0.04) inset;
      transition: top 50ms linear, left 50ms linear, width 50ms linear, height 50ms linear;
    }
    .hint {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      background: #181c23; color: #ecedf0;
      padding: 8px 14px; border-radius: 6px;
      font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.18);
      pointer-events: none;
    }
    .sr {
      position: absolute; width: 1px; height: 1px;
      padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
      white-space: nowrap; border: 0;
    }
  `;

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';

  const outline = document.createElement('div');
  outline.className = 'outline';
  outline.style.display = 'none';

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Click an element to save. Escape to cancel.';

  const live = document.createElement('div');
  live.className = 'sr';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.textContent = 'Element picker active. Hover to highlight, click to capture, Escape to cancel.';

  shadow.append(style, backdrop, outline, hint, live);
  document.body.appendChild(host);

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    host.remove();
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('keydown', onKey, true);
    backdrop.removeEventListener('click', onClick);
  };

  const onMove = (e: MouseEvent) => {
    const target = elementUnder(e.clientX, e.clientY, host);
    if (!target) {
      outline.style.display = 'none';
      return;
    }
    const r = target.getBoundingClientRect();
    outline.style.display = 'block';
    outline.style.top = `${r.top}px`;
    outline.style.left = `${r.left}px`;
    outline.style.width = `${r.width}px`;
    outline.style.height = `${r.height}px`;
  };

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = elementUnder(e.clientX, e.clientY, host);
    if (!target) return;
    const text = (target.textContent ?? '').trim();
    destroy();
    opts.onPick(text, target);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      destroy();
      opts.onCancel();
    }
  };

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('click', onClick);

  return { destroy };
}

/**
 * Returns the page element under the given coordinate, skipping our
 * own overlay host so we can highlight what the user actually sees.
 */
function elementUnder(x: number, y: number, ignore: Element): Element | null {
  const stack = (document as Document & { elementsFromPoint?: (x: number, y: number) => Element[] })
    .elementsFromPoint?.(x, y) ?? [];
  for (const el of stack) {
    if (el !== ignore && !ignore.contains(el)) return el;
  }
  return null;
}
