// Public privacy policy. Required by the Chrome Web Store for any
// extension that handles user secrets, and hosted at a stable URL so
// the CWS listing can link to it.
//
// This page is authoritative. SECURITY.md restates the trust model
// for developers; this page restates it for users in plain language.

export const metadata = {
  title: 'Privacy Policy — Moltypass',
  description: 'What Moltypass collects, what it never collects, and what you can do about it.',
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', lineHeight: 1.6 }}>
      <h1>Moltypass — Privacy Policy</h1>
      <p style={{ color: 'var(--text-dim, #545a64)' }}>Last updated: 2026-05-31</p>

      <h2>The short version</h2>
      <ul>
        <li>Your API keys never leave your device.</li>
        <li>Moltypass does not collect telemetry, analytics, or crash reports by default.</li>
        <li>We never see your keys, and we don&apos;t want to.</li>
        <li>When you grant a site access to a key, only that site sees that key — and only after you click Allow.</li>
      </ul>

      <h2>What Moltypass stores locally</h2>
      <p>
        Moltypass keeps an encrypted vault on your device only. The vault contains:
      </p>
      <ul>
        <li>Your API keys (AES-GCM ciphertext, decrypted only in memory while the vault is unlocked)</li>
        <li>Per-site permissions — which sites you&apos;ve granted access to which keys</li>
        <li>A local audit log: when keys were used, on what site, with what status. Never includes the keys themselves.</li>
      </ul>
      <p>
        Encryption uses Argon2id (memory-hard KDF) with PBKDF2(600k SHA-256) as a fallback. The key derivation salt is per-installation and never leaves your device.
      </p>

      <h2>What Moltypass never collects</h2>
      <ul>
        <li>Your API key bytes — they are never logged, telemetered, included in crash reports, or transmitted anywhere except the upstream provider you authorize.</li>
        <li>The bodies of your AI requests or responses — Moltypass proxies them through but does not read or persist them.</li>
        <li>Your browsing history outside of the per-site permissions you explicitly grant.</li>
        <li>Any identifier tied to you personally.</li>
      </ul>

      <h2>What Moltypass sends to providers</h2>
      <p>
        When a site you&apos;ve granted access to makes an AI request through Moltypass, Moltypass forwards the request to the provider you chose (e.g. <code>api.anthropic.com</code>, <code>api.openai.com</code>, <code>generativelanguage.googleapis.com</code>) with your API key in the appropriate header. The provider sees the request body, your IP address, and the key. Their privacy policy applies.
      </p>

      <h2>Optional enterprise mode</h2>
      <p>
        If your organization deploys Moltypass via Chrome Enterprise policy and configures a collector URL, Moltypass will send structured event metadata (timestamps, origin, service, key fingerprint, status, latency) to that collector. The collector is run by your organization. Moltypass never sends raw keys or request bodies to any collector. Enterprise mode is disabled unless explicitly enabled by an administrator and is fully inert for personal users.
      </p>

      <h2>Permissions explained</h2>
      <ul>
        <li><strong>storage</strong> — to store the encrypted vault, permissions, and audit log on your device.</li>
        <li><strong>alarms</strong> — to schedule the vault auto-lock timer and the daily audit-log retention sweep.</li>
        <li><strong>tabs</strong> — to open the audit dashboard tab when you click the Moltypass icon.</li>
        <li><strong>contextMenus</strong> — to add the &quot;Save selection to Moltypass…&quot; right-click option.</li>
        <li><strong>host_permissions</strong> on AI provider domains — to proxy your AI requests directly to the provider you chose without routing them through any Moltypass server.</li>
        <li><strong>content scripts</strong> on provider key-creation pages — to detect when you generate a new key and offer the &quot;Save to Moltypass&quot; banner. The content script reads the key text from the page&apos;s DOM, then sends it to Moltypass via the extension&apos;s private message channel — never via the system clipboard.</li>
      </ul>

      <h2>Your controls</h2>
      <ul>
        <li>The Moltypass popup shows every key you&apos;ve stored, every site that has been granted access, and lets you revoke any grant or rotate any key.</li>
        <li>You can export the audit log to JSON or CSV.</li>
        <li>You can delete the vault entirely from the popup — this is permanent.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Security disclosures: <code>security@moltypass.app</code>. Privacy questions: <code>privacy@moltypass.app</code>.
      </p>
    </main>
  );
}
