// Popup UI sketch. Three screens:
//   - Unlock (when vault is locked or empty)
//   - Key list (per-service add/remove)
//   - Permissions (per-origin grants, revoke)
// Implementation intentionally minimal — this is the design surface.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { OriginPermission, ProviderId, RedactedVaultEntry } from '../shared/types';
import { PROVIDERS, listProviders } from '../shared/providers';

type Screen = 'unlock' | 'keys' | 'permissions';

function App() {
  const [screen, setScreen] = useState<Screen>('unlock');
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    void chrome.runtime.sendMessage({ channel: 'popup', payload: { kind: 'status' } }).then(r => {
      setUnlocked(Boolean(r?.unlocked));
      setScreen(r?.unlocked ? 'keys' : 'unlock');
    });
  }, []);

  if (!unlocked) return <Unlock onUnlocked={() => { setUnlocked(true); setScreen('keys'); }} />;

  const openDashboard = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/audit/index.html') });
  };

  return (
    <div className="app">
      <nav>
        <button onClick={() => setScreen('keys')} aria-pressed={screen === 'keys'}>Keys</button>
        <button onClick={() => setScreen('permissions')} aria-pressed={screen === 'permissions'}>Sites</button>
        <button onClick={openDashboard} title="Open full sharing dashboard">Dashboard ↗</button>
      </nav>
      {screen === 'keys' ? <Keys /> : <Permissions />}
    </div>
  );
}

function Unlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await chrome.runtime.sendMessage({
      channel: 'popup',
      payload: { kind: 'unlock', password },
    });
    if (res?.ok) onUnlocked();
    else setError('Wrong password');
  };

  return (
    <form onSubmit={onSubmit} className="unlock">
      <h1>Moltypass</h1>
      <p>Enter your vault password.</p>
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        autoFocus
      />
      {error && <p className="error">{error}</p>}
      <button type="submit">Unlock</button>
    </form>
  );
}

function Keys() {
  const [entries, setEntries] = useState<RedactedVaultEntry[]>([]);
  const reload = () =>
    chrome.runtime
      .sendMessage({ channel: 'popup', payload: { kind: 'list-keys' } })
      .then(r => setEntries(r?.entries ?? []));
  useEffect(() => { void reload(); }, []);

  return (
    <section>
      {listProviders().map(p => (
        <ServiceSection
          key={p}
          service={p}
          entries={entries.filter(e => e.service === p)}
          onChange={reload}
        />
      ))}
    </section>
  );
}

function ServiceSection({
  service,
  entries,
  onChange,
}: {
  service: ProviderId;
  entries: RedactedVaultEntry[];
  onChange: () => void;
}) {
  const cfg = PROVIDERS[service];
  const [mode, setMode] = useState<'idle' | 'paste' | 'guide'>('idle');
  const [label, setLabel] = useState('default');
  const [key, setKey] = useState('');

  const add = async () => {
    await chrome.runtime.sendMessage({
      channel: 'popup',
      payload: { kind: 'add-key', service, label, apiKey: key },
    });
    setKey('');
    setMode('idle');
    onChange();
  };

  const remove = async (id: string) => {
    await chrome.runtime.sendMessage({ channel: 'popup', payload: { kind: 'remove-key', id } });
    onChange();
  };

  const openProvider = () => {
    void chrome.tabs.create({ url: cfg.createKeyUrl });
  };

  return (
    <div className="service-section">
      <h2>{cfg.displayName}</h2>
      <ul>
        {entries.map(e => (
          <li key={e.id}>
            {e.label} <button onClick={() => remove(e.id)}>×</button>
          </li>
        ))}
      </ul>

      {mode === 'idle' && (
        <div className="service-actions">
          <button onClick={() => setMode('paste')}>+ Add existing key</button>
          <button onClick={() => setMode('guide')} className="primary-ghost">Get a new key →</button>
        </div>
      )}

      {mode === 'paste' && (
        <div className="paste-key">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="label" />
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="paste API key"
            autoFocus
          />
          <div className="row">
            <button onClick={add}>Save</button>
            <button onClick={() => setMode('idle')}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'guide' && (
        <div className="get-key-guide">
          <ol>
            {cfg.instructions.map((step, i) => <li key={i}>{step}</li>)}
          </ol>
          {cfg.prerequisites && <p className="prereq">{cfg.prerequisites}</p>}
          <div className="row">
            <button className="primary" onClick={openProvider}>
              Open {cfg.displayName.split(' ')[0]} →
            </button>
            <button onClick={() => setMode('paste')}>I have one already</button>
            <button onClick={() => setMode('idle')}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Permissions() {
  const [perms, setPerms] = useState<OriginPermission[]>([]);
  const reload = () =>
    chrome.runtime
      .sendMessage({ channel: 'popup', payload: { kind: 'list-permissions' } })
      .then(r => setPerms(r?.permissions ?? []));
  useEffect(() => { void reload(); }, []);

  const revoke = async (origin: string, service: ProviderId) => {
    await chrome.runtime.sendMessage({
      channel: 'popup',
      payload: { kind: 'revoke', origin, service },
    });
    reload();
  };

  return (
    <ul>
      {perms.map(p => (
        <li key={`${p.origin}-${p.service}`}>
          <strong>{p.origin}</strong> → {PROVIDERS[p.service].displayName} ({p.mode})
          <button onClick={() => revoke(p.origin, p.service)}>Revoke</button>
        </li>
      ))}
      {perms.length === 0 && <li>No sites have been granted access.</li>}
    </ul>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
