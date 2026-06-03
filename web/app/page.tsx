import Link from 'next/link';

export default function Home() {
  return (
    <>
      <TopNav />
      <main>
        <Hero />
        <HowItWorks />
        <Comparison />
        <Providers />
        <Enterprise />
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
        <span className="eyebrow">Open source · Chrome extension · Free for personal use</span>
        <h1>Your API keys are credentials. Stop treating them like environment variables.</h1>
        <p className="lede">
          Moltypass is the password manager AI keys never had. Save them straight
          from the provider&apos;s console without ever copying. Use them in any app
          without pasting. Rotate or revoke in one click. See every call that
          ever used one. <code>.env</code> is not a secrets manager — and neither is
          your clipboard, your chat transcript, or your dotfiles.
        </p>
        <div className="actions">
          <a className="btn btn-primary btn-lg" href="#install" id="install">
            Add to Chrome — free
          </a>
          <a className="btn btn-secondary btn-lg" href="#enterprise">
            For teams →
          </a>
        </div>
        <p className="reassure">
          No account required. No telemetry. Keys stay on your machine.
        </p>

        <div className="codeblock" aria-label="Before vs. after code comparison">
          <pre>
{`// Before
const client = new Anthropic({
  apiKey: `}<span className="bad">{`'sk-ant-...'  // in your bundle, .env, every dev's laptop`}</span>{`
});

// After — with Moltypass
const client = new Anthropic({
  fetch: `}<span className="good">{`window.moltypass.fetchFor('anthropic')  // key stays in the vault`}</span>{`
});`}
          </pre>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how">
      <div className="container">
        <span className="eyebrow">How it works</span>
        <h2>Three steps. The key stays put.</h2>
        <div className="three-card">
          <div className="card">
            <div className="icon">🔒</div>
            <h3>Store</h3>
            <p>
              One master password unlocks an encrypted local vault. Keys are
              AES-GCM encrypted at rest with a PBKDF2-derived key. Nothing
              leaves your machine.
            </p>
          </div>
          <div className="card">
            <div className="icon">✓</div>
            <h3>Consent</h3>
            <p>
              When a site wants to use a key, Moltypass shows the origin and
              asks. Approve once, for a session, or until you revoke. Per
              origin, per service.
            </p>
          </div>
          <div className="card">
            <div className="icon">📒</div>
            <h3>Audit</h3>
            <p>
              The sharing dashboard shows every site that has used each key,
              when, and how often. Revoke any grant with one click. Anomalies
              get flagged.
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
        <span className="eyebrow">Why this exists</span>
        <h2>API keys are credentials. They&apos;ve been treated like passwords from 2003.</h2>
        <div className="compare">
          <div className="col">
            <h3>Without Moltypass</h3>
            <ul>
              <li>Key sits in plaintext in <code>.env</code> files, dotfiles, password managers, and shell history.</li>
              <li>Copy-paste through the clipboard — read by clipboard managers and any extension with permission.</li>
              <li>No record of which sites or services received the key.</li>
              <li>If a site is breached, you find out from a charge on your card.</li>
              <li>Rotation means manually finding and replacing the key everywhere.</li>
            </ul>
          </div>
          <div className="col good">
            <h3>With Moltypass</h3>
            <ul>
              <li>Keys are encrypted at rest, decrypted briefly in memory only when used.</li>
              <li>Proxy mode: the upstream API call happens from the extension, not the page. The key never enters the page&apos;s JS heap.</li>
              <li>Every grant is logged with origin, time, and call count. Searchable, exportable.</li>
              <li>Volume anomalies and unexplained usage trigger an alert.</li>
              <li>Revoke in one click. Rotation flow notifies dependent sites.</li>
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
        <span className="eyebrow">Supported providers</span>
        <h2>Anthropic, OpenAI, Gemini — out of the box.</h2>
        <p className="lede">
          Moltypass ships with built-in support for each provider&apos;s key shapes,
          authentication header, and key-creation page. Adding a provider is a
          few lines of config.
        </p>
        <div className="providers">
          <span className="provider-pill" data-id="anthropic"><span className="dot" /> Anthropic Claude</span>
          <span className="provider-pill" data-id="openai"><span className="dot" /> OpenAI</span>
          <span className="provider-pill" data-id="gemini"><span className="dot" /> Google Gemini</span>
          <span className="provider-pill soon">Mistral · Cohere · Together · Groq — coming</span>
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
            <span className="eyebrow">For IT &amp; security teams</span>
            <h2>Centralized audit. Zero exposure.</h2>
            <p className="lede">
              Deploy Moltypass to your org via Chrome MDM. Devices report
              structured event metadata to a collector you control — never
              plaintext keys, never request bodies. Push policy, set rotation
              cadence, gate reveal mode, and audit who shared what with whom.
            </p>
            <ul>
              <li>SSO sign-in for the admin dashboard</li>
              <li>Self-host on your VPC or use our managed collector</li>
              <li>Configurable retention from 30 days to forever</li>
              <li>Export to Splunk, Datadog, or any HTTP sink</li>
            </ul>
            <div className="actions">
              <a className="btn btn-primary" href="mailto:sales@moltypass.dev">Book a demo</a>
              <Link href="/pricing" className="btn btn-secondary">See pricing</Link>
            </div>
          </div>
          <div className="mock" aria-hidden="true">
            <div className="row"><strong>claude.ai</strong><span>Anthropic · personal</span><span>847 calls</span></div>
            <div className="row"><strong>cursor.sh</strong><span>Anthropic · personal</span><span>3,128 calls</span></div>
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

function Pricing() {
  return (
    <section className="tight" id="pricing-preview">
      <div className="container">
        <span className="eyebrow">Pricing</span>
        <h2>Free for individuals. Real value for teams.</h2>
        <div className="pricing">
          <div className="plan">
            <span className="name">Personal</span>
            <div className="price">$0<small>/forever</small></div>
            <ul>
              <li>Encrypted local vault</li>
              <li>Anthropic, OpenAI, Gemini</li>
              <li>Sharing dashboard &amp; one-click revoke</li>
              <li>Local audit log (365 days)</li>
            </ul>
            <a className="btn btn-secondary cta" href="#install">Add to Chrome</a>
          </div>
          <div className="plan featured">
            <span className="name">Team</span>
            <div className="price">$5<small>/user/month</small></div>
            <ul>
              <li>Everything in Personal</li>
              <li>Centralized audit collector</li>
              <li>Admin dashboard with SSO</li>
              <li>MDM policy push</li>
              <li>Anomaly &amp; leak alerts</li>
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
              <li>Unlimited audit retention</li>
              <li>Dedicated support</li>
            </ul>
            <a className="btn btn-secondary cta" href="mailto:sales@moltypass.dev">Talk to us</a>
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
          <a href="https://github.com/moltypass/moltypass">GitHub</a>
          <a href="mailto:hello@moltypass.dev">Contact</a>
        </nav>
      </div>
    </footer>
  );
}
