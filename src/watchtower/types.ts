// Watchtower for AI keys — types + config. 1P's Watchtower-for-Developers
// covers SSH keys only (weak/unencrypted/duplicate); this module covers the
// unclaimed lane of AI-provider keys.
//
// Each check is a pure function of (vault snapshot, grants snapshot,
// audit-log slice, optional filesystem) → Finding[]. Findings are metadata
// only; the framework never reads or emits key values.

import type { ProviderId, RedactedVaultEntry, OriginPermission } from '../shared/types';
import type { AuditEvent } from '../shared/audit-types';

export type WatchtowerCheckId =
  | 'stale.rotation'   // key not rotated in >N days
  | 'stale.unused'     // key with no use in >N days
  | 'grant.zombie'     // grant active with no traffic in >N days
  | 'disk.plaintext'   // key ALSO exists in a plaintext ~/.env
  | 'vault.duplicate'; // same fingerprint under two labels

export type WatchtowerSeverity = 'info' | 'low' | 'medium' | 'high';

export interface WatchtowerFinding {
  /** Stable id: same (check + target) always produces the same id. */
  id: string;
  check: WatchtowerCheckId;
  severity: WatchtowerSeverity;
  /** For key-scoped findings. */
  keyId?: string;
  /** For grant-scoped findings. */
  grantId?: string;
  /** One-line human-facing description. Safe to print — no plaintext. */
  message: string;
  detectedAt: number;
  /** User can silence dismissible findings via the dashboard. */
  dismissible: boolean;
  /** Check-specific detail. Never plaintext. */
  meta?: Record<string, string | number>;
}

/** File-system access used ONLY by disk.plaintext. Null in browser/SW. */
export interface WatchtowerFs {
  readTextFile: (path: string) => Promise<string>;
  listFiles: (dir: string, maxDepth: number) => Promise<string[]>;
  exists: (path: string) => Promise<boolean>;
  /** File size in bytes. Used to skip files >1 MiB (matches 1P's SSH scanner). */
  statSize: (path: string) => Promise<number>;
}

export interface WatchtowerInput {
  entries: RedactedVaultEntry[];
  grants: OriginPermission[];
  /** Typically last-90-days slice, provided by caller. */
  audit: AuditEvent[];
  /** ms since epoch; injected for deterministic tests. */
  now: number;
  fs?: WatchtowerFs;
  config: WatchtowerConfig;
  /**
   * Salted-hash fingerprints of vault entries, keyed by keyId. Injected by
   * the orchestrator so disk.plaintext can compare against known-vault keys
   * without accessing the plaintext directly.
   */
  fingerprints?: Record<string, string>;
  /**
   * Callback: given a plaintext string from disk, return the vault keyId
   * that fingerprints to it (or null). Injected by orchestrator. This is
   * the ONLY place plaintext leaves the vault-crypto module — the check
   * never handles it directly.
   */
  matchAgainstVault?: (plaintext: string) => Promise<string | null>;
}

export type WatchtowerCheck = (input: WatchtowerInput) => Promise<WatchtowerFinding[]>;

export interface WatchtowerConfig {
  thresholds: {
    /** Warn on rotation-age older than this. Default: 180 days. */
    rotationDays: number;
    /** Flag as unused after this many days without traffic. Default: 90. */
    unusedDays: number;
    /** Flag zombie grants after this many days without traffic. Default: 30. */
    zombieDays: number;
  };
  /** Files to scan for disk.plaintext. Defaults set by DEFAULT_DISK_PATHS below. */
  diskScanPaths: string[];
  /** Directories to recurse (up to 3 levels). Default: DEFAULT_DISK_DIRS below. */
  diskScanDirs: string[];
  /** Files larger than this are skipped (1 MiB matches 1P's SSH scanner). */
  diskScanMaxBytes: number;
  /** Finding ids the user has dismissed. */
  dismissed: string[];
}

// Default disk-scan targets. Relative to $HOME at call-site.
export const DEFAULT_DISK_PATHS: readonly string[] = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.hermes/.env',
  '.cursor/.env',
  '.continue/config.json',
  '.aider.conf.yml',
  '.aider.conf.yaml',
  '.config/moltypass-legacy.env',
];

// Default recurse-scan directories. Kept SHORT — recursing into all of
// $HOME is not a viable design.
export const DEFAULT_DISK_DIRS: readonly string[] = [
  '.config',
  '.local/share',
];

export const DEFAULT_CONFIG: WatchtowerConfig = {
  thresholds: {
    rotationDays: 180,
    unusedDays: 90,
    zombieDays: 30,
  },
  diskScanPaths: [...DEFAULT_DISK_PATHS],
  diskScanDirs: [...DEFAULT_DISK_DIRS],
  diskScanMaxBytes: 1024 * 1024,
  dismissed: [],
};

/** Stable id generation for (check, target) — same input → same id. */
export function findingId(check: WatchtowerCheckId, ...parts: string[]): string {
  return [check, ...parts].join(':');
}
