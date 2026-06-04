import { describe, it, expect } from 'vitest';
import {
  buildManagedConfig,
  buildDeploymentBundle,
  type BundleInput,
} from '../web/lib/mdm/policy-bundle';

const EXT_ID = 'a'.repeat(32); // valid Chrome extension id shape

function baseInput(overrides: Partial<BundleInput> = {}): BundleInput {
  return {
    orgId: 'org-1',
    ingestApiToken: 'tok-' + 'x'.repeat(20),
    baseUrl: 'https://app.moltypass.app',
    ...overrides,
  };
}

describe('buildManagedConfig', () => {
  it('builds the minimum-viable config from required fields only', () => {
    const c = buildManagedConfig(baseInput());
    expect(c).toEqual({
      schemaVersion: 1,
      orgId: 'org-1',
      apiToken: baseInput().ingestApiToken,
      ingestUrl: 'https://app.moltypass.app/api/ingest',
      policyUrl: 'https://app.moltypass.app/api/policy',
    });
  });

  it('includes orgDisplayName when provided', () => {
    const c = buildManagedConfig(baseInput({ orgDisplayName: 'Acme Corp' }));
    expect(c.orgDisplayName).toBe('Acme Corp');
  });

  it('strips trailing slashes from baseUrl', () => {
    const c = buildManagedConfig(baseInput({ baseUrl: 'https://app.example.dev///' }));
    expect(c.ingestUrl).toBe('https://app.example.dev/api/ingest');
    expect(c.policyUrl).toBe('https://app.example.dev/api/policy');
  });

  it('includes initialPolicy when provided', () => {
    const c = buildManagedConfig(baseInput({
      initialPolicy: {
        forbiddenProviders: ['openai'],
        revealModeAllowed: false,
        retentionDays: 90,
      },
    }));
    expect(c.initialPolicy).toEqual({
      forbiddenProviders: ['openai'],
      revealModeAllowed: false,
      retentionDays: 90,
    });
  });

  it('rejects missing orgId', () => {
    expect(() => buildManagedConfig({ ...baseInput(), orgId: '' })).toThrow('orgId');
  });

  it('rejects short api token (refuse-to-deploy guard)', () => {
    expect(() => buildManagedConfig({ ...baseInput(), ingestApiToken: 'too-short' })).toThrow('too short');
  });

  it('rejects non-http baseUrl', () => {
    expect(() => buildManagedConfig({ ...baseInput(), baseUrl: 'app.moltypass.app' })).toThrow('http');
  });

  it('rejects unknown forbiddenProviders entries', () => {
    expect(() => buildManagedConfig(baseInput({
      initialPolicy: { forbiddenProviders: ['banana'] as never },
    }))).toThrow('unknown provider');
  });

  it('rejects invalid retentionDays range', () => {
    expect(() => buildManagedConfig(baseInput({
      initialPolicy: { retentionDays: 0 },
    }))).toThrow('retentionDays');
    expect(() => buildManagedConfig(baseInput({
      initialPolicy: { retentionDays: 9999 },
    }))).toThrow('retentionDays');
  });
});

describe('buildDeploymentBundle', () => {
  it('wraps the ManagedConfig in the Chrome ExtensionSettings envelope', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const bundle = buildDeploymentBundle(baseInput(), { extensionId: EXT_ID, now });
    expect(bundle.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(bundle.extensionId).toBe(EXT_ID);
    expect(bundle.extensionSettings[EXT_ID]).toMatchObject({
      installation_mode: 'force_installed',
      managed_config: { orgId: 'org-1', schemaVersion: 1 },
    });
  });

  it('exposes a preview that hides all but the last 4 chars of the token', () => {
    const bundle = buildDeploymentBundle(baseInput(), { extensionId: EXT_ID });
    expect(bundle.preview.apiTokenSuffix).toHaveLength(4);
    expect(bundle.preview.apiTokenSuffix).toBe('xxxx');
    expect(bundle.preview.orgId).toBe('org-1');
  });

  it('rejects an invalid extension id', () => {
    expect(() => buildDeploymentBundle(baseInput(), { extensionId: 'too-short' })).toThrow('32-char');
    expect(() => buildDeploymentBundle(baseInput(), { extensionId: 'A'.repeat(32) })).toThrow('lowercase');
  });

  it('allows overriding the update_url for self-host CRX hosting', () => {
    const bundle = buildDeploymentBundle(baseInput(), {
      extensionId: EXT_ID,
      updateUrl: 'https://updates.example.acme/crx',
    });
    expect(bundle.extensionSettings[EXT_ID]!.update_url).toBe('https://updates.example.acme/crx');
  });

  it('the bundle JSON-stringifies cleanly (deployable artifact)', () => {
    const bundle = buildDeploymentBundle(baseInput(), { extensionId: EXT_ID });
    const json = JSON.stringify(bundle);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json).extensionSettings).toBeDefined();
  });
});
