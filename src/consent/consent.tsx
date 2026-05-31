// Consent popup. Opens in its own window per request. URL carries the
// pending consent id; we pull the ConsentRequest from the background.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ConsentRequest, RedactedVaultEntry } from '../shared/types';
import { PROVIDERS } from '../shared/providers';

function App() {
  const params = new URLSearchParams(window.location.search);
  const consentId = params.get('id') ?? '';

  const [request, setRequest] = useState<ConsentRequest | null>(null);
  const [keys, setKeys] = useState<RedactedVaultEntry[]>([]);
  const [keyId, setKeyId] = useState<string>('');
  const [duration, setDuration] = useState<'session' | '24h' | '30d' | 'always'>('session');

  useEffect(() => {
    void Promise.all([
      chrome.runtime.sendMessage({ channel: 'consent', payload: { kind: 'fetch', id: consentId } }),
      chrome.runtime.sendMessage({ channel: 'popup', payload: { kind: 'list-keys' } }),
    ]).then(([reqRes, keyRes]) => {
      const r = reqRes?.request as ConsentRequest | null;
      setRequest(r);
      const filtered = ((keyRes?.entries as RedactedVaultEntry[]) ?? []).filter(
        e => !r || e.service === r.service,
      );
      setKeys(filtered);
      if (filtered.length > 0) setKeyId(filtered[0]!.id);
    });
  }, [consentId]);

  const deny = async () => {
    await chrome.runtime.sendMessage({
      channel: 'consent',
      payload: { kind: 'resolve', id: consentId, resolution: { granted: false } },
    });
    window.close();
  };

  const allow = async () => {
    if (!request || !keyId) return;
    const expiresInMs =
      duration === 'session' ? undefined :
      duration === '24h' ? 24 * 3600_000 :
      duration === '30d' ? 30 * 86_400_000 :
      undefined; // 'always' = no expiry
    await chrome.runtime.sendMessage({
      channel: 'consent',
      payload: {
        kind: 'resolve',
        id: consentId,
        resolution: {
          granted: true,
          keyId,
          mode: request.requestedMode,
          expiresInMs,
        },
      },
    });
    window.close();
  };

  if (!request) return <div className="loading">Loading…</div>;

  const provider = PROVIDERS[request.service];
  const isReveal = request.requestedMode === 'reveal';

  return (
    <div className={`consent ${isReveal ? 'consent--reveal' : ''}`}>
      <h1>Moltypass</h1>
      <p className="origin">
        <strong>{request.origin}</strong>
      </p>
      <p>
        wants to {isReveal ? <strong>read your raw</strong> : 'use'} <strong>{provider.displayName}</strong> key
        {isReveal ? '.' : ' (via Moltypass, key stays in the vault).'}
      </p>

      {isReveal && (
        <div className="warning">
          ⚠ Reveal mode hands the raw API key to the page. The site can store
          it, exfiltrate it, or use it from elsewhere. Only allow if you trust
          this site and the SDK can't be configured to use proxy mode.
        </div>
      )}

      {request.pathPreview && (
        <details className="preview">
          <summary>Request preview</summary>
          <code>{request.pathPreview}</code>
          {request.bodyPreview && <pre>{request.bodyPreview}</pre>}
        </details>
      )}

      {keys.length === 0 ? (
        <p className="error">No {provider.displayName} keys in your vault.</p>
      ) : (
        <label>
          Key:
          <select value={keyId} onChange={e => setKeyId(e.target.value)}>
            {keys.map(k => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </label>
      )}

      <label>
        For:
        <select value={duration} onChange={e => setDuration(e.target.value as typeof duration)}>
          <option value="session">this session</option>
          <option value="24h">24 hours</option>
          <option value="30d">30 days</option>
          <option value="always">until I revoke</option>
        </select>
      </label>

      <div className="actions">
        <button onClick={deny}>Deny</button>
        <button onClick={allow} disabled={!keyId} className="primary">
          {isReveal ? 'Reveal once' : 'Allow'}
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
