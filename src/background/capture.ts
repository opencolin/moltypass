// Background "capture" channel handler. Receives a candidate string
// from a content script (detector banner, picker overlay, or context-
// menu Save) and routes it through:
//
//   1. Shape re-validation against the ANCHORED keyShape regex.
//      The content script's scan strips ^/$ to find substrings; we
//      re-check against the strict regex before going anywhere near
//      the vault.
//
//   2. Confirm popup. Capture always requires an explicit user click
//      — we never silently store something just because the user
//      happened to look at it.
//
//   3. On confirm: vault.addKey + audit.capture.
//
// SAFETY:
//   - sender.origin is the authoritative origin (never trust the page).
//   - Plaintext candidate lives only in this module's parameter scope
//     and the confirm popup's pending state. Never logged, never
//     returned to content scripts.

import type { ProviderId } from '../shared/types';
import { PROVIDERS, isProviderId } from '../shared/providers';
import { auditLog } from './audit-log';

export interface CaptureRequest {
  service: ProviderId;
  candidate: string;
  /** From the page DOM — informational, not trusted. */
  sourceUrl?: string;
  /** Which capture path triggered this. */
  method: 'create-detector' | 'picker' | 'right-click' | 'paste';
}

export interface CaptureResult {
  ok: boolean;
  reason?: 'shape_invalid' | 'unknown_service' | 'user_denied' | 'vault_locked' | 'internal';
  keyId?: string;
}

/** Callbacks the SW injects so capture.ts doesn't import vault/popup directly. */
export interface CaptureDeps {
  isVaultUnlocked(): boolean;
  /** Ask the user; returns the label to save under or null on deny. */
  askForConfirmation(args: {
    service: ProviderId;
    masked: string;
    sourceUrl?: string;
    method: CaptureRequest['method'];
  }): Promise<{ confirmed: boolean; label?: string }>;
  /** Save under the given label; returns the new vault entry id. */
  saveToVault(args: { service: ProviderId; label: string; apiKey: string }): Promise<string>;
}

export async function handleCapture(req: CaptureRequest, deps: CaptureDeps): Promise<CaptureResult> {
  if (!isProviderId(req.service)) return { ok: false, reason: 'unknown_service' };
  const provider = PROVIDERS[req.service];
  if (!provider.keyShape) return { ok: false, reason: 'shape_invalid' };
  if (!provider.keyShape.test(req.candidate)) return { ok: false, reason: 'shape_invalid' };

  if (!deps.isVaultUnlocked()) return { ok: false, reason: 'vault_locked' };

  const masked = maskCandidate(req.candidate);
  const confirm = await deps.askForConfirmation({
    service: req.service,
    masked,
    sourceUrl: req.sourceUrl,
    method: req.method,
  });
  if (!confirm.confirmed || !confirm.label) {
    return { ok: false, reason: 'user_denied' };
  }

  let keyId: string;
  try {
    keyId = await deps.saveToVault({
      service: req.service,
      label: confirm.label,
      apiKey: req.candidate,
    });
  } catch {
    return { ok: false, reason: 'internal' };
  }

  // Emit audit. NEVER pass req.candidate or any derivative into meta.
  await auditLog.capture({
    service: req.service,
    keyId,
    method: req.method,
    sourceUrl: req.sourceUrl,
  });

  return { ok: true, keyId };
}

/** Show the first 8 and last 4 characters; mask the middle. */
export function maskCandidate(candidate: string): string {
  if (candidate.length <= 14) return '*'.repeat(candidate.length);
  return `${candidate.slice(0, 8)}…${candidate.slice(-4)}`;
}
