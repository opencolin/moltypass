// Runs in the page's MAIN world. Exposes window.moltypass.
// Communicates with the content script via window.postMessage; the
// content script bridges to the background service worker.
//
// Sites use this like:
//
//   await window.moltypass.connect('anthropic');
//   const res = await window.moltypass.request({
//     service: 'anthropic',
//     path: '/v1/messages',
//     method: 'POST',
//     body: { model: 'claude-opus-4-7', messages: [...] }
//   });
//
// The API key never enters this scope. The site only sees `res`.

import type { InpageRequest, InpageResponse, ProviderId } from '../shared/types';

interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

interface MoltypassProvider {
  readonly isMoltypass: true;
  readonly version: string;
  listServices(): Promise<ProviderId[]>;
  isConnected(service: ProviderId): Promise<boolean>;
  connect(service: ProviderId): Promise<{ connected: boolean; service: ProviderId }>;
  request(args: {
    service: ProviderId;
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<ProxyResponse>;
  // A drop-in fetch shim that targets a specific service. Lets SDKs
  // (Anthropic, OpenAI) be passed `fetch: window.moltypass.fetchFor('anthropic')`.
  fetchFor(service: ProviderId): typeof fetch;
  // Last-resort key reveal. Requires fresh consent every call.
  revealKey(service: ProviderId, reason?: string): Promise<{ apiKey: string; header: string }>;
}

declare global {
  interface Window {
    moltypass?: MoltypassProvider;
  }
}

const pending = new Map<string, (response: InpageResponse) => void>();

window.addEventListener('message', event => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.__moltypass !== 'response') return;
  const resp = data.payload as InpageResponse;
  const resolver = pending.get(resp.id);
  if (!resolver) return;
  pending.delete(resp.id);
  resolver(resp);
});

function send<T>(req: Omit<InpageRequest, 'id'>): Promise<T> {
  const id =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, response => {
      if (response.ok) resolve(response.data as T);
      else {
        const e = new Error(response.error.message) as Error & { code: string };
        e.code = response.error.code;
        reject(e);
      }
    });
    window.postMessage(
      { __moltypass: 'request', payload: { ...req, id } as InpageRequest },
      window.location.origin,
    );
  });
}

const provider: MoltypassProvider = {
  isMoltypass: true,
  version: '0.0.1',

  listServices: () => send({ kind: 'list-services' }),

  isConnected: service =>
    send<{ connected: boolean }>({ kind: 'is-connected', service }).then(r => r.connected),

  connect: service => send({ kind: 'connect', service }),

  request: ({ service, path, method = 'POST', headers, body }) =>
    send({ kind: 'proxy', service, path, method, headers, body }),

  fetchFor: service => async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url, window.location.href);
    const method = init?.method ?? 'POST';
    const headers = headersToObject(init?.headers);
    const body = await readBody(init?.body);
    const result = await provider.request({
      service,
      path: u.pathname + u.search,
      method,
      headers,
      body,
    });
    return new Response(result.body, { status: result.status, headers: result.headers });
  },

  revealKey: (service, reason) => send({ kind: 'reveal', service, reason }),
};

function headersToObject(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(h)) return Object.fromEntries(h);
  return { ...h };
}

async function readBody(body: BodyInit | null | undefined): Promise<unknown> {
  if (body == null) return undefined;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  // Blobs, FormData, streams: out of scope for the sketch. The fetchFor
  // shim is intentionally limited to JSON requests.
  throw new Error('moltypass.fetchFor only supports string/JSON bodies in this sketch');
}

Object.defineProperty(window, 'moltypass', {
  value: provider,
  writable: false,
  configurable: false,
});

window.dispatchEvent(new Event('moltypass#initialized'));
