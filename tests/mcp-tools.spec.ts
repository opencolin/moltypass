import { describe, it, expect } from 'vitest';
import { handleToolCall, TOOL_DEFS } from '../src/mcp/tools';
import { standardFakeDaemon, createFakeDaemon } from '../src/mcp/fixtures/fake-daemon';
import { REDACTION_MARKER } from '../src/mcp/redact';

const call = (name: string, args: Record<string, unknown> = {}) =>
  handleToolCall(standardFakeDaemon(), { name, arguments: args });

describe('TOOL_DEFS', () => {
  it('declares exactly 12 tools', () => {
    expect(TOOL_DEFS).toHaveLength(12);
  });

  it('tool names are unique', () => {
    const names = TOOL_DEFS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every tool has a name, description, and input_schema', () => {
    for (const t of TOOL_DEFS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.input_schema).toBeTypeOf('object');
    }
  });
});

describe('list_providers', () => {
  it('returns the provider catalog', async () => {
    const r = await call('list_providers');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const result = r.result as { providers: Array<{ slug: string }> };
    expect(result.providers.map(p => p.slug)).toEqual(['anthropic', 'openai', 'gemini']);
  });
});

describe('list_keys', () => {
  it('returns all keys with no filter', async () => {
    const r = await call('list_keys');
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { keys: Array<{ id: string }> };
    expect(result.keys).toHaveLength(3);
  });

  it('filters by provider', async () => {
    const r = await call('list_keys', { provider: 'openai' });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { keys: Array<{ id: string; provider: string }> };
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].provider).toBe('openai');
  });

  it('never returns a key VALUE — only metadata', async () => {
    const r = await call('list_keys');
    if (!r.ok) throw new Error('unexpected');
    const s = JSON.stringify(r.result);
    expect(s).not.toMatch(/sk-|AIza/);
  });
});

describe('list_grants', () => {
  it('returns all grants with no filter', async () => {
    const r = await call('list_grants');
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { grants: unknown[] };
    expect(result.grants).toHaveLength(2);
  });

  it('filters by key_id', async () => {
    const r = await call('list_grants', { key_id: 'k1' });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { grants: Array<{ key_id: string }> };
    expect(result.grants.every(g => g.key_id === 'k1')).toBe(true);
  });

  it('filters by origin', async () => {
    const r = await call('list_grants', { origin: 'https://cursor.sh' });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { grants: Array<{ origin: string }> };
    expect(result.grants.every(g => g.origin === 'https://cursor.sh')).toBe(true);
  });
});

describe('list_tools', () => {
  it('returns the CLI catalog', async () => {
    const r = await call('list_tools');
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { tools: Array<{ name: string }> };
    expect(result.tools.map(t => t.name)).toContain('hermes');
    expect(result.tools.map(t => t.name)).toContain('claude-code');
  });
});

describe('list_anomalies', () => {
  it('returns anomalies with no since filter', async () => {
    const r = await call('list_anomalies');
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { anomalies: unknown[] };
    expect(result.anomalies).toHaveLength(1);
  });

  it('respects the since filter', async () => {
    const r = await call('list_anomalies', { since: 1_700_000_600_000 });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { anomalies: unknown[] };
    expect(result.anomalies).toHaveLength(0);
  });
});

describe('item_history', () => {
  it('returns events for the requested key', async () => {
    const r = await call('item_history', { key_id: 'k1' });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { events: Array<{ kind: string }> };
    expect(result.events).toHaveLength(2);
  });

  it('requires key_id', async () => {
    const r = await call('item_history');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain('key_id');
  });
});

describe('annotate_item', () => {
  it('updates notes on a valid item', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleToolCall(daemon, {
      name: 'annotate_item',
      arguments: { key_id: 'k2', notes: 'delete after Nov' },
    });
    if (!r.ok) throw new Error('unexpected');
    expect((r.result as { ok: boolean }).ok).toBe(true);
  });

  it('errors on unknown key', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleToolCall(daemon, {
      name: 'annotate_item',
      arguments: { key_id: 'not-a-key', notes: 'x' },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('daemon_error');
  });
});

describe('revoke_grant', () => {
  it('revokes a known grant', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleToolCall(daemon, {
      name: 'revoke_grant',
      arguments: { grant_id: 'g1' },
    });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { ok: boolean; in_flight_terminated: number };
    expect(result.ok).toBe(true);
  });

  it('errors on unknown grant', async () => {
    const r = await call('revoke_grant', { grant_id: 'not-real' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('daemon_error');
  });
});

describe('capture_key', () => {
  it('returns a capture URL + pending id', async () => {
    const r = await call('capture_key', { provider: 'anthropic', label: 'staging' });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { capture_url: string; key_id_when_ready: string };
    expect(result.capture_url).toContain('anthropic');
    expect(result.key_id_when_ready).toContain('staging');
  });
});

describe('rotate_key', () => {
  it('returns new + retired key ids', async () => {
    const r = await call('rotate_key', { key_id: 'k1' });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { new_key_id: string; retired_key_id: string };
    expect(result.retired_key_id).toBe('k1');
    expect(result.new_key_id).toBe('k1-rotated');
  });
});

describe('exec', () => {
  it('runs the requested command via the daemon', async () => {
    const daemon = standardFakeDaemon();
    daemon.execResponse = { stdout: 'hello world', stderr: '', exit_code: 0, duration_ms: 42 };
    const r = await handleToolCall(daemon, {
      name: 'exec',
      arguments: { command: ['hermes', 'greet'], provider_hint: 'nebius' },
    });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { ok: boolean; stdout: string; exit_code: number };
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('hello world');
    expect(result.exit_code).toBe(0);
    expect(daemon.lastExec?.command).toEqual(['hermes', 'greet']);
    expect(daemon.lastExec?.provider_hint).toBe('nebius');
  });

  it('redacts key-shaped strings in stdout', async () => {
    const daemon = standardFakeDaemon();
    // Build a synthetic key without triggering the CI grep guard.
    const fakeAnthropic = 'sk-ant-' + 'X'.repeat(40);
    daemon.execResponse = {
      stdout: 'debug: env has ANTHROPIC_API_KEY=' + fakeAnthropic + ' — call ok',
      stderr: '',
      exit_code: 0,
      duration_ms: 12,
    };
    const r = await handleToolCall(daemon, {
      name: 'exec',
      arguments: { command: ['bash', '-c', 'echo $ANTHROPIC_API_KEY'] },
    });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { stdout: string; redactions: { stdout_count: number; providers: string[] } };
    expect(result.stdout).not.toContain(fakeAnthropic);
    expect(result.stdout).toContain(REDACTION_MARKER);
    expect(result.redactions.stdout_count).toBe(1);
    expect(result.redactions.providers).toEqual(['anthropic']);
  });

  it('redacts across stdout and stderr, reports both counts', async () => {
    const daemon = standardFakeDaemon();
    const kOpenai = 'sk-' + 'Y'.repeat(40);
    const kGemini = 'AIza' + 'Z'.repeat(35);
    daemon.execResponse = {
      stdout: 'openai key: ' + kOpenai,
      stderr: 'gemini key: ' + kGemini,
      exit_code: 1,
      duration_ms: 33,
    };
    const r = await handleToolCall(daemon, { name: 'exec', arguments: { command: ['x'] } });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { ok: boolean; redactions: { stdout_count: number; stderr_count: number; providers: string[] } };
    expect(result.ok).toBe(false);
    expect(result.redactions.stdout_count).toBe(1);
    expect(result.redactions.stderr_count).toBe(1);
    expect(new Set(result.redactions.providers)).toEqual(new Set(['openai', 'gemini']));
  });

  it('requires command to be a string[]', async () => {
    const r = await call('exec', { command: 'hermes greet' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain('command');
  });
});

describe('uri_lint', () => {
  it('returns valid_syntax=true + exists=true for a known key URI', async () => {
    const r = await call('uri_lint', { uri: 'moltypass://anthropic/personal' });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { valid_syntax: boolean; exists: boolean; key_id?: string };
    expect(result.valid_syntax).toBe(true);
    expect(result.exists).toBe(true);
    expect(result.key_id).toBe('k1');
  });

  it('accepts the multipass:// alias', async () => {
    const r = await call('uri_lint', { uri: 'multipass://openai/work' });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { valid_syntax: boolean; exists: boolean };
    expect(result.valid_syntax).toBe(true);
    expect(result.exists).toBe(true);
  });

  it('returns valid_syntax=true + exists=false for unknown key', async () => {
    const r = await call('uri_lint', { uri: 'moltypass://anthropic/never-used' });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { valid_syntax: boolean; exists: boolean };
    expect(result.valid_syntax).toBe(true);
    expect(result.exists).toBe(false);
  });

  it('returns valid_syntax=false with syntax_error on malformed URI', async () => {
    const r = await call('uri_lint', { uri: 'http://not-us/key' });
    if (!r.ok) throw new Error('unexpected');
    const result = r.result as { valid_syntax: boolean; syntax_error?: string; exists: boolean };
    expect(result.valid_syntax).toBe(false);
    expect(result.syntax_error).toBeDefined();
    expect(result.exists).toBe(false);
  });

  it('NEVER returns a key value', async () => {
    const r = await call('uri_lint', { uri: 'moltypass://anthropic/personal' });
    if (!r.ok) throw new Error('unexpected');
    const s = JSON.stringify(r.result);
    expect(s).not.toMatch(/sk-|AIza/);
  });
});

describe('unknown tool', () => {
  it('returns unknown_tool error', async () => {
    const r = await call('nope');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('unknown_tool');
  });
});

describe('zero-knowledge invariant (sweep)', () => {
  it('an empty daemon does not leak in any response', async () => {
    const daemon = createFakeDaemon({ items: [], grants: [], anomalies: [] });
    for (const t of TOOL_DEFS.filter(t => ['list_providers', 'list_keys', 'list_grants', 'list_tools', 'list_anomalies'].includes(t.name))) {
      const r = await handleToolCall(daemon, { name: t.name, arguments: {} });
      expect(r.ok).toBe(true);
      const s = JSON.stringify(r);
      // Real keys have 32+ chars after the prefix. The provider CATALOG entry
      // `sk-ant-*` doesn't. Match strictly on the real-key shape.
      expect(s).not.toMatch(/sk-ant-[A-Za-z0-9_-]{32,}|sk-[A-Za-z0-9_-]{32,}|AIza[A-Za-z0-9_-]{35}/);
    }
  });
});
