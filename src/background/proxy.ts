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

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export async function proxyRequest(
  service: ProviderId,
  keyId: string,
  path: string,
  method: string,
  pageHeaders: Record<string, string> = {},
  body?: unknown,
): Promise<ProxyResponse> {
  const provider = PROVIDERS[service];
  if (!provider) throw new Error(`Unknown service: ${service}`);

  const apiKey = await getKeyPlaintext(keyId);
  const authValue = provider.authPrefix ? `${provider.authPrefix}${apiKey}` : apiKey;

  // Page-supplied headers are scrubbed: we strip anything that could be
  // used to exfiltrate (cookies, auth) and force our own auth.
  const safeHeaders = scrubHeaders(pageHeaders);
  safeHeaders[provider.authHeader] = authValue;
  if (!('content-type' in safeHeaders)) safeHeaders['content-type'] = 'application/json';

  // Path validation: must start with '/' and not be an absolute URL.
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('path must be a relative path starting with "/"');
  }
  const url = `${provider.apiBaseUrl}${path}`;

  const res = await fetch(url, {
    method,
    headers: safeHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Don't leak page cookies upstream — fetch from SW doesn't include
    // them by default, but be explicit.
    credentials: 'omit',
  });

  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return { status: res.status, headers, body: await res.text() };
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
