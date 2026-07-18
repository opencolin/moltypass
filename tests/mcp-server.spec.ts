import { describe, it, expect } from 'vitest';
import {
  handleRpc,
  parseRpcLine,
  runStdio,
  PROTOCOL_VERSION,
  SERVER_INFO,
  RPC_ERR,
} from '../src/mcp/server';
import { standardFakeDaemon } from '../src/mcp/fixtures/fake-daemon';

describe('parseRpcLine', () => {
  it('parses a well-formed request', () => {
    const r = parseRpcLine('{"jsonrpc":"2.0","id":1,"method":"ping"}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.msg.method).toBe('ping');
  });

  it('returns parse error on garbage', () => {
    const r = parseRpcLine('not json');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.error?.code).toBe(RPC_ERR.parse);
  });

  it('returns parse error on empty line', () => {
    const r = parseRpcLine('   ');
    expect(r.ok).toBe(false);
  });

  it('returns parse error when JSON is not an object', () => {
    const r = parseRpcLine('42');
    expect(r.ok).toBe(false);
  });
});

describe('handleRpc — initialize', () => {
  it('returns protocol version + server info + capabilities', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleRpc(daemon, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(r).not.toBeNull();
    if (!r) return;
    const result = r.result as { protocolVersion: string; serverInfo: { name: string }; capabilities: { tools: unknown } };
    expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(result.serverInfo).toEqual(SERVER_INFO);
    expect(result.capabilities.tools).toBeDefined();
  });
});

describe('handleRpc — tools/list', () => {
  it('returns exactly 12 tools with schemas', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleRpc(daemon, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    if (!r) throw new Error('unexpected null');
    const result = r.result as { tools: Array<{ name: string; description: string; input_schema: unknown }> };
    expect(result.tools).toHaveLength(12);
    expect(result.tools[0].description.length).toBeGreaterThan(10);
  });
});

describe('handleRpc — tools/call', () => {
  it('dispatches to the tool and wraps in content[]', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleRpc(daemon, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_providers', arguments: {} },
    });
    if (!r) throw new Error('unexpected null');
    const result = r.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.providers).toBeDefined();
  });

  it('surfaces tool errors with isError=true', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleRpc(daemon, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'revoke_grant', arguments: { grant_id: 'nope' } },
    });
    if (!r) throw new Error('unexpected null');
    const result = r.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.code).toBe('daemon_error');
  });

  it('errors on missing tool name in params', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleRpc(daemon, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {},
    });
    if (!r) throw new Error('unexpected null');
    expect(r.error?.code).toBe(RPC_ERR.invalidParams);
  });
});

describe('handleRpc — ping', () => {
  it('returns empty result', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleRpc(daemon, { jsonrpc: '2.0', id: 9, method: 'ping' });
    if (!r) throw new Error('unexpected null');
    expect(r.result).toEqual({});
    expect(r.error).toBeUndefined();
  });
});

describe('handleRpc — notifications', () => {
  it('silently swallows initialized notification', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleRpc(daemon, { jsonrpc: '2.0', method: 'initialized' });
    expect(r).toBeNull();
  });

  it('silently swallows notifications/cancelled', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleRpc(daemon, {
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 1, reason: 'test' },
    });
    expect(r).toBeNull();
  });

  it('swallows unknown notifications (no id) rather than method-not-found', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleRpc(daemon, { jsonrpc: '2.0', method: 'notifications/whatever' });
    expect(r).toBeNull();
  });
});

describe('handleRpc — unknown request method', () => {
  it('returns method not found', async () => {
    const daemon = standardFakeDaemon();
    const r = await handleRpc(daemon, { jsonrpc: '2.0', id: 42, method: 'no-such' });
    if (!r) throw new Error('unexpected null');
    expect(r.error?.code).toBe(RPC_ERR.methodNotFound);
  });
});

describe('runStdio — end-to-end', () => {
  it('reads a request from stdin, writes a response to stdout', async () => {
    const daemon = standardFakeDaemon();
    const written: string[] = [];
    async function* input(): AsyncIterableIterator<string> {
      yield JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
      yield JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    }
    await runStdio(daemon, {
      input: input(),
      write: (s: string) => { written.push(s); },
    });
    expect(written).toHaveLength(2);
    const first = JSON.parse(written[0].trim());
    expect(first.id).toBe(1);
    expect(first.result).toEqual({});
    const second = JSON.parse(written[1].trim());
    expect(second.id).toBe(2);
    expect(second.result.tools).toHaveLength(12);
  });

  it('does not write responses for notifications', async () => {
    const daemon = standardFakeDaemon();
    const written: string[] = [];
    async function* input(): AsyncIterableIterator<string> {
      yield JSON.stringify({ jsonrpc: '2.0', method: 'initialized' });
      yield JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
    }
    await runStdio(daemon, {
      input: input(),
      write: (s: string) => { written.push(s); },
    });
    expect(written).toHaveLength(1);
    const only = JSON.parse(written[0].trim());
    expect(only.id).toBe(1);
  });

  it('writes a parse-error response on garbage input', async () => {
    const daemon = standardFakeDaemon();
    const written: string[] = [];
    async function* input(): AsyncIterableIterator<string> {
      yield 'this is not json';
    }
    await runStdio(daemon, {
      input: input(),
      write: (s: string) => { written.push(s); },
    });
    expect(written).toHaveLength(1);
    const only = JSON.parse(written[0].trim());
    expect(only.error.code).toBe(RPC_ERR.parse);
  });
});
