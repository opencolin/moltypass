// Minimal MCP JSON-RPC 2.0 server. Hand-rolled — no @modelcontextprotocol/sdk
// dependency at v2.1 to keep the install lean; a full SDK swap-in is a
// mechanical change if desired later.
//
// Wire format (per MCP spec 2026 revision):
//   - Line-delimited JSON over stdio; each stdout line is one JSON-RPC
//     message.
//   - JSON-RPC 2.0 requests: { jsonrpc: "2.0", id, method, params? }
//   - JSON-RPC 2.0 responses: { jsonrpc: "2.0", id, result? | error? }
//   - Notifications: { jsonrpc: "2.0", method, params? }  (no id)
//
// MCP methods we implement:
//   - initialize                     — capabilities handshake
//   - initialized                    — client acknowledgement (no-op)
//   - tools/list                     — enumerate our 12 tools
//   - tools/call                     — dispatch to handleToolCall
//   - ping                           — health check
//   - notifications/*                — silently swallowed

import { handleToolCall, TOOL_DEFS } from './tools';
import type { DaemonClient } from './types';

export const PROTOCOL_VERSION = '2026-06-01';
export const SERVER_INFO = { name: 'moltypass-mcp', version: '0.1.0' };
export const SERVER_CAPABILITIES = {
  tools: { listChanged: false },
  // Resources + prompts land in a follow-up commit; declare absent for now.
};

export interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** JSON-RPC 2.0 error codes we use. */
export const RPC_ERR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

/**
 * Dispatch one MCP JSON-RPC message. Returns the response object to write
 * back, or null if the message is a notification (no id) or an unknown
 * notification method.
 */
export async function handleRpc(
  daemon: DaemonClient,
  msg: RpcRequest,
): Promise<RpcResponse | null> {
  // Ignore malformed / notification-shaped input.
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (msg && msg.id !== undefined && msg.id !== null) {
      return err(msg.id, RPC_ERR.invalidRequest, 'invalid JSON-RPC request');
    }
    return null;
  }

  const isNotification = msg.id === undefined || msg.id === null;
  const id = isNotification ? null : (msg.id as string | number);

  switch (msg.method) {
    case 'initialize': {
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: SERVER_CAPABILITIES,
      });
    }
    case 'initialized':
    case 'notifications/initialized':
    case 'notifications/cancelled':
      // Client acknowledgements + cancel notifications: no response.
      return null;
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: TOOL_DEFS.map(t => ({ ...t })) });
    case 'tools/call': {
      const params = msg.params as { name?: unknown; arguments?: unknown } | undefined;
      if (!params || typeof params.name !== 'string') {
        return err(id, RPC_ERR.invalidParams, 'missing tool name');
      }
      const args =
        params.arguments && typeof params.arguments === 'object'
          ? (params.arguments as Record<string, unknown>)
          : {};
      const out = await handleToolCall(daemon, { name: params.name, arguments: args });
      if (out.ok) {
        return ok(id, {
          content: [{ type: 'text', text: JSON.stringify(out.result) }],
          isError: false,
        });
      }
      return ok(id, {
        content: [
          { type: 'text', text: JSON.stringify({ error: out.error }) },
        ],
        isError: true,
      });
    }
    case 'shutdown':
      return ok(id, {});
    default:
      if (isNotification) return null; // swallow unknown notifications
      return err(id, RPC_ERR.methodNotFound, 'method not found: ' + msg.method);
  }
}

function ok(id: string | number | null, result: unknown): RpcResponse {
  return { jsonrpc: '2.0', id, result };
}
function err(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): RpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

/**
 * Parse a JSON-RPC message from a raw line. Returns the message or a
 * synthetic parse error to write back.
 */
export function parseRpcLine(line: string):
  | { ok: true; msg: RpcRequest }
  | { ok: false; response: RpcResponse } {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return { ok: false, response: err(null, RPC_ERR.parse, 'empty message') };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, response: err(null, RPC_ERR.parse, 'not an object') };
    }
    return { ok: true, msg: parsed as RpcRequest };
  } catch (e) {
    return {
      ok: false,
      response: err(null, RPC_ERR.parse, e instanceof Error ? e.message : 'parse failed'),
    };
  }
}

/**
 * Long-running stdio loop bootstrap. Reads line-delimited JSON on `stdin`,
 * writes responses to `stdout`. This isn't invoked by the tests directly —
 * the test surface is `handleRpc` and `parseRpcLine`. Bin script calls
 * `runStdio()`.
 */
export async function runStdio(
  daemon: DaemonClient,
  streams: { input: AsyncIterable<string>; write: (s: string) => void } = defaultStdioStreams(),
): Promise<void> {
  for await (const line of streams.input) {
    const parsed = parseRpcLine(line);
    if (!parsed.ok) {
      streams.write(JSON.stringify(parsed.response) + '\n');
      continue;
    }
    const resp = await handleRpc(daemon, parsed.msg);
    if (resp) streams.write(JSON.stringify(resp) + '\n');
  }
}

function defaultStdioStreams(): { input: AsyncIterable<string>; write: (s: string) => void } {
  // Node-only. Guarded so the module still imports in browser test environments.
  const write = (s: string): void => {
    process.stdout.write(s);
  };
  async function* lines(): AsyncIterableIterator<string> {
    let buf = '';
    for await (const chunk of process.stdin as unknown as AsyncIterable<Buffer>) {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        yield buf.slice(0, idx);
        buf = buf.slice(idx + 1);
      }
    }
    if (buf.length > 0) yield buf;
  }
  return { input: lines(), write };
}
