// chrome.storage.managed reader + policy fetcher.
//
// chrome.storage.managed is populated by the Chrome Enterprise admin
// pushing the JSON bundle from web/lib/mdm/policy-bundle.ts. We read
// it on startup and on chrome.storage.onChanged.
//
// The fetched policy is the authoritative source going forward; it
// overrides the initialPolicy embedded in the managed config.

import type { ProviderId } from '../shared/providers';

// ----- managed config (the bootstrap JSON pushed via MDM) -----

export interface ManagedConfig {
  schemaVersion: 1;
  orgId: string;
  orgDisplayName?: string;
  apiToken: string;
  ingestUrl: string;
  policyUrl: string;
  initialPolicy?: Policy;
}

/** Read the managed config from chrome.storage.managed. Returns null
 *  when not enrolled — that means personal mode, fully inert. */
export async function readManagedConfig(): Promise<ManagedConfig | null> {
  const res = await chrome.storage.managed.get(null);
  if (!res || Object.keys(res).length === 0) return null;
  if (typeof res['orgId'] !== 'string' || typeof res['apiToken'] !== 'string') return null;
  if (typeof res['ingestUrl'] !== 'string' || typeof res['policyUrl'] !== 'string') return null;
  return res as unknown as ManagedConfig;
}

// ----- policy (the dynamic config fetched from the collector) -----

export interface Policy {
  forbiddenProviders?: ProviderId[];
  revealModeAllowed?: boolean;
  retentionDays?: number;
}

export interface PolicyCache {
  policy: Policy;
  etag: string | null;
  fetchedAt: number;
}

const POLICY_CACHE_KEY = 'moltypass.enterprise.policy';

export async function readPolicyCache(): Promise<PolicyCache | null> {
  const res = await chrome.storage.local.get(POLICY_CACHE_KEY);
  return (res[POLICY_CACHE_KEY] as PolicyCache | undefined) ?? null;
}

export async function writePolicyCache(cache: PolicyCache): Promise<void> {
  await chrome.storage.local.set({ [POLICY_CACHE_KEY]: cache });
}

export interface FetchPolicyResult {
  policy: Policy;
  etag: string | null;
  /** True if the server returned 304 — caller keeps the cached policy
   *  but should still refresh fetchedAt. */
  notModified: boolean;
}

export interface FetchPolicyDeps {
  fetch: typeof fetch;
}

/** Fetch the policy from the configured policyUrl. Uses If-None-Match
 *  when a prior ETag is known. */
export async function fetchPolicy(
  config: ManagedConfig,
  prevEtag: string | null,
  deps: FetchPolicyDeps,
): Promise<FetchPolicyResult> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${config.apiToken}`,
    accept: 'application/json',
  };
  if (prevEtag) headers['if-none-match'] = prevEtag;

  const res = await deps.fetch(config.policyUrl, { method: 'GET', headers });
  if (res.status === 304) {
    return { policy: {}, etag: prevEtag, notModified: true };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`policy fetch: ${res.status} ${body.slice(0, 200)}`);
  }
  const etag = res.headers.get('etag') ?? null;
  const body = await res.json() as { policy?: Policy } | Policy;
  const policy: Policy =
    (body && typeof body === 'object' && 'policy' in body && body.policy)
      ? body.policy
      : (body as Policy);
  return { policy, etag, notModified: false };
}

// ----- policy enforcement (pure) -----

export function isProviderForbidden(policy: Policy, provider: ProviderId): boolean {
  return policy.forbiddenProviders?.includes(provider) ?? false;
}

export function isRevealAllowed(policy: Policy): boolean {
  return policy.revealModeAllowed ?? true;
}

/** ms epoch cutoff for the audit retention sweep. Records older than
 *  this are deleted. Returns null when no retention policy is set
 *  (the local default in audit-retention.ts applies). */
export function retentionCutoffMs(policy: Policy, now: number = Date.now()): number | null {
  const days = policy.retentionDays;
  if (typeof days !== 'number' || days <= 0) return null;
  return now - days * 24 * 60 * 60 * 1000;
}
