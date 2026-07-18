// Wire protocol for Native Messaging between three actors:
//
//   1. The Chrome extension's background SW
//   2. The Moltypass native helper daemon (the vault owner)
//   3. The `moltypass` CLI binary
//
// The extension talks to the helper via chrome.runtime.connectNative.
// The CLI talks to the helper via a local Unix socket / Named Pipe.
// Both speak the same JSON shapes — only the transport differs.
//
// Native Messaging on Chrome wraps each message in a 4-byte
// little-endian length prefix, then the JSON UTF-8 bytes. We expose
// the encode/decode helpers here so the daemon and the CLI can share
// the framing logic.

import type { ProviderId } from './providers';

// ----- shared envelope -----

export type RequestId = string;

export interface BaseRequest<K extends string> {
  /** Caller-generated correlation id. Helper echoes it on reply. */
  id: RequestId;
  kind: K;
}

export interface BaseResponse<K extends string> {
  id: RequestId;
  kind: K;
  ok: true;
}

export interface ErrorResponse {
  id: RequestId;
  ok: false;
  error: {
    code: NativeErrorCode;
    message: string;
  };
}

export type NativeErrorCode =
  | 'vault_locked'
  | 'wrong_password'
  | 'unknown_provider'
  | 'no_key'
  | 'user_denied'
  | 'touch_id_failed'
  | 'process_failed'
  | 'internal'
  | 'unknown_request';

// ----- requests (client -> helper) -----

/** Probe — is the daemon reachable? Returns version. */
export interface PingRequest extends BaseRequest<'ping'> {}
export interface PingResponse extends BaseResponse<'ping'> {
  helperVersion: string;
  vaultUnlocked: boolean;
  /** ms epoch when the vault will idle-lock if no activity. 0 when locked. */
  idleLockAt: number;
}

/** Unlock the vault. The native helper handles Touch ID prompt before
 *  falling back to password. password is optional — if absent, the
 *  helper attempts biometry only. */
export interface UnlockRequest extends BaseRequest<'unlock'> {
  password?: string;
  /** Set true to skip biometry (force password). Default false. */
  noBiometry?: boolean;
}
export interface UnlockResponse extends BaseResponse<'unlock'> {
  vaultUnlocked: true;
  idleLockAt: number;
  /** Which path actually unlocked us: 'touchid' | 'hello' | 'polkit'
   *  | 'password'. UI displays a confirming line ("Unlocked with Touch ID"). */
  method: 'touchid' | 'hello' | 'polkit' | 'password';
}

/** Lock immediately. Always succeeds. */
export interface LockRequest extends BaseRequest<'lock'> {}
export interface LockResponse extends BaseResponse<'lock'> {}

/** List configured providers. Does NOT require vault to be unlocked
 *  — only metadata is returned. */
export interface ListProvidersRequest extends BaseRequest<'listProviders'> {}
export interface ListProvidersResponse extends BaseResponse<'listProviders'> {
  providers: Array<{
    id: ProviderId;
    /** Number of keys stored for this provider. */
    keyCount: number;
    /** Human label suggestions: 'personal' | 'work' | 'default' etc. */
    labels: string[];
  }>;
}

/** Get a key for the calling context. Requires unlock + per-caller
 *  consent. The helper enforces consent + audit; the caller just
 *  receives the plaintext. */
export interface GetKeyRequest extends BaseRequest<'getKey'> {
  provider: ProviderId;
  /** Optional preferred label. Helper falls back to picker if
   *  ambiguous and the caller is interactive. */
  label?: string;
  /** Who's asking. The helper uses this for consent + audit. */
  caller: CallerInfo;
}
export interface GetKeyResponse extends BaseResponse<'getKey'> {
  /** Plaintext key. The caller must zero it ASAP. */
  plaintext: string;
  /** Stable grant id the caller can include in subsequent calls. */
  grantId: string;
  /** Auth header the upstream provider expects (so the caller doesn't
   *  have to know the convention per provider). */
  authHeader: string;
  /** Prefix to prepend to the plaintext (e.g. 'Bearer ' for OpenAI). */
  authPrefix?: string;
}

/** CLI-only: spawn a subprocess with injected env vars and audited
 *  ownership. The helper detects providers from the command argv,
 *  prompts for Touch ID if needed, and returns the env vars to set
 *  (the caller's process actually does the spawn — the helper does
 *  not fork children itself). */
export interface ResolveExecEnvRequest extends BaseRequest<'resolveExecEnv'> {
  /** argv[0..] as the user typed it (e.g. ['hermes', 'ai', 'chat']). */
  argv: string[];
  /** Process cwd — used for project-local hints (.env.example sniffing). */
  cwd: string;
  /** Bypass tool-aware detection; only inject these providers. */
  forceProviders?: ProviderId[];
}
export interface ResolveExecEnvResponse extends BaseResponse<'resolveExecEnv'> {
  /** Env vars to inject into the subprocess. Caller-managed scope. */
  env: Record<string, string>;
  /** Grant id(s) created — caller passes back on `recordExecResult`. */
  grantIds: string[];
  /** Providers detected. Surfaces in any 'first time we see this' UI. */
  providers: ProviderId[];
}

/** Audit closer for resolveExecEnv. Records exit code + duration so
 *  the dashboard shows what happened to the spawned process. */
export interface RecordExecResultRequest extends BaseRequest<'recordExecResult'> {
  grantIds: string[];
  exitCode: number;
  durationMs: number;
}
export interface RecordExecResultResponse extends BaseResponse<'recordExecResult'> {}

/** Caller identification. The helper uses this for consent prompts
 *  ('cursor.sh wants to use…') and audit attribution. */
export type CallerInfo =
  | { kind: 'extension'; origin: string }
  | { kind: 'cli'; argv0: string; cwd: string }
  | { kind: 'menu-bar'; appVersion: string };

// ----- server-pushed events (helper -> clients) -----

export interface VaultLockedEvent {
  kind: 'vaultLocked';
  reason: 'idle' | 'manual' | 'startup';
}

export interface VaultUnlockedEvent {
  kind: 'vaultUnlocked';
  method: UnlockResponse['method'];
  idleLockAt: number;
}

export type NativeEvent = VaultLockedEvent | VaultUnlockedEvent;

// ----- discriminated unions over the whole protocol -----

export type NativeRequest =
  | PingRequest
  | UnlockRequest
  | LockRequest
  | ListProvidersRequest
  | GetKeyRequest
  | ResolveExecEnvRequest
  | RecordExecResultRequest;

export type NativeResponse =
  | PingResponse
  | UnlockResponse
  | LockResponse
  | ListProvidersResponse
  | GetKeyResponse
  | ResolveExecEnvResponse
  | RecordExecResultResponse;

export type NativeMessage = NativeResponse | ErrorResponse | NativeEvent;

// ----- framing (Chrome Native Messaging spec + Unix socket parity) -----

/**
 * Encode a JSON value into the Native Messaging wire format:
 * 4-byte little-endian length || UTF-8 JSON body.
 */
export function encodeFrame(value: unknown): Uint8Array {
  const json = JSON.stringify(value);
  const body = new TextEncoder().encode(json);
  if (body.length > 0xffffffff) {
    throw new Error('encodeFrame: message exceeds 4-byte length limit');
  }
  const out = new Uint8Array(4 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length, /* littleEndian */ true);
  out.set(body, 4);
  return out;
}

/**
 * Decode a single frame from a buffer. Returns { value, consumed }
 * where consumed is the number of bytes used, OR null if the buffer
 * doesn't yet hold a full frame.
 *
 * Callers drive a stream by appending bytes to a rolling buffer,
 * calling decodeFrame, and slicing off `consumed` on success.
 */
export function decodeFrame(buffer: Uint8Array): { value: unknown; consumed: number } | null {
  if (buffer.length < 4) return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const len = view.getUint32(0, /* littleEndian */ true);
  if (buffer.length < 4 + len) return null;
  const body = buffer.subarray(4, 4 + len);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch (err) {
    throw new Error(`decodeFrame: bad JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { value, consumed: 4 + len };
}

/** Type guards — discriminate by the `kind` tag. */
export function isErrorResponse(msg: unknown): msg is ErrorResponse {
  return typeof msg === 'object' && msg !== null && 'ok' in msg && (msg as { ok: unknown }).ok === false;
}

export function isEvent(msg: unknown): msg is NativeEvent {
  if (typeof msg !== 'object' || msg === null) return false;
  const k = (msg as { kind?: unknown }).kind;
  return k === 'vaultLocked' || k === 'vaultUnlocked';
}
