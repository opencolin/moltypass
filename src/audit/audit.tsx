// Sharing dashboard — full-tab view. Lists every (origin, service, key)
// grant with when it was shared, when it was last used, mode, and call
// count. Filterable, sortable, groupable, exportable.
//
// Loads `?demo=1` with synthetic data when developing without a backend.

import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ConsentMode, ProviderId, SharingLedgerEntry } from '../shared/types';
import { PROVIDERS, listProviders } from '../shared/providers';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

type SortKey = 'origin' | 'service' | 'keyLabel' | 'grantedAt' | 'lastUsedAt' | 'callsUsed' | 'mode';
type SortDir = 'asc' | 'desc';
type GroupBy = 'none' | 'origin' | 'key';

const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';

function App() {
  const [entries, setEntries] = useState<SharingLedgerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<Set<ProviderId>>(new Set());
  const [modeFilter, setModeFilter] = useState<ConsentMode | 'all'>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'lastUsedAt',
    dir: 'desc',
  });

  const load = async () => {
    if (isDemo) {
      setEntries(demoEntries());
      return;
    }
    try {
      const res = await chrome.runtime.sendMessage({
        channel: 'popup',
        payload: { kind: 'list-sharing-ledger' },
      });
      if (res?.ok) setEntries(res.entries as SharingLedgerEntry[]);
      else setError(res?.error ?? 'Failed to load sharing ledger');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = query.trim().toLowerCase();
    return entries.filter(e => {
      if (q && !e.origin.toLowerCase().includes(q) && !e.keyLabel.toLowerCase().includes(q)) return false;
      if (providerFilter.size > 0 && !providerFilter.has(e.service)) return false;
      if (modeFilter !== 'all' && e.mode !== modeFilter) return false;
      return true;
    });
  }, [entries, query, providerFilter, modeFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => compareEntries(a, b, sort.key, sort.dir));
    return arr;
  }, [filtered, sort]);

  if (entries === null && !error) {
    return <div className="page"><div className="empty">Loading…</div></div>;
  }

  return (
    <div className="page">
      <header>
        <div>
          <div className="crumbs">Moltypass</div>
          <h1>Sharing dashboard</h1>
        </div>
        <ExportMenu rows={sorted} />
      </header>

      {isDemo && (
        <div className="demo-banner">
          Showing demo data. Open without <code>?demo=1</code> to see your real grants.
        </div>
      )}

      <Summary entries={entries ?? []} filtered={sorted} />

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search sites or keys…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <ProviderChips value={providerFilter} onChange={setProviderFilter} />
        <ModeChips value={modeFilter} onChange={setModeFilter} />
        <div className="spacer" />
        <label>
          Group by{' '}
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}>
            <option value="none">none</option>
            <option value="origin">site</option>
            <option value="key">key</option>
          </select>
        </label>
      </div>

      {error && <div className="empty"><h2>Couldn't load</h2><p>{error}</p></div>}

      {sorted.length === 0 && !error ? (
        <EmptyState hasAny={(entries ?? []).length > 0} />
      ) : (
        <LedgerTable
          rows={sorted}
          sort={sort}
          onSort={setSort}
          groupBy={groupBy}
          onRevoked={load}
        />
      )}
    </div>
  );
}

function Summary({ entries, filtered }: { entries: SharingLedgerEntry[]; filtered: SharingLedgerEntry[] }) {
  if (entries.length === 0) return null;
  const sites = new Set(entries.map(e => e.origin)).size;
  const keys = new Set(entries.map(e => e.keyId)).size;
  const lastShared = entries.reduce((max, e) => Math.max(max, e.grantedAt), 0);
  const showing = filtered.length === entries.length
    ? null
    : ` (showing ${filtered.length})`;
  return (
    <div className="summary">
      You've shared <strong>{keys}</strong> {keys === 1 ? 'key' : 'keys'} with{' '}
      <strong>{sites}</strong> {sites === 1 ? 'site' : 'sites'}. Last shared{' '}
      <strong>{formatRelative(lastShared)}</strong>{showing}.
    </div>
  );
}

function ProviderChips({
  value, onChange,
}: { value: Set<ProviderId>; onChange: (v: Set<ProviderId>) => void }) {
  const toggle = (p: ProviderId) => {
    const next = new Set(value);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange(next);
  };
  return (
    <div className="chip-group" role="group" aria-label="Filter by provider">
      <button
        className="chip"
        aria-pressed={value.size === 0}
        onClick={() => onChange(new Set())}
      >
        All
      </button>
      {listProviders().map(p => (
        <button
          key={p}
          className="chip"
          aria-pressed={value.has(p)}
          onClick={() => toggle(p)}
        >
          {PROVIDERS[p].displayName.split(' ')[0]}
        </button>
      ))}
    </div>
  );
}

function ModeChips({
  value, onChange,
}: { value: ConsentMode | 'all'; onChange: (v: ConsentMode | 'all') => void }) {
  return (
    <div className="chip-group" role="group" aria-label="Filter by mode">
      {(['all', 'proxy', 'reveal'] as const).map(v => (
        <button
          key={v}
          className="chip"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {v === 'all' ? 'All modes' : v}
        </button>
      ))}
    </div>
  );
}

function LedgerTable({
  rows, sort, onSort, groupBy, onRevoked,
}: {
  rows: SharingLedgerEntry[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (s: { key: SortKey; dir: SortDir }) => void;
  groupBy: GroupBy;
  onRevoked: () => void;
}) {
  const toggleSort = (key: SortKey) => {
    if (sort.key === key) onSort({ key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    else onSort({ key, dir: 'desc' });
  };
  const arrow = (key: SortKey) =>
    sort.key === key ? (sort.dir === 'desc' ? '▾' : '▴') : '';

  const groups = groupRows(rows, groupBy);

  return (
    <table>
      <thead>
        <tr>
          <th className="sortable" onClick={() => toggleSort('origin')}>
            Site <span className="sort-arrow">{arrow('origin')}</span>
          </th>
          <th className="sortable" onClick={() => toggleSort('service')}>
            Provider <span className="sort-arrow">{arrow('service')}</span>
          </th>
          <th className="sortable" onClick={() => toggleSort('keyLabel')}>
            Key <span className="sort-arrow">{arrow('keyLabel')}</span>
          </th>
          <th className="sortable" onClick={() => toggleSort('mode')}>
            Mode <span className="sort-arrow">{arrow('mode')}</span>
          </th>
          <th className="sortable" onClick={() => toggleSort('grantedAt')}>
            Shared <span className="sort-arrow">{arrow('grantedAt')}</span>
          </th>
          <th className="sortable" onClick={() => toggleSort('lastUsedAt')}>
            Last used <span className="sort-arrow">{arrow('lastUsedAt')}</span>
          </th>
          <th className="sortable numeric" onClick={() => toggleSort('callsUsed')}>
            Calls <span className="sort-arrow">{arrow('callsUsed')}</span>
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        {groups.map(g => (
          <>
            {g.label && (
              <tr key={`hdr-${g.label}`}>
                <td colSpan={8} className="group-header">
                  {g.kind === 'key' ? 'Key: ' : 'Site: '}<strong>{g.label}</strong>
                  {' '}— {g.rows.length} {g.rows.length === 1 ? 'grant' : 'grants'}
                </td>
              </tr>
            )}
            {g.rows.map(row => (
              <Row key={row.grantId} row={row} onRevoked={onRevoked} />
            ))}
          </>
        ))}
      </tbody>
    </table>
  );
}

function Row({ row, onRevoked }: { row: SharingLedgerEntry; onRevoked: () => void }) {
  const provider = PROVIDERS[row.service];
  const revoke = async () => {
    const ok = window.confirm(
      `Revoke ${provider.displayName} access for ${row.origin}?\n\n` +
      `The site keeps any key bytes it has already received. ` +
      `Rotate at ${provider.displayName} if you've lost trust.`,
    );
    if (!ok) return;
    if (isDemo) { onRevoked(); return; }
    await chrome.runtime.sendMessage({
      channel: 'popup',
      payload: { kind: 'revoke', origin: row.origin, service: row.service },
    });
    onRevoked();
  };

  const url = (() => {
    try { return new URL(row.origin); } catch { return null; }
  })();

  return (
    <tr>
      <td className="origin">
        {url ? (
          <>
            <span className="scheme">{url.protocol}//</span>{url.host}
          </>
        ) : row.origin}
      </td>
      <td>
        <span className="provider" data-service={row.service}>
          <span className="dot" /> {provider.displayName.split(' ')[0]}
        </span>
      </td>
      <td>
        <span className={`key-label ${row.keyLabel === '(deleted)' ? 'deleted' : ''}`}>
          {row.keyLabel}
        </span>
      </td>
      <td>
        <span className={`mode-badge ${row.mode}`}>{row.mode}</span>
      </td>
      <td title={new Date(row.grantedAt).toLocaleString()}>
        {formatRelative(row.grantedAt)}
      </td>
      <td title={row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : undefined}>
        {row.lastUsedAt ? formatRelative(row.lastUsedAt) : <span style={{ color: 'var(--text-faint)' }}>never</span>}
      </td>
      <td className="numeric">{row.callsUsed.toLocaleString()}</td>
      <td>
        <button className="action danger" onClick={revoke}>Revoke</button>
      </td>
    </tr>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="empty">
      <h2>{hasAny ? 'No grants match your filters' : 'No sites have access to your keys'}</h2>
      <p>
        {hasAny
          ? 'Try clearing the search or filters.'
          : 'When you grant a website access to a key, it shows up here. Visit a site that uses Moltypass to get started.'}
      </p>
    </div>
  );
}

function ExportMenu({ rows }: { rows: SharingLedgerEntry[] }) {
  const [open, setOpen] = useState(false);
  const download = (kind: 'json' | 'csv') => {
    const blob = kind === 'json'
      ? new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
      : new Blob([toCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `moltypass-sharing-${new Date().toISOString().slice(0,10)}.${kind}`;
    a.click();
    URL.revokeObjectURL(a.href);
    setOpen(false);
  };
  return (
    <div className="dropdown">
      <button className="action" onClick={() => setOpen(v => !v)}>Export ▾</button>
      {open && (
        <div className="dropdown-menu" onMouseLeave={() => setOpen(false)}>
          <button onClick={() => download('json')}>Download JSON</button>
          <button onClick={() => download('csv')}>Download CSV</button>
        </div>
      )}
    </div>
  );
}

// ----- helpers -----

function compareEntries(a: SharingLedgerEntry, b: SharingLedgerEntry, key: SortKey, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'origin':     return sign * a.origin.localeCompare(b.origin);
    case 'service':    return sign * a.service.localeCompare(b.service);
    case 'keyLabel':   return sign * a.keyLabel.localeCompare(b.keyLabel);
    case 'mode':       return sign * a.mode.localeCompare(b.mode);
    case 'callsUsed':  return sign * (a.callsUsed - b.callsUsed);
    case 'grantedAt':  return sign * (a.grantedAt - b.grantedAt);
    case 'lastUsedAt': return sign * ((a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0));
  }
}

interface RowGroup { kind: GroupBy; label: string; rows: SharingLedgerEntry[]; }

function groupRows(rows: SharingLedgerEntry[], groupBy: GroupBy): RowGroup[] {
  if (groupBy === 'none') return [{ kind: 'none', label: '', rows }];
  const map = new Map<string, SharingLedgerEntry[]>();
  for (const r of rows) {
    const k = groupBy === 'origin' ? r.origin : `${PROVIDERS[r.service].displayName.split(' ')[0]} · ${r.keyLabel}`;
    let bucket = map.get(k);
    if (!bucket) { bucket = []; map.set(k, bucket); }
    bucket.push(r);
  }
  return [...map.entries()].map(([label, bucketRows]) => ({ kind: groupBy, label, rows: bucketRows }));
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < MIN) return 'just now';
  if (delta < HOUR) return `${Math.floor(delta / MIN)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  if (delta < 30 * DAY) return `${Math.floor(delta / DAY)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function toCsv(rows: SharingLedgerEntry[]): string {
  const header = ['grantId', 'origin', 'service', 'keyLabel', 'mode', 'grantedAt', 'lastUsedAt', 'callsUsed', 'expiresAt'];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.grantId, r.origin, r.service, r.keyLabel, r.mode,
      new Date(r.grantedAt).toISOString(),
      r.lastUsedAt ? new Date(r.lastUsedAt).toISOString() : '',
      r.callsUsed,
      r.expiresAt ? new Date(r.expiresAt).toISOString() : '',
    ].map(escape).join(','));
  }
  return lines.join('\n');
}

// ----- demo data -----

function demoEntries(): SharingLedgerEntry[] {
  const now = Date.now();
  return [
    { grantId: 'd1', origin: 'https://claude.ai',          service: 'anthropic', keyId: 'k1', keyLabel: 'personal', mode: 'proxy',  grantedAt: now - 3 * DAY,  lastUsedAt: now - 2 * HOUR,  callsUsed: 847 },
    { grantId: 'd2', origin: 'https://cursor.sh',          service: 'anthropic', keyId: 'k1', keyLabel: 'personal', mode: 'proxy',  grantedAt: now - 7 * DAY,  lastUsedAt: now - 1 * DAY,   callsUsed: 3128 },
    { grantId: 'd3', origin: 'https://chat.openai.com',    service: 'openai',    keyId: 'k2', keyLabel: 'work',     mode: 'reveal', grantedAt: now - 2 * DAY,  lastUsedAt: now - 2 * DAY,   callsUsed: 12 },
    { grantId: 'd4', origin: 'https://aistudio.google.com',service: 'gemini',    keyId: 'k3', keyLabel: 'personal', mode: 'proxy',  grantedAt: now - 5 * DAY,  callsUsed: 0 },
    { grantId: 'd5', origin: 'https://perplexity.ai',      service: 'anthropic', keyId: 'k1', keyLabel: 'personal', mode: 'proxy',  grantedAt: now - 14 * DAY, lastUsedAt: now - 6 * HOUR,  callsUsed: 234 },
    { grantId: 'd6', origin: 'https://t3.chat',            service: 'openai',    keyId: 'k2', keyLabel: 'work',     mode: 'proxy',  grantedAt: now - 1 * DAY,  lastUsedAt: now - 3 * HOUR,  callsUsed: 56 },
    { grantId: 'd7', origin: 'https://continue.dev',       service: 'anthropic', keyId: 'k4', keyLabel: 'work',     mode: 'proxy',  grantedAt: now - 21 * DAY, lastUsedAt: now - 4 * DAY,   callsUsed: 89 },
  ];
}

createRoot(document.getElementById('root')!).render(<App />);
