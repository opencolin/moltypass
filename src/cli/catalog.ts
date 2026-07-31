// Built-in tool catalog. Each entry declares which env vars a CLI reads and
// which providers are candidates. When `moltypass exec <cmd>` runs, the
// daemon uses this to know which vault items to unlock.
//
// Adding a tool = one PR to this file + a test. Sign of a working catalog
// is that a solo dev never has to memorize env var names again.

import type { ToolCatalogEntry } from './types';

export const TOOL_CATALOG: readonly ToolCatalogEntry[] = [
  // AI coding agents
  {
    name: 'claude-code',
    envVars: ['ANTHROPIC_API_KEY'],
    providerHints: ['anthropic'],
  },
  {
    name: 'claude',   // shorthand for claude-code CLI
    envVars: ['ANTHROPIC_API_KEY'],
    providerHints: ['anthropic'],
  },
  {
    name: 'cursor',
    envVars: [],  // Cursor pulls from its own settings; no direct env
    providerHints: ['anthropic', 'openai'],
  },
  {
    name: 'continue',
    envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    providerHints: ['anthropic', 'openai'],
  },
  {
    name: 'aider',
    envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    providerHints: ['anthropic', 'openai'],
  },
  {
    name: 'hermes',
    envVars: ['NEBIUS_API_KEY', 'OPENAI_API_KEY'],
    providerHints: ['nebius', 'openai'],
  },
  {
    name: 'goose',
    envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
    providerHints: ['openai', 'anthropic'],
  },
  {
    name: 'llm',    // Simon Willison's LLM CLI
    envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'],
    providerHints: ['openai', 'anthropic', 'gemini'],
  },
  {
    name: 'mods',
    envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
    providerHints: ['openai', 'anthropic'],
  },
  {
    name: 'aichat',
    envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'],
    providerHints: ['openai', 'anthropic', 'gemini'],
  },
  {
    name: 'open-interpreter',
    envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
    providerHints: ['openai', 'anthropic'],
  },
  {
    name: 'sgpt',
    envVars: ['OPENAI_API_KEY'],
    providerHints: ['openai'],
  },
  {
    name: 'codex',
    envVars: ['OPENAI_API_KEY'],
    providerHints: ['openai'],
  },

  // Test / dev runners that commonly need keys
  {
    name: 'pytest',
    envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    providerHints: ['anthropic', 'openai'],
  },
  {
    name: 'jest',
    envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    providerHints: ['anthropic', 'openai'],
  },
  {
    name: 'vitest',
    envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    providerHints: ['anthropic', 'openai'],
  },
];

/**
 * Look up a tool by its argv[0] basename. Returns the catalog entry, or a
 * synthesized generic entry that pulls all known providers as best-effort.
 */
export function lookupTool(argv0: string): ToolCatalogEntry {
  const basename = argv0.split('/').pop() ?? argv0;
  const entry = TOOL_CATALOG.find(t => t.name === basename);
  if (entry) return entry;
  // Unknown tool — best-effort default: try to inject the four core providers.
  // A `moltypass exec --strict` mode would refuse to run instead.
  return {
    name: basename,
    envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'NEBIUS_API_KEY'],
    providerHints: ['anthropic', 'openai', 'gemini', 'nebius'],
  };
}
