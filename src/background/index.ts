// Service worker entry: routes inpage messages and consent UI messages.
// Origin is always taken from MessageSender, never the page payload.

import type {
  InpageRequest,
  InpageResponse,
  MoltypassError,
  ProviderId,
  ConsentResolution,
} from '../shared/types';
import { PROVIDERS, isProviderId, listProviders } from '../shared/providers';
import * as vault from './vault';
import * as permissions from './permissions';
import { askForConsent, getPendingRequest, resolveConsent } from './consent';
import { proxyRequest } from './proxy';
import { handlePopup } from './popup-handler';

// ----- Inpage / content-script channel -----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.channel === 'inpage') {
    handleInpage(msg.payload as InpageRequest, sender)
      .then(sendResponse)
      .catch(err => sendResponse(internalError(msg.payload?.id, err)));
    return true; // async
  }
  if (msg?.channel === 'consent') {
    handleConsentUi(msg.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.channel === 'popup') {
    handlePopup(msg.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});

async function handleInpage(
  msg: InpageRequest,
  sender: chrome.runtime.MessageSender,
): Promise<InpageResponse> {
  const origin = senderOrigin(sender);
  if (!origin) return err(msg.id, 'internal', 'Could not determine sender origin');

  try {
    switch (msg.kind) {
      case 'list-services':
        return { id: msg.id, ok: true, data: listProviders() };

      case 'is-connected': {
        if (!isProviderId(msg.service)) return err(msg.id, 'unknown_service', msg.service);
        const perm = await permissions.getPermission(origin, msg.service);
        return { id: msg.id, ok: true, data: { connected: perm !== null } };
      }

      case 'connect':
        return await handleConnect(msg.id, origin, msg.service);

      case 'proxy':
        return await handleProxy(msg.id, origin, msg);

      case 'reveal':
        return await handleReveal(msg.id, origin, msg.service);
    }
  } catch (e) {
    return internalError(msg.id, e);
  }
}

async function handleConnect(id: string, origin: string, service: ProviderId): Promise<InpageResponse> {
  if (!isProviderId(service)) return err(id, 'unknown_service', service);

  const existing = await permissions.getPermission(origin, service);
  if (existing) return { id, ok: true, data: { connected: true, service } };

  if (!vault.isUnlocked()) return err(id, 'vault_locked', 'Open Moltypass to unlock the vault');

  const resolution = await askForConsent({ origin, service, requestedMode: 'proxy' });
  if (!resolution.granted || !resolution.keyId || !resolution.mode) {
    return err(id, 'user_denied', 'User denied access');
  }
  await permissions.grant({
    grantId: crypto.randomUUID(),
    origin,
    service,
    keyId: resolution.keyId,
    mode: resolution.mode,
    grantedAt: Date.now(),
    expiresAt: resolution.expiresInMs ? Date.now() + resolution.expiresInMs : undefined,
    callsAllowed: resolution.callsAllowed,
    callsUsed: 0,
  });
  return { id, ok: true, data: { connected: true, service } };
}

async function handleProxy(
  id: string,
  origin: string,
  msg: Extract<InpageRequest, { kind: 'proxy' }>,
): Promise<InpageResponse> {
  if (!isProviderId(msg.service)) return err(id, 'unknown_service', msg.service);

  let perm = await permissions.getPermission(origin, msg.service);
  if (!perm) {
    if (!vault.isUnlocked()) return err(id, 'vault_locked', 'Open Moltypass to unlock the vault');
    const resolution = await askForConsent({
      origin,
      service: msg.service,
      pathPreview: msg.path,
      bodyPreview: msg.body ? safePreview(msg.body) : undefined,
      requestedMode: 'proxy',
    });
    if (!resolution.granted || !resolution.keyId || !resolution.mode) {
      return err(id, 'user_denied', 'User denied access');
    }
    perm = {
      grantId: crypto.randomUUID(),
      origin,
      service: msg.service,
      keyId: resolution.keyId,
      mode: resolution.mode,
      grantedAt: Date.now(),
      expiresAt: resolution.expiresInMs ? Date.now() + resolution.expiresInMs : undefined,
      callsAllowed: resolution.callsAllowed,
      callsUsed: 0,
    };
    await permissions.grant(perm);
  }

  if (perm.mode !== 'proxy') {
    return err(id, 'not_connected', `${origin} has reveal-mode access, not proxy`);
  }

  await vault.touchActivity();
  const response = await proxyRequest(
    msg.service,
    perm.keyId,
    msg.path,
    msg.method,
    msg.headers ?? {},
    msg.body,
  );
  await permissions.recordUsage(origin, msg.service);

  return { id, ok: true, data: response };
}

async function handleReveal(id: string, origin: string, service: ProviderId): Promise<InpageResponse> {
  // Reveal mode requires fresh consent every time. We never persist a
  // long-lived "always reveal" grant — too easy to footgun.
  if (!isProviderId(service)) return err(id, 'unknown_service', service);
  if (!vault.isUnlocked()) return err(id, 'vault_locked', 'Open Moltypass to unlock the vault');

  const resolution = await askForConsent({
    origin,
    service,
    requestedMode: 'reveal',
  });
  if (!resolution.granted || !resolution.keyId) {
    return err(id, 'user_denied', 'User denied reveal');
  }
  const plaintext = await vault.getKeyPlaintext(resolution.keyId);
  return { id, ok: true, data: { apiKey: plaintext, header: PROVIDERS[service].authHeader } };
}

// ----- Consent UI channel -----

async function handleConsentUi(payload: { kind: string; id: string; resolution?: ConsentResolution }) {
  switch (payload.kind) {
    case 'fetch':
      return { ok: true, request: await getPendingRequest(payload.id) };
    case 'resolve':
      if (!payload.resolution) throw new Error('missing resolution');
      await resolveConsent(payload.id, payload.resolution);
      return { ok: true };
    default:
      throw new Error(`unknown consent op: ${payload.kind}`);
  }
}

// ----- Helpers -----

function senderOrigin(sender: chrome.runtime.MessageSender): string | null {
  if (sender.origin) return sender.origin;
  if (sender.url) {
    try {
      return new URL(sender.url).origin;
    } catch {
      return null;
    }
  }
  return null;
}

function safePreview(body: unknown): string {
  try {
    const s = typeof body === 'string' ? body : JSON.stringify(body);
    return s.length > 500 ? s.slice(0, 500) + '…' : s;
  } catch {
    return '[unserializable]';
  }
}

function err(id: string, code: MoltypassError['code'], message: string): InpageResponse {
  return { id, ok: false, error: { code, message } };
}

function internalError(id: string | undefined, e: unknown): InpageResponse {
  return {
    id: id ?? 'unknown',
    ok: false,
    error: { code: 'internal', message: e instanceof Error ? e.message : String(e) },
  };
}
