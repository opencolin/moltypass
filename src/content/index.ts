// Content script. Runs in the ISOLATED world at document_start.
// Two jobs:
//   1) Inject inpage.js into the page's MAIN world so it can attach
//      window.moltypass.
//   2) Relay window.postMessage <-> chrome.runtime.sendMessage.

const INPAGE_URL = chrome.runtime.getURL('inpage.js');

const script = document.createElement('script');
script.src = INPAGE_URL;
// Removing the node after load keeps the DOM clean; the script keeps running.
script.onload = () => script.remove();
(document.head ?? document.documentElement).prepend(script);

// page (main world) -> background
window.addEventListener('message', async event => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.__moltypass !== 'request') return;

  try {
    const response = await chrome.runtime.sendMessage({
      channel: 'inpage',
      payload: data.payload,
    });
    window.postMessage({ __moltypass: 'response', payload: response }, window.location.origin);
  } catch (err) {
    window.postMessage(
      {
        __moltypass: 'response',
        payload: {
          id: data.payload?.id ?? 'unknown',
          ok: false,
          error: {
            code: 'internal',
            message: err instanceof Error ? err.message : String(err),
          },
        },
      },
      window.location.origin,
    );
  }
});
