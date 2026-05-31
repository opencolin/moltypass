// Admin dashboard — Overview. Lives at /overview behind auth.
// This page queries audit_events aggregated for the signed-in org.
// Data fetching here is a sketch — in real impl it would use cached
// React Server Components against Drizzle queries.

import Link from 'next/link';

export const metadata = { title: 'Overview — Moltypass admin' };

export default function OverviewPage() {
  const data = mockOverview();
  return (
    <div className="dash">
      <Sidebar active="overview" />
      <main>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Acme Corp</div>
            <h1 style={{ fontSize: 22 }}>Overview</h1>
          </div>
          <Link href="/grants" className="btn btn-secondary">Browse grants →</Link>
        </div>

        <div className="kpi-row">
          <Kpi label="Devices reporting" value={data.devices.toLocaleString()} delta="+3 in last 7d" />
          <Kpi label="Active keys" value={data.activeKeys.toLocaleString()} delta={`${data.fingerprints} unique fingerprints`} />
          <Kpi label="Grants this week" value={data.grantsWeek.toLocaleString()} delta={`${data.revokesWeek} revokes`} />
          <Kpi label="Anomalies" value={data.anomalies.toLocaleString()} delta="3 unresolved" />
        </div>

        <div className="section-head">
          <h2>Most-used sites (7d)</h2>
          <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>Across {data.devices} devices</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Site</th>
              <th>Service</th>
              <th>Keys involved</th>
              <th>Devices</th>
              <th>Calls</th>
            </tr>
          </thead>
          <tbody>
            {data.topSites.map(row => (
              <tr key={row.origin}>
                <td><strong>{row.origin}</strong></td>
                <td>{row.service}</td>
                <td>{row.keys}</td>
                <td>{row.devices}</td>
                <td>{row.calls.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="section-head">
          <h2>Recent anomalies</h2>
          <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>Volume drift, leak.suspected, reveal spikes</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Device</th>
              <th>Signal</th>
              <th>Details</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.anomalyList.map(a => (
              <tr key={a.id}>
                <td>{a.when}</td>
                <td>{a.device}</td>
                <td>{a.kind}</td>
                <td>{a.detail}</td>
                <td><Link href={`/anomalies/${a.id}`} className="btn btn-ghost" style={{ padding: '4px 8px' }}>Open →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}

function Sidebar({ active }: { active: string }) {
  const items = [
    { id: 'overview',  label: 'Overview',  href: '/overview' },
    { id: 'grants',    label: 'Grants',    href: '/grants' },
    { id: 'keys',      label: 'Keys',      href: '/keys' },
    { id: 'devices',   label: 'Devices',   href: '/devices' },
    { id: 'anomalies', label: 'Anomalies', href: '/anomalies' },
    { id: 'policy',    label: 'Policy',    href: '/policy' },
    { id: 'tokens',    label: 'API tokens', href: '/tokens' },
  ];
  return (
    <aside>
      <h2>Insights</h2>
      {items.slice(0, 5).map(i => (
        <Link key={i.id} href={i.href as never} className={active === i.id ? 'active' : ''}>{i.label}</Link>
      ))}
      <h2>Settings</h2>
      {items.slice(5).map(i => (
        <Link key={i.id} href={i.href as never} className={active === i.id ? 'active' : ''}>{i.label}</Link>
      ))}
    </aside>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  );
}

function mockOverview() {
  return {
    devices: 47,
    activeKeys: 31,
    fingerprints: 24,
    grantsWeek: 89,
    revokesWeek: 7,
    anomalies: 4,
    topSites: [
      { origin: 'https://cursor.sh',           service: 'Anthropic', keys: 12, devices: 9,  calls: 18_492 },
      { origin: 'https://claude.ai',           service: 'Anthropic', keys: 18, devices: 22, calls: 9_104 },
      { origin: 'https://chat.openai.com',     service: 'OpenAI',    keys: 5,  devices: 6,  calls: 412 },
      { origin: 'https://aistudio.google.com', service: 'Gemini',    keys: 3,  devices: 3,  calls: 56 },
      { origin: 'https://internal-tool.acme',  service: 'Anthropic', keys: 4,  devices: 7,  calls: 244 },
    ],
    anomalyList: [
      { id: 'a1', when: '2h ago',  device: 'jamie@acme', kind: 'leak.suspected', detail: 'Upstream usage +847 unexplained calls (Anthropic)' },
      { id: 'a2', when: '5h ago',  device: 'sam@acme',   kind: 'reveal.spike',   detail: '4 reveal-mode grants in 1h (typical: 0)' },
      { id: 'a3', when: '1d ago',  device: 'alex@acme',  kind: 'volume.drift',   detail: 'cursor.sh: 18k calls/24h vs 2k baseline' },
      { id: 'a4', when: '2d ago',  device: 'pat@acme',   kind: 'rotation.due',   detail: 'Key "personal-anthropic" is 91 days old (policy: 90)' },
    ],
  };
}
