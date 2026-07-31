import { describe, it, expect } from 'vitest';
import { TOOL_CATALOG, lookupTool } from '../src/cli/catalog';

describe('TOOL_CATALOG', () => {
  it('has unique names', () => {
    const names = TOOL_CATALOG.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every entry has at least one providerHint', () => {
    for (const t of TOOL_CATALOG) {
      expect(t.providerHints.length).toBeGreaterThan(0);
    }
  });

  it('includes the hermes / claude-code / cursor / aider / continue expectations', () => {
    const byName = new Map(TOOL_CATALOG.map(t => [t.name, t]));
    expect(byName.get('hermes')?.envVars).toContain('NEBIUS_API_KEY');
    expect(byName.get('claude-code')?.envVars).toContain('ANTHROPIC_API_KEY');
    expect(byName.get('aider')?.envVars).toEqual(expect.arrayContaining(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']));
    expect(byName.get('continue')?.envVars).toEqual(expect.arrayContaining(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']));
    expect(byName.get('cursor')?.providerHints).toEqual(expect.arrayContaining(['anthropic', 'openai']));
  });
});

describe('lookupTool', () => {
  it('finds a known tool by basename', () => {
    expect(lookupTool('hermes').name).toBe('hermes');
  });

  it('strips a leading path from argv[0]', () => {
    expect(lookupTool('/usr/local/bin/hermes').name).toBe('hermes');
  });

  it('returns a generic entry for unknown tools with all core providers', () => {
    const t = lookupTool('some-random-tool');
    expect(t.name).toBe('some-random-tool');
    expect(t.providerHints.length).toBeGreaterThanOrEqual(4);
    expect(t.envVars).toEqual(expect.arrayContaining(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']));
  });
});
