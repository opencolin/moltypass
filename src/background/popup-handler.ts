// Popup -> background channel. Manages the vault and surfaces grants.

import type { ProviderId, SharingLedgerEntry } from '../shared/types';
import { PROVIDERS, isProviderId } from '../shared/providers';
import * as vault from './vault';
import * as permissions from './permissions';

type PopupMessage =
  | { kind: 'status' }
  | { kind: 'unlock'; password: string }
  | { kind: 'lock' }
  | { kind: 'initialize'; password: string }
  | { kind: 'list-keys' }
  | { kind: 'add-key'; service: ProviderId; label: string; apiKey: string }
  | { kind: 'remove-key'; id: string }
  | { kind: 'list-permissions' }
  | { kind: 'list-sharing-ledger' }
  | { kind: 'revoke'; origin: string; service: ProviderId };

export async function handlePopup(msg: PopupMessage): Promise<unknown> {
  switch (msg.kind) {
    case 'status':
      return {
        ok: true,
        unlocked: vault.isUnlocked(),
        initialized: await vault.isInitialized(),
      };

    case 'initialize':
      await vault.initialize(msg.password);
      return { ok: true };

    case 'unlock': {
      const ok = await vault.unlock(msg.password);
      return { ok };
    }

    case 'lock':
      vault.lock();
      return { ok: true };

    case 'list-keys':
      return { ok: true, entries: await vault.listEntries() };

    case 'add-key': {
      if (!isProviderId(msg.service)) throw new Error('unknown service');
      // Advisory shape validation — warn the user via the popup UI; do
      // not refuse, since providers occasionally change key prefixes.
      const shape = PROVIDERS[msg.service].keyShape;
      const warning = shape && !shape.test(msg.apiKey) ? 'shape-mismatch' : null;
      const entry = await vault.addKey(msg.service, msg.label, msg.apiKey);
      return { ok: true, entry, warning };
    }

    case 'remove-key':
      await vault.removeKey(msg.id);
      return { ok: true };

    case 'list-permissions':
      return { ok: true, permissions: await permissions.listAll() };

    case 'list-sharing-ledger':
      return { ok: true, entries: await buildSharingLedger() };

    case 'revoke':
      await permissions.revoke(msg.origin, msg.service);
      return { ok: true };
  }
}

async function buildSharingLedger(): Promise<SharingLedgerEntry[]> {
  const [perms, entries] = await Promise.all([
    permissions.listAll(),
    vault.listEntries(),
  ]);
  const byKey = new Map(entries.map(e => [e.id, e]));
  return perms.map(p => ({
    grantId: p.grantId,
    origin: p.origin,
    service: p.service,
    keyId: p.keyId,
    keyLabel: byKey.get(p.keyId)?.label ?? '(deleted)',
    mode: p.mode,
    grantedAt: p.grantedAt,
    lastUsedAt: p.lastUsedAt,
    callsUsed: p.callsUsed,
    expiresAt: p.expiresAt,
  }));
}
