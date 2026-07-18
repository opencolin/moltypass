// In-memory fake daemon that satisfies the DaemonClient contract. Used by
// MCP tool tests to exercise the tools without a running vault or Native
// Messaging transport.

import type {
  AnomalySummary,
  DaemonClient,
  ExecResult,
  GrantSummary,
  ItemHistoryEntry,
  ProviderInfo,
  ToolCatalogEntry,
  VaultItemSummary,
} from '../types';

export interface FakeDaemonSeed {
  providers?: ProviderInfo[];
  items?: VaultItemSummary[];
  grants?: GrantSummary[];
  tools?: ToolCatalogEntry[];
  anomalies?: AnomalySummary[];
  history?: Record<string, ItemHistoryEntry[]>;
}

const DEFAULT_PROVIDERS: ProviderInfo[] = [
  { slug: 'anthropic', name: 'Anthropic', keyShape: 'sk-ant-*', console_url: 'https://console.anthropic.com/settings/keys' },
  { slug: 'openai',    name: 'OpenAI',    keyShape: 'sk-*',     console_url: 'https://platform.openai.com/api-keys' },
  { slug: 'gemini',    name: 'Google Gemini', keyShape: 'AIza*', console_url: 'https://aistudio.google.com/apikey' },
];

const DEFAULT_TOOLS: ToolCatalogEntry[] = [
  { name: 'claude-code', env_vars: ['ANTHROPIC_API_KEY'], provider_hints: ['anthropic'] },
  { name: 'cursor', env_vars: [], provider_hints: ['anthropic', 'openai'] },
  { name: 'hermes', env_vars: ['NEBIUS_API_KEY'], provider_hints: ['nebius'] },
  { name: 'aider', env_vars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'], provider_hints: ['anthropic', 'openai'] },
  { name: 'continue', env_vars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'], provider_hints: ['anthropic', 'openai'] },
];

export interface FakeDaemonHandle extends DaemonClient {
  /** Test-only: last exec call. */
  lastExec: {
    command: string[];
    provider_hint?: string;
    label?: string;
  } | null;
  /** Test-only: what exec should return next. Set to override behavior. */
  execResponse: {
    stdout: string;
    stderr: string;
    exit_code: number;
    duration_ms: number;
  };
  /** Test-only: whether an exec has been called. */
  execCalls: number;
}

export function createFakeDaemon(seed: FakeDaemonSeed = {}): FakeDaemonHandle {
  const providers = seed.providers ?? DEFAULT_PROVIDERS;
  const items: VaultItemSummary[] = seed.items ?? [];
  const grants: GrantSummary[] = seed.grants ?? [];
  const tools = seed.tools ?? DEFAULT_TOOLS;
  const anomalies = seed.anomalies ?? [];
  const history = seed.history ?? {};

  const handle: FakeDaemonHandle = {
    lastExec: null,
    execCalls: 0,
    execResponse: { stdout: '', stderr: '', exit_code: 0, duration_ms: 0 },

    async listProviders() {
      return providers.slice();
    },
    async listKeys(filter) {
      const p = filter?.provider;
      return p ? items.filter(i => i.provider === p) : items.slice();
    },
    async listGrants(filter) {
      let out = grants.slice();
      if (filter?.key_id) out = out.filter(g => g.key_id === filter.key_id);
      if (filter?.origin) out = out.filter(g => g.origin === filter.origin);
      return out;
    },
    async listTools() {
      return tools.slice();
    },
    async listAnomalies(since) {
      return since === undefined ? anomalies.slice() : anomalies.filter(a => a.detected_at >= since);
    },
    async itemHistory(keyId, limit) {
      const events = history[keyId] ?? [];
      const sorted = events.slice().sort((a, b) => b.ts - a.ts);
      return limit === undefined ? sorted : sorted.slice(0, limit);
    },

    async annotateItem(keyId, notes) {
      const it = items.find(i => i.id === keyId);
      if (!it) throw new Error('unknown_key');
      it.notes = notes.length === 0 ? undefined : notes;
      return { updated_at: 1_700_000_000_000 };
    },
    async revokeGrant(grantId) {
      const idx = grants.findIndex(g => g.id === grantId);
      if (idx < 0) throw new Error('unknown_grant');
      grants.splice(idx, 1);
      return { revoked_at: 1_700_000_000_000, in_flight_terminated: 0 };
    },
    async captureKey(provider, label) {
      return {
        capture_url: 'https://' + provider + '.example/keys/new',
        key_id_when_ready: 'k-pending-' + label,
      };
    },
    async rotateKey(keyId) {
      return { new_key_id: keyId + '-rotated', retired_key_id: keyId };
    },
    async exec(command, opts) {
      handle.lastExec = { command: command.slice(), provider_hint: opts.provider_hint, label: opts.label };
      handle.execCalls++;
      return { ...handle.execResponse };
    },
    async uriLintCheck(uri) {
      // Look up parsed provider + label in items.
      const m = /^moltypass:\/\/([^/]+)\/([^/]+)/.exec(uri) ?? /^multipass:\/\/([^/]+)\/([^/]+)/.exec(uri);
      if (!m) return { exists: false };
      const [, provider, labelRaw] = m;
      const label = decodeURIComponent(labelRaw);
      const found = items.find(i => i.provider === provider && i.label === label);
      return found ? { exists: true, key_id: found.id } : { exists: false };
    },
  };

  // Expose the underlying arrays as non-enumerable so tests can add items
  // mid-run without breaking closure captures.
  Object.defineProperty(handle, '_items', { value: items });
  Object.defineProperty(handle, '_grants', { value: grants });
  Object.defineProperty(handle, '_history', { value: history });

  return handle;
}

/**
 * A ready-to-use handle with representative fixtures. Used across tool tests
 * so each test doesn't repeat the same seed.
 */
export function standardFakeDaemon(): FakeDaemonHandle {
  return createFakeDaemon({
    items: [
      {
        id: 'k1',
        provider: 'anthropic',
        label: 'personal',
        notes: 'my main claude key',
        fingerprint: 'ab12',
        created_at: 1_700_000_000_000,
        last_used_at: 1_700_000_100_000,
        has_attachments: false,
      },
      {
        id: 'k2',
        provider: 'openai',
        label: 'work',
        fingerprint: 'cd34',
        created_at: 1_700_000_000_000,
        has_attachments: false,
      },
      {
        id: 'k3',
        provider: 'gemini',
        label: 'personal',
        fingerprint: 'ef56',
        created_at: 1_700_000_000_000,
        has_attachments: true,
      },
    ],
    grants: [
      {
        id: 'g1',
        key_id: 'k1',
        origin: 'https://claude.ai',
        mode: 'proxy',
        created_at: 1_700_000_000_000,
        calls_last_hour: 5,
        calls_total: 847,
      },
      {
        id: 'g2',
        key_id: 'k2',
        origin: 'https://cursor.sh',
        tool: 'cursor',
        mode: 'proxy',
        created_at: 1_700_000_000_000,
        calls_last_hour: 12,
        calls_total: 3128,
      },
    ],
    anomalies: [
      {
        id: 'a1',
        kind: 'volume_spike',
        key_id: 'k1',
        origin: 'https://internal-tool.acme',
        severity: 'high',
        message: '8,492 calls in the last hour vs baseline 140/hr',
        detected_at: 1_700_000_500_000,
      },
    ],
    history: {
      k1: [
        { ts: 1_700_000_000_000, kind: 'item.created', actor: 'user', detail: { captureMethod: 'create-detector' } },
        { ts: 1_700_000_100_000, kind: 'item.notes_updated', actor: 'user', detail: { notesLength: 18, hadNotesBefore: 0 } },
      ],
    },
  });
}
