// Key rotation: mint a new vault entry for the same provider, mirror
// every grant from the old keyId to the new one, then drop the old
// vault entry and bump the revocation epoch.
//
// Crash safety: write-new + mirror-grants BEFORE delete-old. If the SW
// dies between any of those steps, we leave duplicates rather than
// strand the only copy of the secret. A subsequent rotation can sweep
// the duplicates.
//
// Council T+1: rotation reuses the revocation epoch — bumping the
// epoch on rotation completion invalidates any in-flight proxy call
// referencing the old keyId so callers don't get a 200 stamped with
// the rotated-away credential.

import type { OriginPermission, ProviderId } from '../shared/types';
import { bumpEpoch } from './revocation';
import { auditLog } from './audit-log';

/** DI dependencies so rotation.ts can be unit-tested without coupling
 *  to chrome.storage and the live vault. */
export interface RotationDeps {
  vault: {
    getEntry(keyId: string): Promise<{ id: string; service: ProviderId; label: string } | null>;
    getKeyPlaintext(keyId: string): Promise<string>;
    addKey(service: ProviderId, label: string, plaintext: string): Promise<string /* newKeyId */>;
    removeKey(keyId: string): Promise<void>;
  };
  permissions: {
    listByKey(keyId: string): Promise<OriginPermission[]>;
    grant(perm: OriginPermission): Promise<void>;
  };
  /** crypto.randomUUID injection so tests can produce deterministic grantIds. */
  newGrantId?: () => string;
}

export interface RotationResult {
  oldKeyId: string;
  newKeyId: string;
  /** Number of grants mirrored from old to new. */
  mirroredGrants: number;
  /** Origins affected — the popup uses this to surface a notice. */
  origins: string[];
}

/**
 * Atomic-ish rotation. The ordering is:
 *   1. read old entry + plaintext
 *   2. addKey(newKeyId)   <- new copy now exists alongside old
 *   3. mirror grants      <- both keys now usable by their origins
 *   4. removeKey(oldKeyId)
 *   5. bumpEpoch          <- invalidate any in-flight proxy calls
 *
 * If we crash between 4 and 5, the next boot will see grants pointing
 * at a deleted keyId and fail-closed (proxy.ts will throw on
 * getKeyPlaintext). That's acceptable — we'd rather fail than serve.
 */
export async function rotateKey(
  oldKeyId: string,
  newLabelSuffix: string,
  newPlaintext: string,
  deps: RotationDeps,
): Promise<RotationResult> {
  const oldEntry = await deps.vault.getEntry(oldKeyId);
  if (!oldEntry) throw new Error(`rotate: key ${oldKeyId} not found`);

  // Step 1+2: write the new entry first. Use a label that ties it to
  // the old one for user clarity in the popup.
  const newLabel = newLabelSuffix
    ? `${oldEntry.label}-${newLabelSuffix}`
    : oldEntry.label;
  const newKeyId = await deps.vault.addKey(oldEntry.service, newLabel, newPlaintext);

  // Step 3: mirror grants. Preserve mode + expiry. Reset callsUsed to 0
  // so the new key starts with a clean usage tab. Generate a fresh
  // grantId so audit log + UI can clearly distinguish "rotated grant"
  // from a continuation of the prior grant.
  const oldGrants = await deps.permissions.listByKey(oldKeyId);
  const mintGrantId = deps.newGrantId ?? (() => crypto.randomUUID());
  const origins: string[] = [];
  for (const old of oldGrants) {
    const mirrored: OriginPermission = {
      ...old,
      grantId: mintGrantId(),
      keyId: newKeyId,
      callsUsed: 0,
      grantedAt: Date.now(),
    };
    await deps.permissions.grant(mirrored);
    origins.push(old.origin);
  }

  // Step 4: drop the old vault entry. Existing grants that still point
  // at it (there should be none after step 3) will fail-closed on
  // getKeyPlaintext, which is the correct behavior.
  await deps.vault.removeKey(oldKeyId);

  // Step 5: epoch bump invalidates anything in flight that was using
  // the OLD keyId. Mirrored grants get a fresh epoch on their next call.
  await bumpEpoch();

  await auditLog.rotate({
    oldKeyId,
    newKeyId,
    affectedGrants: oldGrants.length,
    meta: { origins: origins.join(',').slice(0, 200) },
  });

  return {
    oldKeyId,
    newKeyId,
    mirroredGrants: oldGrants.length,
    origins,
  };
}
