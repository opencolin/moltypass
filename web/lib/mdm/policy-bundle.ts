// MDM policy bundle builder.
//
// Output: a JSON object an admin pastes into Chrome Enterprise policy
// (via Group Policy on Windows, plist on macOS, or the Chromium
// ExtensionSettings policy). Chrome merges it into chrome.storage.managed
// for the extension; the Moltypass background SW reads from there
// on startup to opt the device into enterprise mode.
//
// All inputs are validated at the type and value level before being
// included — this file is the single point where the admin-facing
// 'enterprise device bootstrap' contract is defined.

export interface BundleInput {
  /** Stable org identifier shown in the admin dashboard. */
  orgId: string;
  /** Human-readable org name for the popup's 'Managed by ...' line. */
  orgDisplayName?: string;
  /** Bearer token the extension uses against /api/ingest + /api/policy.
   *  This is the per-org ingest token; an admin token would NOT be put here. */
  ingestApiToken: string;
  /** Base URL of the moltypass-web deployment (no trailing slash). */
  baseUrl: string;
  /** Optional org-level policy locks applied at bootstrap. The
   *  collector's /api/policy endpoint is the authoritative source
   *  going forward, but pinning these here lets the device enforce
   *  before the first policy fetch. */
  initialPolicy?: {
    forbiddenProviders?: Array<'anthropic' | 'openai' | 'gemini'>;
    revealModeAllowed?: boolean;
    retentionDays?: number;
  };
}

export interface ManagedConfig {
  schemaVersion: 1;
  orgId: string;
  orgDisplayName?: string;
  apiToken: string;
  ingestUrl: string;
  policyUrl: string;
  initialPolicy?: BundleInput['initialPolicy'];
}

/** Build the ManagedConfig — the actual object that ends up in
 *  chrome.storage.managed. */
export function buildManagedConfig(input: BundleInput): ManagedConfig {
  validateInput(input);
  const base = input.baseUrl.replace(/\/+$/, '');
  return {
    schemaVersion: 1,
    orgId: input.orgId,
    ...(input.orgDisplayName ? { orgDisplayName: input.orgDisplayName } : {}),
    apiToken: input.ingestApiToken,
    ingestUrl: `${base}/api/ingest`,
    policyUrl: `${base}/api/policy`,
    ...(input.initialPolicy ? { initialPolicy: input.initialPolicy } : {}),
  };
}

/** Produce the deployment artifact an admin downloads — the
 *  ManagedConfig wrapped in the Chrome Enterprise ExtensionSettings
 *  envelope keyed by the extension ID. The admin pastes this into
 *  their MDM / Group Policy console. */
export interface DeploymentBundle {
  generatedAt: string;
  orgId: string;
  extensionId: string;
  /** Chrome ExtensionSettings policy entry. */
  extensionSettings: {
    [extensionId: string]: {
      installation_mode: 'force_installed' | 'normal_installed';
      update_url: string;
      /** The managed config we built above. */
      managed_config: ManagedConfig;
    };
  };
  /** Friendly preview for the download page that doesn't include the
   *  full token (last 4 chars only). */
  preview: {
    orgId: string;
    ingestUrl: string;
    policyUrl: string;
    apiTokenSuffix: string;
  };
}

/** Wrap a ManagedConfig in the Chrome ExtensionSettings envelope. */
export function buildDeploymentBundle(
  input: BundleInput,
  opts: { extensionId: string; now?: Date; updateUrl?: string },
): DeploymentBundle {
  if (!opts.extensionId || !/^[a-z]{32}$/.test(opts.extensionId)) {
    throw new Error('extensionId must be a 32-char lowercase Chrome extension id');
  }
  const config = buildManagedConfig(input);
  const generatedAt = (opts.now ?? new Date()).toISOString();
  const updateUrl = opts.updateUrl ?? 'https://clients2.google.com/service/update2/crx';
  return {
    generatedAt,
    orgId: input.orgId,
    extensionId: opts.extensionId,
    extensionSettings: {
      [opts.extensionId]: {
        installation_mode: 'force_installed',
        update_url: updateUrl,
        managed_config: config,
      },
    },
    preview: {
      orgId: config.orgId,
      ingestUrl: config.ingestUrl,
      policyUrl: config.policyUrl,
      apiTokenSuffix: input.ingestApiToken.slice(-4),
    },
  };
}

// ----- validation -----

function validateInput(input: BundleInput): void {
  if (!input.orgId || typeof input.orgId !== 'string') {
    throw new Error('orgId is required');
  }
  if (!input.ingestApiToken || typeof input.ingestApiToken !== 'string') {
    throw new Error('ingestApiToken is required');
  }
  if (input.ingestApiToken.length < 16) {
    throw new Error('ingestApiToken looks too short (refuse-to-deploy guard)');
  }
  if (!input.baseUrl || !/^https?:\/\//.test(input.baseUrl)) {
    throw new Error('baseUrl must be an absolute http(s) URL');
  }
  if (input.initialPolicy) {
    const { forbiddenProviders, revealModeAllowed, retentionDays } = input.initialPolicy;
    if (forbiddenProviders) {
      const known = new Set(['anthropic', 'openai', 'gemini']);
      for (const p of forbiddenProviders) {
        if (!known.has(p)) throw new Error(`unknown provider in forbiddenProviders: ${p}`);
      }
    }
    if (revealModeAllowed !== undefined && typeof revealModeAllowed !== 'boolean') {
      throw new Error('revealModeAllowed must be a boolean');
    }
    if (retentionDays !== undefined) {
      if (typeof retentionDays !== 'number' || retentionDays < 1 || retentionDays > 3650) {
        throw new Error('retentionDays must be an integer 1..3650');
      }
    }
  }
}
