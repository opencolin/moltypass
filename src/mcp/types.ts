// Shared types for the MCP server layer. Kept separate from the tool
// implementations so the daemon-client and the fake-daemon can share them.

export interface ProviderInfo {
  slug: string;
  name: string;
  keyShape: string;
  console_url: string;
}

export interface VaultItemSummary {
  id: string;
  provider: string;
  label: string;
  notes?: string;
  fingerprint: string;
  created_at: number;
  last_used_at?: number;
  has_attachments: boolean;
}

export interface GrantSummary {
  id: string;
  key_id: string;
  origin: string;
  tool?: string;
  mode: 'proxy' | 'reveal';
  created_at: number;
  expires_at?: number;
  calls_last_hour: number;
  calls_total: number;
}

export interface ToolCatalogEntry {
  name: string;
  env_vars: string[];
  provider_hints: string[];
}

export interface AnomalySummary {
  id: string;
  kind: string;
  key_id: string;
  origin: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  detected_at: number;
}

export interface ItemHistoryEntry {
  ts: number;
  kind: string;
  actor: string;
  detail: Record<string, string | number>;
}

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  redactions: {
    stdout_count: number;
    stderr_count: number;
    providers: string[];
  };
}

export interface UriLintResult {
  valid_syntax: boolean;
  syntax_error?: string;
  exists: boolean;
  key_id?: string;
}

/** Minimal contract the MCP tools use to talk to the vault daemon. */
export interface DaemonClient {
  listProviders(): Promise<ProviderInfo[]>;
  listKeys(filter?: { provider?: string }): Promise<VaultItemSummary[]>;
  listGrants(filter?: { key_id?: string; origin?: string }): Promise<GrantSummary[]>;
  listTools(): Promise<ToolCatalogEntry[]>;
  listAnomalies(since?: number): Promise<AnomalySummary[]>;
  itemHistory(keyId: string, limit?: number): Promise<ItemHistoryEntry[]>;
  annotateItem(keyId: string, notes: string): Promise<{ updated_at: number }>;
  revokeGrant(grantId: string): Promise<{ revoked_at: number; in_flight_terminated: number }>;
  captureKey(provider: string, label: string, notes?: string): Promise<{ capture_url: string; key_id_when_ready: string }>;
  rotateKey(keyId: string, newKeyFromCapture?: string): Promise<{ new_key_id: string; retired_key_id: string }>;
  exec(command: string[], opts: { provider_hint?: string; label?: string; cwd?: string; timeout_ms?: number }): Promise<{
    stdout: string;
    stderr: string;
    exit_code: number;
    duration_ms: number;
  }>;
  uriLintCheck(uri: string): Promise<{ exists: boolean; key_id?: string }>;
}
