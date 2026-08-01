// Tool-aware catalog for `moltypass exec`. Plain-JS mirror of
// src/cli/catalog.ts. Adding a tool = one PR to both files + a test.
'use strict';

const TOOL_CATALOG = [
  { name: 'claude-code', envVars: ['ANTHROPIC_API_KEY'], providerHints: ['anthropic'] },
  { name: 'claude', envVars: ['ANTHROPIC_API_KEY'], providerHints: ['anthropic'] },
  { name: 'cursor', envVars: [], providerHints: ['anthropic', 'openai'] },
  { name: 'continue', envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'], providerHints: ['anthropic', 'openai'] },
  { name: 'aider', envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'], providerHints: ['anthropic', 'openai'] },
  { name: 'hermes', envVars: ['NEBIUS_API_KEY', 'OPENAI_API_KEY'], providerHints: ['nebius', 'openai'] },
  { name: 'goose', envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'], providerHints: ['openai', 'anthropic'] },
  { name: 'llm', envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'], providerHints: ['openai', 'anthropic', 'gemini'] },
  { name: 'mods', envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'], providerHints: ['openai', 'anthropic'] },
  { name: 'aichat', envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'], providerHints: ['openai', 'anthropic', 'gemini'] },
  { name: 'open-interpreter', envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'], providerHints: ['openai', 'anthropic'] },
  { name: 'sgpt', envVars: ['OPENAI_API_KEY'], providerHints: ['openai'] },
  { name: 'codex', envVars: ['OPENAI_API_KEY'], providerHints: ['openai'] },
  { name: 'pytest', envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'], providerHints: ['anthropic', 'openai'] },
  { name: 'jest', envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'], providerHints: ['anthropic', 'openai'] },
  { name: 'vitest', envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'], providerHints: ['anthropic', 'openai'] },
];

function lookupTool(argv0) {
  const basename = (argv0 || '').split('/').pop();
  const entry = TOOL_CATALOG.find(t => t.name === basename);
  if (entry) return entry;
  return {
    name: basename,
    envVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'NEBIUS_API_KEY'],
    providerHints: ['anthropic', 'openai', 'gemini', 'nebius'],
  };
}

/**
 * Given a tool entry and an unlocked vault, return the env-var map to
 * inject into the child process. Only vars for which we have a matching
 * vault entry are set. Providers are tried in providerHints order; the
 * FIRST provider that has a vault entry wins for a given env var.
 */
async function resolveEnvForTool(tool, vault, key, decryptEntry, findEntry) {
  const env = {};
  const usedGrants = [];

  // Map provider -> env var (best-effort default).
  const providerEnv = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY',
    nebius: 'NEBIUS_API_KEY',
  };

  for (const providerSlug of tool.providerHints) {
    const entry = findEntry(vault, providerSlug);
    if (!entry) continue;
    const envVar = providerEnv[providerSlug];
    if (!envVar) continue;
    if (!tool.envVars.length || tool.envVars.includes(envVar)) {
      const plaintext = await decryptEntry(entry, key);
      env[envVar] = plaintext;
      usedGrants.push(entry.id);
    }
  }
  return { env, usedGrants };
}

module.exports = { TOOL_CATALOG, lookupTool, resolveEnvForTool };
