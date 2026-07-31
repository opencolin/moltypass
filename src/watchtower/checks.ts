// The 5 Watchtower checks. All pure functions of the WatchtowerInput.
// Zero plaintext handling except in disk.plaintext, which delegates the
// match to a caller-provided vault callback (fingerprint compare only).

import type { WatchtowerCheck, WatchtowerFinding, WatchtowerInput } from './types';
import { findingId } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------
// stale.rotation — vault entries older than N days
// ------------------------------------------------------------

export const staleRotationCheck: WatchtowerCheck = async (input) => {
  const findings: WatchtowerFinding[] = [];
  const threshold = input.config.thresholds.rotationDays;
  const cutoff = input.now - threshold * MS_PER_DAY;
  for (const entry of input.entries) {
    if (entry.createdAt <= cutoff) {
      const ageDays = Math.floor((input.now - entry.createdAt) / MS_PER_DAY);
      findings.push({
        id: findingId('stale.rotation', entry.id),
        check: 'stale.rotation',
        severity: ageDays > threshold * 2 ? 'high' : ageDays > threshold * 1.5 ? 'medium' : 'low',
        keyId: entry.id,
        message: `Key "${entry.label}" (${entry.service}) hasn't been rotated in ${ageDays} days.`,
        detectedAt: input.now,
        dismissible: true,
        meta: { ageDays, thresholdDays: threshold },
      });
    }
  }
  return findings;
};

// ------------------------------------------------------------
// stale.unused — key has zero traffic in the audit slice for N days
// ------------------------------------------------------------

export const staleUnusedCheck: WatchtowerCheck = async (input) => {
  const findings: WatchtowerFinding[] = [];
  const threshold = input.config.thresholds.unusedDays;
  const cutoff = input.now - threshold * MS_PER_DAY;

  // Last-used ms per keyId, from proxy.ok events.
  const lastUsed = new Map<string, number>();
  for (const e of input.audit) {
    if (e.kind === 'proxy.ok' && e.keyId) {
      const prior = lastUsed.get(e.keyId);
      if (prior === undefined || e.ts > prior) lastUsed.set(e.keyId, e.ts);
    }
  }

  for (const entry of input.entries) {
    // Skip entries newer than the threshold — they haven't had time to be unused.
    if (entry.createdAt > cutoff) continue;
    const last = lastUsed.get(entry.id);
    if (last === undefined) {
      const ageDays = Math.floor((input.now - entry.createdAt) / MS_PER_DAY);
      findings.push({
        id: findingId('stale.unused', entry.id),
        check: 'stale.unused',
        severity: 'medium',
        keyId: entry.id,
        message: `Key "${entry.label}" (${entry.service}) has never been used and is ${ageDays} days old.`,
        detectedAt: input.now,
        dismissible: true,
        meta: { ageDays, everUsed: 0 },
      });
    } else if (last <= cutoff) {
      const idleDays = Math.floor((input.now - last) / MS_PER_DAY);
      findings.push({
        id: findingId('stale.unused', entry.id),
        check: 'stale.unused',
        severity: 'low',
        keyId: entry.id,
        message: `Key "${entry.label}" (${entry.service}) hasn't been used in ${idleDays} days.`,
        detectedAt: input.now,
        dismissible: true,
        meta: { idleDays, everUsed: 1 },
      });
    }
  }
  return findings;
};

// ------------------------------------------------------------
// grant.zombie — active grants with no traffic
// ------------------------------------------------------------

export const grantZombieCheck: WatchtowerCheck = async (input) => {
  const findings: WatchtowerFinding[] = [];
  const threshold = input.config.thresholds.zombieDays;
  const cutoff = input.now - threshold * MS_PER_DAY;

  const lastUsedByGrant = new Map<string, number>();
  for (const e of input.audit) {
    if (e.kind === 'proxy.ok' && e.grantId) {
      const prior = lastUsedByGrant.get(e.grantId);
      if (prior === undefined || e.ts > prior) lastUsedByGrant.set(e.grantId, e.ts);
    }
  }

  for (const g of input.grants) {
    // Only warn on grants old enough to have been used.
    if (g.grantedAt > cutoff) continue;
    const last = lastUsedByGrant.get(g.grantId);
    const lastMs = last ?? g.grantedAt;
    if (lastMs > cutoff) continue;
    const idleDays = Math.floor((input.now - lastMs) / MS_PER_DAY);
    findings.push({
      id: findingId('grant.zombie', g.grantId),
      check: 'grant.zombie',
      severity: idleDays > threshold * 2 ? 'medium' : 'low',
      grantId: g.grantId,
      keyId: g.keyId,
      message: `Grant to "${g.origin}" (${g.service}) hasn't been used in ${idleDays} days.`,
      detectedAt: input.now,
      dismissible: true,
      meta: { idleDays, thresholdDays: threshold, origin: g.origin.slice(0, 200) },
    });
  }
  return findings;
};

// ------------------------------------------------------------
// disk.plaintext — key ALSO exists in a plaintext dotfile
// ------------------------------------------------------------

export const diskPlaintextCheck: WatchtowerCheck = async (input) => {
  const findings: WatchtowerFinding[] = [];
  if (!input.fs || !input.matchAgainstVault) return findings;
  const cap = input.config.diskScanMaxBytes;
  const seen = new Set<string>();

  const candidates: string[] = [...input.config.diskScanPaths];
  for (const dir of input.config.diskScanDirs) {
    try {
      const files = await input.fs.listFiles(dir, 3);
      for (const f of files) candidates.push(f);
    } catch {
      // Directory missing / unreadable — skip silently.
    }
  }

  for (const path of candidates) {
    if (seen.has(path)) continue;
    seen.add(path);
    try {
      if (!(await input.fs.exists(path))) continue;
      const size = await input.fs.statSize(path);
      if (size > cap) continue;
      const contents = await input.fs.readTextFile(path);
      // Cheap regex to pull ANYTHING that looks like an assignment value.
      // We hand each candidate value to the vault-callback for fingerprint
      // match; the check itself never sees plaintext-vault comparison.
      const values = extractCandidateValues(contents);
      for (const value of values) {
        const keyId = await input.matchAgainstVault(value);
        if (keyId) {
          findings.push({
            id: findingId('disk.plaintext', keyId, path),
            check: 'disk.plaintext',
            severity: 'high',
            keyId,
            message: `A vaulted key is ALSO in plaintext at ${path}. Delete the plaintext copy — it's the exact anti-pattern Moltypass exists to fix.`,
            detectedAt: input.now,
            dismissible: false,
            meta: { path: path.slice(0, 200) },
          });
        }
      }
    } catch {
      // Ignore unreadable files (permission denied, symlink to nowhere, etc.).
    }
  }
  return findings;
};

/** Pull candidate value substrings from a .env-like or JSON-like blob. */
function extractCandidateValues(text: string): string[] {
  const out: string[] = [];
  // .env / shell assignment: FOO="value" or FOO=value
  const envRe = /(?:^|\n)\s*[A-Z_][A-Z0-9_]*\s*=\s*(?:"([^"]{16,})"|'([^']{16,})'|(\S{16,}))/g;
  let m;
  while ((m = envRe.exec(text)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  // JSON string values (loose regex; robust enough for config.json)
  const jsonRe = /"[^"]*(?:key|token|secret|api)[^"]*"\s*:\s*"([^"]{16,})"/gi;
  while ((m = jsonRe.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// ------------------------------------------------------------
// vault.duplicate — same salted fingerprint under two labels
// ------------------------------------------------------------

export const vaultDuplicateCheck: WatchtowerCheck = async (input) => {
  const findings: WatchtowerFinding[] = [];
  if (!input.fingerprints) return findings;
  const groups = new Map<string, string[]>();
  for (const [keyId, fp] of Object.entries(input.fingerprints)) {
    const arr = groups.get(fp) ?? [];
    arr.push(keyId);
    groups.set(fp, arr);
  }
  for (const [fp, keyIds] of groups) {
    if (keyIds.length < 2) continue;
    const labels = keyIds
      .map(id => input.entries.find(e => e.id === id)?.label ?? '(unknown)')
      .join(', ');
    // Emit one finding per key in the group so the dashboard can attribute
    // the duplicate to any of them; findingId includes the fp so they collide.
    for (const keyId of keyIds) {
      findings.push({
        id: findingId('vault.duplicate', fp, keyId),
        check: 'vault.duplicate',
        severity: 'medium',
        keyId,
        message: `This key has the same fingerprint as ${keyIds.length - 1} other entry (labels: ${labels}). Consolidate or rotate one of them.`,
        detectedAt: input.now,
        dismissible: false,
        meta: { duplicateCount: keyIds.length, siblingLabels: labels.slice(0, 200) },
      });
    }
  }
  return findings;
};

// ------------------------------------------------------------
// Orchestrator
// ------------------------------------------------------------

export const ALL_CHECKS: readonly WatchtowerCheck[] = [
  staleRotationCheck,
  staleUnusedCheck,
  grantZombieCheck,
  diskPlaintextCheck,
  vaultDuplicateCheck,
];

/**
 * Run all checks against the input. Returns findings deduped by id, sorted
 * severity-first then detectedAt-desc, with dismissed ids filtered out.
 */
export async function runWatchtower(input: WatchtowerInput): Promise<WatchtowerFinding[]> {
  const allResults = await Promise.all(ALL_CHECKS.map(check => check(input)));
  const seen = new Map<string, WatchtowerFinding>();
  for (const findings of allResults) {
    for (const f of findings) {
      if (input.config.dismissed.includes(f.id)) continue;
      // If two checks emit the same id, keep the higher severity.
      const prior = seen.get(f.id);
      if (!prior || severityRank(f.severity) > severityRank(prior.severity)) {
        seen.set(f.id, f);
      }
    }
  }
  const out = [...seen.values()];
  out.sort((a, b) => {
    const s = severityRank(b.severity) - severityRank(a.severity);
    return s !== 0 ? s : b.detectedAt - a.detectedAt;
  });
  return out;
}

function severityRank(s: WatchtowerFinding['severity']): number {
  return { info: 0, low: 1, medium: 2, high: 3 }[s];
}
