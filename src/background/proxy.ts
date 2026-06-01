// The fetch proxy. Background fetches upstream with the user's key and
// returns the response body+headers to the caller. The key never crosses
// back into the page.
//
// NOTE: streaming (SSE for chat completions) needs chrome.runtime.connect
// with a Port to chunk responses back. Sketched as a separate path in
// proxyRequestStreaming — not used by the basic request kind.

import type { ProviderId } from '../shared/types';
import { PROVIDERS } from '../shared/providers';
import { getKeyPlaintext } from './vault';
import { auditLog } from './audit-log';
import {
  readEpoch,
  registerInFlight,
  unregisterInFlight,
  RevokedError,
} from './revocation';

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  latencyMs: number;
}

/** Context fields the audit log records about a proxy call. Origin
 *  comes from sender.origin in the message router; never the page. */
export interface ProxyAuditContext {
  origin: string;
  grantId?: string;
  keyFingerprint?: string;
  keyLabel?: string;
}

export async function proxyRequest(
  service: ProviderId,
  keyId: string,
  path: string,
  method: string,
  pageHeaders: Record<string, string> = {},
  body?: unknown,
  audit?: ProxyAuditContext,
): Promise<ProxyResponse> {
  const provider = PROVIDERS[service];
  if (!provider) throw new Error(`Unknown service: ${service}`);

  // Path validation: must start with '/' and not be an absolute URL.
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('path must be a relative path starting with "/"');
  }

  const apiKey = await getKeyPlaintext(keyId);
  const authValue = provider.authPrefix ? `${provider.authPrefix}${apiKey}` : apiKey;

  // Page-supplied headers are scrubbed: we strip anything that could be
  // used to exfiltrate (cookies, auth) and force our own auth.
  const safeHeaders = scrubHeaders(pageHeaders);
  safeHeaders[provider.authHeader] = authValue;
  if (!('content-type' in safeHeaders)) safeHeaders['content-type'] = 'application/json';

  const url = `${provider.apiBaseUrl}${path}`;
  const requestBody = body !== undefined ? JSON.stringify(body) : undefined;
  const bytesUp = requestBody?.length ?? 0;
  const startedAt = Date.now();

  // Revocation guard: read the epoch before the fetch. After the
  // response resolves we re-read; mismatch means the user (or rotateKey)
  // revoked the grant while the call was in flight, and we must NOT
  // surface the response to the page.
  const epochBefore = await readEpoch();
  const abortCtrl = new AbortController();
  const grantId = audit?.grantId;
  if (grantId) registerInFlight(grantId, abortCtrl);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: safeHeaders,
      body: requestBody,
      credentials: 'omit',
      signal: abortCtrl.signal,
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    if (grantId) unregisterInFlight(grantId, abortCtrl);
    // If abort was triggered by a revoke (epoch changed), surface
    // RevokedError instead of the underlying AbortError — callers
    // distinguish revocation from network failure.
    if (abortCtrl.signal.aborted && (await readEpoch()) !== epochBefore) {
      if (audit) {
        void auditLog.proxyError({
          ...audit, service, keyId, status: 0, pathPreview: path,
          latencyMs, bytesUp, bytesDown: 0, error: 'revoked',
        });
      }
      throw new RevokedError(grantId);
    }
    if (audit) {
      void auditLog.proxyError({
        ...audit,
        service,
        keyId,
        status: 0,
        pathPreview: path,
        latencyMs,
        bytesUp,
        bytesDown: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }

  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => { headers[key] = value; });
  const text = await res.text();
  const latencyMs = Date.now() - startedAt;
  const bytesDown = text.length;

  if (grantId) unregisterInFlight(grantId, abortCtrl);

  // Post-fetch revocation check: epoch changed between the call start
  // and the response arrival. Refuse to return the response.
  const epochAfter = await readEpoch();
  if (epochAfter !== epochBefore) {
    if (audit) {
      void auditLog.proxyError({
        ...audit, service, keyId, status: res.status, pathPreview: path,
        latencyMs, bytesUp, bytesDown, error: 'revoked',
      });
    }
    throw new RevokedError(grantId);
  }

  if (audit) {
    if (res.status < 400) {
      void auditLog.proxyOk({
        ...audit,
        service,
        keyId,
        status: res.status,
        pathPreview: path,
        latencyMs,
        bytesUp,
        bytesDown,
      });
    } else {
      void auditLog.proxyError({
        ...audit,
        service,
        keyId,
        status: res.status,
        pathPreview: path,
        latencyMs,
        bytesUp,
        bytesDown,
      });
    }
  }

  return { status: res.status, headers, body: text, latencyMs };
}

const HEADER_DENYLIST = new Set([
  'authorization',
  'x-api-key',
  'x-goog-api-key',
  'cookie',
  'host',
  'origin',
  'referer',
]);

function scrubHeaders(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (HEADER_DENYLIST.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}
