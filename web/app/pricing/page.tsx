import Link from 'next/link';

export const metadata = {
  title: 'Pricing — Moltypass',
};

export default function PricingPage() {
  return (
    <>
      <header className="topnav">
        <div className="container inner">
          <Link href="/" className="logo"><span className="mark" /> moltypass</Link>
          <nav>
            <Link href="/">Home</Link>
            <Link href="/pricing">Pricing</Link>
            <a href="https://github.com/moltypass/moltypass">GitHub</a>
          </nav>
          <div className="right">
            <a className="btn btn-primary" href="mailto:sales@moltypass.app">Book a demo</a>
          </div>
        </div>
      </header>

      <main>
        <section className="hero" style={{ paddingBottom: 24 }}>
          <div className="container">
            <span className="eyebrow">Pricing</span>
            <h1>One free tier. Two team tiers.</h1>
            <p className="lede">
              Personal use is free and always will be. Teams pay for the
              hosted collector, admin dashboard, and policy push.
            </p>
          </div>
        </section>

        <section className="tight">
          <div className="container">
            <div className="pricing">
              <div className="plan">
                <span className="name">Personal</span>
                <div className="price">$0<small>/forever</small></div>
                <ul>
                  <li>Encrypted local vault (AES-GCM)</li>
                  <li>Anthropic, OpenAI, Gemini</li>
                  <li>Per-origin consent, three durations</li>
                  <li>Sharing dashboard with revoke</li>
                  <li>Local audit log, 365-day default retention</li>
                  <li>Clipboard-less capture from provider pages</li>
                </ul>
                <a className="btn btn-secondary cta" href="/#install">Add to Chrome</a>
              </div>
              <div className="plan featured">
                <span className="name">Team</span>
                <div className="price">$5<small>/user/month</small></div>
                <ul>
                  <li>Everything in Personal</li>
                  <li>Hosted audit collector</li>
                  <li>Admin dashboard (SSO via Google &amp; Microsoft)</li>
                  <li>MDM policy push (Chrome enterprise)</li>
                  <li>Configurable retention up to 7 years</li>
                  <li>Anomaly &amp; leak alerts to Slack / email</li>
                  <li>Up to 50 users</li>
                </ul>
                <a className="btn btn-primary cta" href="mailto:sales@moltypass.app?subject=Team%20trial">Start 14-day trial</a>
              </div>
              <div className="plan">
                <span className="name">Enterprise</span>
                <div className="price">Custom</div>
                <ul>
                  <li>Everything in Team, unlimited users</li>
                  <li>Self-host or BAA / private cloud</li>
                  <li>SOC 2 Type II evidence pack</li>
                  <li>Custom data retention &amp; deletion</li>
                  <li>SAML 2.0, SCIM provisioning</li>
                  <li>Dedicated Slack channel</li>
                  <li>99.9% SLA</li>
                </ul>
                <a className="btn btn-secondary cta" href="mailto:sales@moltypass.app">Talk to sales</a>
              </div>
            </div>
          </div>
        </section>

        <section className="tight">
          <div className="container">
            <h2 style={{ marginBottom: 24 }}>Common questions</h2>
            <Faq q="Do you ever see our API keys?">
              No. Keys are encrypted on the device with a key derived from each
              user&apos;s vault password. The cleartext is decrypted briefly in the
              extension service worker only to make a proxy call. Even on the
              Team and Enterprise plans, only structured event metadata leaves
              the device — origin, service, fingerprint, status, latency.
              Never the bytes.
            </Faq>
            <Faq q="What&apos;s a key fingerprint?">
              A short salted SHA-256 hash of the key, computed on-device. It
              lets an admin recognize when the same key is being used in two
              places (or after a rotation) without ever seeing the key itself.
            </Faq>
            <Faq q="Can we self-host?">
              Yes, on the Enterprise plan. The collector is a single Next.js
              app with a Postgres database. We provide a deploy template for
              Vercel, AWS, and Cloud Run.
            </Faq>
            <Faq q="What about reveal mode?">
              Reveal mode hands the raw key to the page for legacy SDKs that
              insist on it. Org admins can disable reveal mode entirely via
              policy. Every reveal event is logged.
            </Faq>
          </div>
        </section>
      </main>
    </>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details style={{
      borderTop: '1px solid var(--border)',
      padding: '20px 0',
    }}>
      <summary style={{ cursor: 'pointer', fontWeight: 500, fontSize: 16 }}>{q}</summary>
      <p style={{ color: 'var(--text-dim)', marginTop: 8, maxWidth: 720 }}>{children}</p>
    </details>
  );
}
