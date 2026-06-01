// Shadow-DOM "Save key to Moltypass?" banner. Injected by the content
// script when findKeyInSubtree spots a candidate inside a dialog.
//
// Why Shadow DOM:
//   - Page CSS cannot style or hide our UI.
//   - Page JS cannot read our DOM via document.querySelector.
//   - Page event handlers cannot inspect our click events.
//
// Why a closed shadow root: even getElementById('moltypass-banner')?.shadowRoot
// returns null from page scope. The host element is visible (necessary
// for layout) but its internals are not introspectable.
//
// The banner DOES NOT contain the plaintext candidate in attributes,
// data-* fields, or visible text. Only the masked preview is shown.

export interface BannerOptions {
  /** Pre-masked preview text — caller computes via maskCandidate. */
  masked: string;
  /** Provider display name e.g. "Anthropic (Claude)". */
  providerName: string;
  /** Optional dot color matching the provider — used for the badge. */
  providerColor?: string;
  /** Fired when the user clicks Save. */
  onSave(): void;
  /** Fired when the user clicks Dismiss or closes the banner. */
  onDismiss(): void;
}

export interface BannerHandle {
  /** Remove the banner from the page. Idempotent. */
  destroy(): void;
}

const HOST_ID = 'moltypass-detector-banner';

export function mountSaveBanner(opts: BannerOptions): BannerHandle {
  // Single-instance: replace any prior banner so we don't stack on
  // repeated mutations.
  const prior = document.getElementById(HOST_ID);
  if (prior) prior.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '2147483647', // max int — beats anything the page sets
    all: 'initial',       // belt-and-suspenders against page CSS
  } as CSSStyleDeclaration);

  // `mode: 'closed'` — page scripts can't reach `.shadowRoot` via the host.
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .card {
      background: #ffffff;
      color: #1a1d22;
      border: 1px solid #cfd3da;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      padding: 14px 16px;
      width: 320px;
      font-size: 14px;
      line-height: 1.45;
    }
    @media (prefers-color-scheme: dark) {
      .card { background: #181c23; color: #ecedf0; border-color: #353c47; }
    }
    .row { display: flex; align-items: center; gap: 8px; }
    .badge {
      width: 10px; height: 10px; border-radius: 50%;
      background: #2563eb;
    }
    .title { font-weight: 600; }
    .preview {
      margin-top: 6px;
      padding: 6px 8px;
      font-family: ui-monospace, SFMono-Regular, "Menlo", monospace;
      font-size: 12px;
      color: #545a64;
      background: rgba(127,127,127,0.10);
      border-radius: 4px;
    }
    .actions { margin-top: 10px; display: flex; gap: 6px; justify-content: flex-end; }
    button {
      font: inherit; cursor: pointer;
      border: 1px solid #cfd3da;
      border-radius: 6px;
      padding: 5px 12px;
      background: transparent;
      color: inherit;
    }
    .primary {
      background: #2563eb;
      border-color: transparent;
      color: white;
    }
    .primary:hover { background: #1e54d6; }
  `;

  // Build the card via DOM API rather than innerHTML. Even though every
  // user-controlled string is set via textContent below, we avoid
  // innerHTML entirely so the content script presents zero HTML-parser
  // surface to the page or to future contributors.
  const card = document.createElement('div');
  card.className = 'card';

  const row = document.createElement('div');
  row.className = 'row';
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.dataset.role = 'badge';
  const title = document.createElement('span');
  title.className = 'title';
  title.dataset.role = 'title';
  title.textContent = `Save ${opts.providerName} key?`;
  row.append(badge, title);

  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.dataset.role = 'preview';
  preview.textContent = opts.masked;

  const actions = document.createElement('div');
  actions.className = 'actions';
  const dismissBtn = document.createElement('button');
  dismissBtn.dataset.role = 'dismiss';
  dismissBtn.textContent = 'Dismiss';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'primary';
  saveBtn.dataset.role = 'save';
  saveBtn.textContent = 'Save to Moltypass';
  actions.append(dismissBtn, saveBtn);

  card.append(row, preview, actions);

  if (opts.providerColor) {
    badge.style.background = opts.providerColor;
  }

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    host.remove();
  };

  card.querySelector('[data-role="save"]')!.addEventListener('click', () => {
    if (destroyed) return;
    opts.onSave();
    destroy();
  });
  card.querySelector('[data-role="dismiss"]')!.addEventListener('click', () => {
    if (destroyed) return;
    opts.onDismiss();
    destroy();
  });

  shadow.append(style, card);
  document.body.appendChild(host);

  return { destroy };
}
