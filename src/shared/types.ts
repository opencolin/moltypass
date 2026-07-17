// Public API surface and internal protocol types.
// Everything the page can see, plus the message envelope used between
// inpage <-> content <-> background.

export type ProviderId = 'anthropic' | 'openai' | 'gemini';

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  apiBaseUrl: string;
  // Header where the API key lives upstream.
  authHeader: 'Authorization' | 'x-api-key' | 'x-goog-api-key';
  authPrefix?: string; // e.g. "Bearer " for OpenAI
  docsUrl: string;
  // Validates the user-pasted key shape before storing. Optional, advisory.
  keyShape?: RegExp;
  // Where the provider lets you create a new key. Used by the "Get new key" flow.
  createKeyUrl: string;
  // Step-by-step instructions surfaced in the popup before opening createKeyUrl.
  instructions: string[];
  // Plain-English prerequisites (billing, approval, etc.) shown alongside instructions.
  prerequisites?: string;
}

export type RequestId = string;

// ----- Wire protocol: inpage -> background -----

export type InpageRequest =
  | { id: RequestId; kind: 'list-services' }
  | { id: RequestId; kind: 'is-connected'; service: ProviderId }
  | { id: RequestId; kind: 'connect'; service: ProviderId }
  | {
      id: RequestId;
      kind: 'proxy';
      service: ProviderId;
      path: string;
      method: string;
      headers?: Record<string, string>;
      body?: unknown;
    }
  | {
      id: RequestId;
      kind: 'reveal';
      service: ProviderId;
      reason?: string;
    };

export type InpageResponse<T = unknown> =
  | { id: RequestId; ok: true; data: T }
  | { id: RequestId; ok: false; error: MoltypassError };

export interface MoltypassError {
  code:
    | 'vault_locked'
    | 'no_key_for_service'
    | 'user_denied'
    | 'not_connected'
    | 'rate_limited'
    | 'upstream_error'
    | 'unknown_service'
    | 'internal';
  message: string;
}

// ----- Storage shapes (background-only) -----

export interface VaultEntry {
  id: string;
  service: ProviderId;
  label: string; // user-friendly, e.g. "personal", "work"
  ciphertext: string; // base64(salt||iv||AES-GCM(plaintext-key))
  createdAt: number;
  /**
   * Optional encrypted notes, added in v2.1. base64(salt||iv||AES-GCM(notes)).
   * Missing on legacy entries — treat as empty. Uses the same master key as
   * `ciphertext`; separate blob so encoding stays backward-compatible.
   */
  notesCiphertext?: string;
  /**
   * ms since epoch when notes were last set. Undefined if notes never set.
   * Kept OUT of ciphertext so the dashboard can sort/list without unlock.
   */
  notesUpdatedAt?: number;
}

export type RedactedVaultEntry = Omit<VaultEntry, 'ciphertext' | 'notesCiphertext'> & {
  hasNotes: boolean;
};

export type ConsentMode = 'proxy' | 'reveal';

export interface OriginPermission {
  grantId: string; // stable id, survives mode/expiry changes
  origin: string;
  service: ProviderId;
  keyId: string;
  mode: ConsentMode;
  grantedAt: number;
  expiresAt?: number; // optional auto-expire
  callsAllowed?: number; // optional rate cap
  callsUsed: number;
  lastUsedAt?: number;
  lastStatus?: number;
}

// Joined view used by the sharing dashboard. Composes OriginPermission
// with the human-readable key label from the vault.
export interface SharingLedgerEntry {
  grantId: string;
  origin: string;
  service: ProviderId;
  keyId: string;
  keyLabel: string; // "(deleted)" if the underlying vault entry is gone
  mode: ConsentMode;
  grantedAt: number;
  lastUsedAt?: number;
  callsUsed: number;
  expiresAt?: number;
}

export interface ConsentRequest {
  origin: string;
  service: ProviderId;
  // Preview of what the page is about to send. Truncated.
  pathPreview?: string;
  bodyPreview?: string;
  // Reveal-mode is requested separately and gets a louder UI.
  requestedMode: ConsentMode;
}

export interface ConsentResolution {
  granted: boolean;
  keyId?: string;
  mode?: ConsentMode;
  expiresInMs?: number;
  callsAllowed?: number;
}

// ----- Audit log -----

export interface AuditEvent {
  ts: number;
  origin: string;
  service: ProviderId;
  kind: 'grant' | 'revoke' | 'proxy' | 'reveal' | 'denied';
  pathPreview?: string;
  status?: number;
}
