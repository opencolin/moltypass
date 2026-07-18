import Link from 'next/link';

export default function Home() {
  return (
    <>
      <TopNav />
      <main>
        <Hero />
        <AgentExhibit />
        <Surfaces />
        <TouchId />
        <HowItWorks />
        <Comparison />
        <Providers />
        <ToolAware />
        <DashboardPreview />
        <Enterprise />
        <Security />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}

function TopNav() {
  return (
    <header className="topnav">
      <div className="container inner">
        <Link href="/" className="logo">
          <span className="mark" /> moltypass
        </Link>
        <nav>
          <a href="#surfaces">Browser + Terminal</a>
          <a href="#touchid">Touch ID</a>
          <a href="#how">How it works</a>
          <a href="#enterprise">Enterprise</a>
          <Link href="/pricing">Pricing</Link>
          <a href="https://github.com/moltypass/moltypass" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className="right">
          <Link href="/pricing" className="btn btn-ghost">Sign in</Link>
          <a className="btn btn-primary" href="#install">Add to Chrome — free</a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <span className="eyebrow">Open source · Browser + Terminal · Free forever for personal use</span>
        <h1>Your API keys are credentials. Stop treating them like <span className="strike">environment variables</span>.</h1>
        <p className="lede">
          Moltypass is the password manager AI keys never had. One vault for the
          browser, the terminal, and every tool in between. Capture keys straight
          from the provider&apos;s console without ever copying. Unlock with Touch ID.
          Rotate or revoke in one click. See every call that ever used one.
        </p>
        <div className="actions">
          <a className="btn btn-primary btn-lg" href="#install" id="install">
            Add to Chrome — free
          </a>
          <a className="btn btn-secondary btn-lg" href="#brew">
            <code style={{ background: 'transparent', color: 'inherit' }}>brew install moltypass</code>
          </a>
          <a className="btn btn-ghost btn-lg" href="#enterprise">
            For teams →
          </a>
        </div>
        <p className="reassure">
          No account required. No telemetry. Keys stay on your machine.
        </p>

        <div className="codeblock" aria-label="Before vs. after code comparison">
          <pre>
{`// Before — three places to leak from
const client = new Anthropic({
  apiKey: `}<span className="bad">{`process.env.ANTHROPIC_API_KEY  // …also in .env, .env.local, ~/.continue/.env`}</span>{`
});

// After — browser
const client = new Anthropic({
  fetch: `}<span className="good">{`window.moltypass.fetchFor('anthropic')  // key stays in the vault`}</span>{`
});

// After — terminal
`}<span className="good">{`$ moltypass exec npm run dev  # Touch ID; key injected per-process; nothing on disk`}</span>{`
`}
          </pre>
        </div>
      </div>
    </section>
  );
}

function AgentExhibit() {
  return (
    <section className="tight" id="why">
      <div className="container">
        <span className="eyebrow" data-section="§I">Why this exists</span>
        <h2>Even your AI agent&apos;s best advice is <span className="env-mark">.env</span>.</h2>
        <p className="lede">
          A real transcript from a real coding agent catching a real pasted credential.
          The agent does its job perfectly — and then recommends the status quo.
        </p>
        <div className="agent-exhibit">
          <div className="agent-bubble">
            <div className="agent-meta">AI coding agent · 0.3s ago</div>
            <p>⚠️ That looks like a live credential. I&apos;m not going to use, store, or echo it.</p>
            <ol>
              <li>Treat it as compromised and rotate it now.</li>
              <li>For the live spot-check, the right pattern is to put the key in <code>~/.hermes/.env</code> as <code>NEBIUS_API_KEY=…</code> — I read it from the environment at runtime and it never has to appear in the conversation:
                <pre className="bubble-code">$ hermes config set NEBIUS_API_KEY &lt;your-key&gt;</pre>
              </li>
              <li>If this was a paste accident, just rotate it and resend.</li>
            </ol>
          </div>
          <div className="agent-punchline">
            <h3>This is the most secure thing the ecosystem could think to recommend.</h3>
            <p>
              Six dotfiles later, the key is still plaintext on disk. There&apos;s no audit
              trail. There&apos;s no central revoke. The next AI agent you install will need
              its own copy. The credit-card surprise is still coming.
            </p>
            <p className="agent-conclusion">
              <strong>Moltypass replaces this entire ritual.</strong>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Surfaces() {
  return (
    <section id="surfaces">
      <div className="container">
        <span className="eyebrow" data-section="§II">Two surfaces, one vault</span>
        <h2>The browser. The terminal. Everywhere you use AI.</h2>
        <p className="lede">
          One encrypted vault on your machine. The Chrome extension handles every
          AI tool that runs in the browser. The macOS / Linux / Windows CLI handles
          every coding agent, script, and CLI that runs in the terminal. They share
          the vault, the audit log, the consent model, and rotations.
        </p>
        <div className="surfaces-grid">
          <div className="surface-card">
            <div className="surface-icon">🌐</div>
            <h3>Browser</h3>
            <p className="surface-tag">Chrome extension · Free</p>
            <ul>
              <li><strong>Capture without copying.</strong> Save a new key directly from console.anthropic.com, platform.openai.com, or aistudio.google.com — the banner reads it from the modal, never the clipboard.</li>
              <li><strong>Proxy without leaking.</strong> Sites call <code>window.moltypass.fetchFor(&apos;anthropic&apos;)</code>; the request goes out from the extension. The key never enters the page.</li>
              <li><strong>Consent per origin.</strong> First call shows the site and asks. Approve once, for a session, or until you revoke.</li>
            </ul>
          </div>
          <div className="surface-divider" aria-hidden="true">
            <div className="surface-vault">🔒</div>
            <div className="surface-vault-label">one vault</div>
          </div>
          <div className="surface-card">
            <div className="surface-icon">⌨️</div>
            <h3>Terminal</h3>
            <p className="surface-tag">macOS · Linux · Windows · Free</p>
            <ul>
              <li><strong>Run any tool, no <code>.env</code>.</strong> <code>moltypass exec npm run dev</code> injects the right keys for the duration of the process. Nothing on disk.</li>
              <li><strong>Tool-aware.</strong> Knows <code>hermes</code> wants <code>NEBIUS_API_KEY</code>, <code>continue</code> wants <code>ANTHROPIC_API_KEY</code>, and the rest. You don&apos;t memorize env-var names anymore.</li>
              <li><strong>Last-resort dotfile management.</strong> If a tool refuses the parent-process approach, <code>moltypass env --tool hermes</code> writes a managed <code>.env</code>, tracks it, and rewrites it on rotation.</li>
            </ul>
          </div>
        </div>
        <p className="surface-promise">
          One revoke kills both surfaces. One rotate updates every browser grant and every managed <code>.env</code> file in lockstep. <a href="#how">See how →</a>
        </p>
      </div>
    </section>
  );
}

function TouchId() {
  return (
    <section id="touchid" className="touchid">
      <div className="container">
        <div className="touchid-grid">
          <div>
            <span className="eyebrow" data-section="§III">macOS</span>
            <h2>Unlock with Touch ID. Once.</h2>
            <p className="lede">
              Type your master password the day you install Moltypass. After that,
              the vault unlocks with your fingerprint — the same gesture you already
              use to approve App Store purchases and Safari logins.
            </p>
            <ul className="touchid-facts">
              <li>
                <strong>Cached in the macOS Keychain</strong> with{' '}
                <code>kSecAccessControlBiometryCurrentSet</code>. Sleep, lock, or
                steal the laptop and the cached key is gone — even to root.
              </li>
              <li>
                <strong>Works across surfaces.</strong> One Touch ID unlock applies
                to the browser extension, every <code>moltypass exec</code>, and the
                menu-bar app.
              </li>
              <li>
                <strong>Configurable idle window.</strong> Default 5 minutes;
                lengthen if you trust your perimeter, shorten if you don&apos;t.
              </li>
              <li>
                <strong>Linux:</strong> falls back to <code>polkit</code>/<code>pam</code>.{' '}
                <strong>Windows:</strong> Windows Hello.
              </li>
            </ul>
          </div>
          <div className="touchid-mock" aria-hidden="true">
            <div className="touchid-window">
              <div className="touchid-window-bar">
                <span className="touchid-dot red" />
                <span className="touchid-dot yellow" />
                <span className="touchid-dot green" />
              </div>
              <div className="touchid-content">
                <div className="touchid-app">
                  <div className="touchid-app-icon">🔒</div>
                  <div>
                    <strong>Moltypass</strong> wants to unlock your vault
                  </div>
                </div>
                <p className="touchid-prompt">Touch ID or enter password</p>
                <div className="touchid-finger">
                  <div className="touchid-ring" />
                  <div className="touchid-icon">⌨</div>
                </div>
                <p className="touchid-caption">Touch the fingerprint sensor</p>
                <button className="touchid-cancel">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how">
      <div className="container">
        <span className="eyebrow" data-section="§IV">How it works</span>
        <h2>Four steps. The key stays put.</h2>
        <div className="four-card">
          <div className="card">
            <div className="icon">🔒</div>
            <h3>Store</h3>
            <p>
              One master password (or Touch ID) unlocks an encrypted local vault.
              Keys are AES-GCM encrypted at rest with an Argon2id-derived key.
              Nothing leaves your machine.
            </p>
          </div>
          <div className="card">
            <div className="icon">📥</div>
            <h3>Capture</h3>
            <p>
              On the provider&apos;s key-creation page, a banner offers to save the new
              key directly to the vault. No copy. No paste. No clipboard managers
              sniffing in between.
            </p>
          </div>
          <div className="card">
            <div className="icon">✓</div>
            <h3>Consent</h3>
            <p>
              When a site or CLI tool wants to use a key, Moltypass shows the
              caller and asks. Approve once, for a session, or until you revoke.
              Per origin, per tool, per service.
            </p>
          </div>
          <div className="card">
            <div className="icon">📒</div>
            <h3>Audit</h3>
            <p>
              The dashboard shows every site and every tool that has used each
              key — when, how often, how fast. Revoke any grant in one click.
              Anomalies get flagged.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  return (
    <section className="tight">
      <div className="container">
        <span className="eyebrow" data-section="§V">The status quo, line by line</span>
        <h2>API keys are credentials. They&apos;ve been treated like passwords from 2003.</h2>
        <div className="compare">
          <div className="col">
            <h3>Without Moltypass</h3>
            <ul>
              <li>Key sits in plaintext in <code>.env</code> files, dotfiles, shell history, and chat transcripts.</li>
              <li>Copy-paste through the clipboard — read by clipboard managers and any extension with permission.</li>
              <li>Every CLI tool wants its own dotfile with its own env-var naming convention.</li>
              <li>No record of which site or tool received the key, or when.</li>
              <li>Rotation means manually finding and replacing the key across six locations. You don&apos;t do it.</li>
              <li>If a site is breached, you find out from a charge on your card.</li>
            </ul>
          </div>
          <div className="col good">
            <h3>With Moltypass</h3>
            <ul>
              <li>Keys encrypted at rest with Argon2id + AES-GCM. Decrypted briefly in memory only when used.</li>
              <li>Capture flows read straight from the provider&apos;s DOM. <strong>The clipboard is never touched.</strong></li>
              <li>One vault. The browser, every CLI, every coding agent use the same encrypted source.</li>
              <li>Every grant, every call logged: site, time, status, latency. Searchable and exportable.</li>
              <li>One <code>moltypass rotate</code> updates every browser grant and every managed <code>.env</code> in lockstep.</li>
              <li>Volume anomalies trigger an alert before the bill arrives.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Providers() {
  return (
    <section className="tight">
      <div className="container">
        <span className="eyebrow" data-section="§VI">Providers</span>
        <h2>Anthropic, OpenAI, Gemini out of the box.</h2>
        <p className="lede">
          Built-in support for each provider&apos;s key shapes, auth header, and key-creation
          page detector. More providers ship as the community adds them — a provider
          definition is a few lines of config.
        </p>
        <div className="providers">
          <span className="provider-pill" data-id="anthropic"><span className="dot" /> Anthropic Claude</span>
          <span className="provider-pill" data-id="openai"><span className="dot" /> OpenAI</span>
          <span className="provider-pill" data-id="gemini"><span className="dot" /> Google Gemini</span>
          <span className="provider-pill soon">Mistral · Cohere · Together · Groq · Nebius · Replicate · ElevenLabs · Fireworks · Perplexity — coming</span>
        </div>
      </div>
    </section>
  );
}

function ToolAware() {
  const tools = [
    { name: 'claude code', env: 'ANTHROPIC_API_KEY', supported: true },
    { name: 'cursor', env: '(auto-detected)', supported: true },
    { name: 'continue', env: 'ANTHROPIC_API_KEY · OPENAI_API_KEY', supported: true },
    { name: 'aider', env: 'ANTHROPIC_API_KEY · OPENAI_API_KEY', supported: true },
    { name: 'hermes', env: 'NEBIUS_API_KEY · OPENAI_API_KEY', supported: true },
    { name: 'goose', env: 'OPENAI_API_KEY · ANTHROPIC_API_KEY', supported: true },
    { name: 'llm', env: '(plugin-defined)', supported: true },
    { name: 'mods', env: 'OPENAI_API_KEY · ANTHROPIC_API_KEY', supported: true },
    { name: 'aichat', env: 'CLIENT_API_KEY (per provider)', supported: true },
    { name: 'open-interpreter', env: 'OPENAI_API_KEY · ANTHROPIC_API_KEY', supported: true },
    { name: 'sgpt', env: 'OPENAI_API_KEY', supported: true },
    { name: 'your custom CLI', env: 'PR welcome', supported: false },
  ];
  return (
    <section className="tight">
      <div className="container">
        <span className="eyebrow" data-section="§VII">Tool-aware CLI</span>
        <h2>Knows which env var your AI CLI wants. So you don&apos;t.</h2>
        <p className="lede">
          <code>moltypass exec &lt;command&gt;</code> looks at the command, picks the right
          provider keys, injects them only into that process, and revokes them when
          the process exits. A built-in library covers the agents most people use;
          adding yours is a pull request.
        </p>
        <div className="tools-grid">
          {tools.map(t => (
            <div key={t.name} className={`tool-card ${t.supported ? '' : 'tool-pr'}`}>
              <div className="tool-name">{t.name}</div>
              <div className="tool-env"><code>{t.env}</code></div>
              {t.supported ? null : <div className="tool-pr-label">+ Add via PR</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DashboardPreview() {
  return (
    <section className="tight" id="dashboard">
      <div className="container">
        <span className="eyebrow" data-section="§VIII">The dashboard</span>
        <h2>Every call. Every site. Every tool. Searchable.</h2>
        <p className="lede">
          The single place to answer &quot;where is my key being used right now?&quot; — across
          every browser tab, every CLI session, every coding agent. Sort, filter, group,
          and revoke anything with one click. Export to JSON or CSV.
        </p>
        <div className="dashboard-preview" aria-hidden="true">
          <div className="dashboard-toolbar">
            <input className="dashboard-search" type="text" placeholder="Search sites or keys…" readOnly />
            <span className="dashboard-chip">All</span>
            <span className="dashboard-chip active">Anthropic</span>
            <span className="dashboard-chip">OpenAI</span>
            <span className="dashboard-chip">Gemini</span>
            <span className="dashboard-chip dim">Group: by site ▾</span>
          </div>
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Caller</th>
                <th>Surface</th>
                <th>Provider</th>
                <th>Key</th>
                <th>Mode</th>
                <th>Shared</th>
                <th>Last used</th>
                <th className="numeric">Calls</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>claude.ai</strong></td>
                <td><span className="surface-badge browser">browser</span></td>
                <td><span className="provider-dot anthropic" /> Anthropic</td>
                <td><code>personal</code></td>
                <td><span className="mode-badge proxy">proxy</span></td>
                <td>3d ago</td>
                <td>2h ago</td>
                <td className="numeric">847</td>
                <td><button className="link-danger">Revoke</button></td>
              </tr>
              <tr>
                <td><strong>cursor.sh</strong></td>
                <td><span className="surface-badge browser">browser</span></td>
                <td><span className="provider-dot anthropic" /> Anthropic</td>
                <td><code>personal</code></td>
                <td><span className="mode-badge proxy">proxy</span></td>
                <td>7d ago</td>
                <td>1d ago</td>
                <td className="numeric">3,128</td>
                <td><button className="link-danger">Revoke</button></td>
              </tr>
              <tr>
                <td><strong>hermes (CLI)</strong></td>
                <td><span className="surface-badge terminal">terminal</span></td>
                <td><span className="provider-dot openai" /> OpenAI</td>
                <td><code>work</code></td>
                <td><span className="mode-badge proxy">proxy</span></td>
                <td>2d ago</td>
                <td>3h ago</td>
                <td className="numeric">56</td>
                <td><button className="link-danger">Revoke</button></td>
              </tr>
              <tr>
                <td><strong>aider (CLI)</strong></td>
                <td><span className="surface-badge terminal">terminal</span></td>
                <td><span className="provider-dot anthropic" /> Anthropic</td>
                <td><code>personal</code></td>
                <td><span className="mode-badge proxy">proxy</span></td>
                <td>1d ago</td>
                <td>12m ago</td>
                <td className="numeric">412</td>
                <td><button className="link-danger">Revoke</button></td>
              </tr>
              <tr>
                <td><strong>chat.openai.com</strong></td>
                <td><span className="surface-badge browser">browser</span></td>
                <td><span className="provider-dot openai" /> OpenAI</td>
                <td><code>work</code></td>
                <td><span className="mode-badge reveal">reveal</span></td>
                <td>2d ago</td>
                <td>2d ago</td>
                <td className="numeric">12</td>
                <td><button className="link-danger">Revoke</button></td>
              </tr>
              <tr className="anomaly-row">
                <td><strong>internal-tool.acme</strong></td>
                <td><span className="surface-badge browser">browser</span></td>
                <td><span className="provider-dot anthropic" /> Anthropic</td>
                <td><code>work</code></td>
                <td><span className="mode-badge proxy">proxy</span></td>
                <td>21d ago</td>
                <td>4m ago</td>
                <td className="numeric anomaly">8,492 ⚠</td>
                <td><button className="link-danger">Revoke</button></td>
              </tr>
            </tbody>
          </table>
          <p className="dashboard-anomaly">
            ⚠ Volume anomaly: <strong>internal-tool.acme</strong> · 8,492 calls in
            the last hour vs baseline <strong>140/hr</strong>. <a href="#">View calls →</a>
          </p>
        </div>
      </div>
    </section>
  );
}

function Enterprise() {
  return (
    <section id="enterprise">
      <div className="container">
        <div className="ent">
          <div>
            <span className="eyebrow" data-section="§IX">For IT &amp; security teams</span>
            <h2>Centralized audit. Zero exposure.</h2>
            <p className="lede">
              Deploy Moltypass to your org via Chrome MDM and Homebrew. Devices
              report structured event metadata to a collector you control — never
              plaintext keys, never request bodies. Push policy, set rotation
              cadence, gate reveal mode, and audit who shared what with whom.
            </p>
            <ul>
              <li>Magic-link SSO for the admin dashboard (SAML coming)</li>
              <li>Self-host on your VPC or use our managed collector</li>
              <li>Configurable retention from 30 days to forever</li>
              <li>Export to Splunk, Datadog, or any HTTP sink</li>
              <li>Per-org rotation policy enforced across browser + CLI surfaces</li>
            </ul>
            <div className="actions">
              <a className="btn btn-primary" href="mailto:sales@moltypass.app">Book a demo</a>
              <Link href="/pricing" className="btn btn-secondary">See pricing</Link>
            </div>
          </div>
          <div className="mock" aria-hidden="true">
            <div className="row"><strong>claude.ai</strong><span>Anthropic · personal</span><span>847 calls</span></div>
            <div className="row"><strong>cursor.sh</strong><span>Anthropic · personal</span><span>3,128 calls</span></div>
            <div className="row"><strong>hermes (CLI)</strong><span>OpenAI · work</span><span>56 calls</span></div>
            <div className="row"><strong>chat.openai.com</strong><span>OpenAI · work</span><span>12 calls · reveal</span></div>
            <div className="row"><strong>aistudio.google.com</strong><span>Gemini · personal</span><span>5 calls</span></div>
            <div className="row"><strong>internal-tool.acme</strong><span>Anthropic · work</span><span>89 calls</span></div>
            <div className="row"><strong>perplexity.ai</strong><span>Anthropic · personal</span><span>234 calls</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section className="tight security-strip">
      <div className="container">
        <span className="eyebrow" data-section="§X">Open source · STRIDE-reviewed · No telemetry</span>
        <h2>Read the crypto. Read the audit. Read the receipts.</h2>
        <p className="lede">
          Moltypass is MIT-licensed end-to-end — extension, CLI, native helper,
          collector. The trust model lives in <code>SECURITY.md</code> with a STRIDE
          table per surface. Personal Moltypass sends nothing to us — no analytics,
          no crash reports, no &quot;optional&quot; pings.
        </p>
        <div className="security-row">
          <div className="security-card">
            <strong>Argon2id KDF</strong>
            <p>Memory-hard. Versioned in the vault header so migration is clean.</p>
          </div>
          <div className="security-card">
            <strong>AES-GCM at rest</strong>
            <p>Per-entry random IV. Authenticated — tamper is detected, not assumed away.</p>
          </div>
          <div className="security-card">
            <strong>Revocation epoch</strong>
            <p>Read before and after every upstream fetch. Mid-flight revokes are honored.</p>
          </div>
          <div className="security-card">
            <strong>CI key-shape guard</strong>
            <p>The build refuses any commit with a key-shaped string outside the test fixtures.</p>
          </div>
        </div>
        <p className="security-disclose">
          Vulnerability disclosure: <a href="mailto:security@moltypass.app"><code>security@moltypass.app</code></a>.
          PGP key on the <a href="/security">security page</a>.
        </p>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section className="tight" id="pricing-preview">
      <div className="container">
        <span className="eyebrow" data-section="§XI">Pricing</span>
        <h2>Free for individuals. Real value for teams.</h2>
        <div className="pricing">
          <div className="plan">
            <span className="name">Personal</span>
            <div className="price">$0<small>/forever</small></div>
            <ul>
              <li>Encrypted local vault</li>
              <li>Chrome extension + macOS/Linux/Windows CLI</li>
              <li>Touch ID / Windows Hello / polkit unlock</li>
              <li>Anthropic, OpenAI, Gemini built-in</li>
              <li>Sharing dashboard &amp; one-click revoke</li>
              <li>Local audit log (365 days)</li>
            </ul>
            <a className="btn btn-secondary cta" href="#install">Get Moltypass</a>
          </div>
          <div className="plan featured">
            <span className="name">Team</span>
            <div className="price">$5<small>/user/month</small></div>
            <ul>
              <li>Everything in Personal</li>
              <li>Centralized audit collector</li>
              <li>Admin dashboard with magic-link sign-in</li>
              <li>MDM policy push (Chrome Enterprise)</li>
              <li>Anomaly &amp; leak alerts</li>
              <li>Org-wide rotation enforcement</li>
            </ul>
            <Link href="/pricing" className="btn btn-primary cta">Start trial</Link>
          </div>
          <div className="plan">
            <span className="name">Enterprise</span>
            <div className="price">Custom</div>
            <ul>
              <li>Everything in Team</li>
              <li>Self-host or BAA</li>
              <li>SOC 2 evidence pack</li>
              <li>SAML 2.0 + SCIM</li>
              <li>Unlimited audit retention</li>
              <li>Dedicated support</li>
            </ul>
            <a className="btn btn-secondary cta" href="mailto:sales@moltypass.app">Talk to us</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="container inner">
        <div>© {new Date().getFullYear()} Moltypass. Open source under MIT.</div>
        <nav>
          <a href="/docs">Docs</a>
          <a href="/security">Security</a>
          <a href="/privacy">Privacy</a>
          <a href="https://github.com/moltypass/moltypass">GitHub</a>
          <a href="mailto:hello@moltypass.app">Contact</a>
        </nav>
      </div>
    </footer>
  );
}
