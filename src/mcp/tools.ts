// MCP tool dispatch. Each MCP tool call becomes a call into the DaemonClient,
// wrapped in a zero-knowledge post-filter for exec output. Tools are pure
// dispatch — they never format for the LLM (that's the MCP transport's job).

import { redact } from './redact';
import type {
  AnomalySummary,
  DaemonClient,
  ExecResult,
  GrantSummary,
  ItemHistoryEntry,
  ProviderInfo,
  ToolCatalogEntry,
  UriLintResult,
  VaultItemSummary,
} from './types';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: object;
}

/**
 * The 12 tools this server exposes. Descriptions are user-facing (shown by
 * clients like Cursor / Claude Desktop when the agent picks a tool).
 */
export const TOOL_DEFS: readonly ToolDefinition[] = [
  {
    name: 'list_providers',
    description: 'List the AI providers Moltypass knows how to capture and proxy keys for.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_keys',
    description: 'List vault items (metadata only — no key values). Optionally filter by provider.',
    input_schema: {
      type: 'object',
      properties: { provider: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'list_grants',
    description: 'List active per-origin/per-tool consent grants. Optionally filter by key_id or origin.',
    input_schema: {
      type: 'object',
      properties: {
        key_id: { type: 'string' },
        origin: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_tools',
    description: 'List the tool-aware CLI catalog Moltypass knows how to run (moltypass exec <tool>).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_anomalies',
    description: 'List volume anomalies flagged by the extension since (optional) ms timestamp.',
    input_schema: {
      type: 'object',
      properties: { since: { type: 'number' } },
      additionalProperties: false,
    },
  },
  {
    name: 'item_history',
    description: 'Return the mutation log for one vault item, newest first.',
    input_schema: {
      type: 'object',
      properties: {
        key_id: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['key_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'annotate_item',
    description: 'Set the free-text notes on a vault item. Empty string clears.',
    input_schema: {
      type: 'object',
      properties: {
        key_id: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['key_id', 'notes'],
      additionalProperties: false,
    },
  },
  {
    name: 'revoke_grant',
    description: 'Revoke a specific consent grant. In-flight calls using it are terminated via revoke epoch.',
    input_schema: {
      type: 'object',
      properties: { grant_id: { type: 'string' } },
      required: ['grant_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'capture_key',
    description: 'Trigger the browser capture flow for a provider. Returns a capture URL and a placeholder key id.',
    input_schema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        label: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['provider', 'label'],
      additionalProperties: false,
    },
  },
  {
    name: 'rotate_key',
    description: 'Rotate a key. Crash-safe: writes the new key and mirrors grants before retiring the old.',
    input_schema: {
      type: 'object',
      properties: {
        key_id: { type: 'string' },
        new_key_from_capture: { type: 'string' },
      },
      required: ['key_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'exec',
    description: 'Run a command with the right AI provider keys injected via moltypass exec. Returns stdout/stderr/exit code with any key-shaped substrings redacted.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'array', items: { type: 'string' } },
        provider_hint: { type: 'string' },
        label: { type: 'string' },
        cwd: { type: 'string' },
        timeout_ms: { type: 'number' },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
  {
    name: 'uri_lint',
    description: 'Validate a moltypass:// URI. Reports whether the syntax is legal and whether the referenced item exists. NEVER returns the value.',
    input_schema: {
      type: 'object',
      properties: { uri: { type: 'string' } },
      required: ['uri'],
      additionalProperties: false,
    },
  },
] as const;

export interface ToolCallInput {
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolCallOutput =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } };

/** Route one MCP tool call to the daemon. Pure dispatch, no MCP framing. */
export async function handleToolCall(
  daemon: DaemonClient,
  input: ToolCallInput,
): Promise<ToolCallOutput> {
  try {
    switch (input.name) {
      case 'list_providers': {
        const providers: ProviderInfo[] = await daemon.listProviders();
        return { ok: true, result: { providers } };
      }
      case 'list_keys': {
        const provider = str(input.arguments.provider);
        const keys: VaultItemSummary[] = await daemon.listKeys(
          provider !== undefined ? { provider } : undefined,
        );
        return { ok: true, result: { keys } };
      }
      case 'list_grants': {
        const filter: { key_id?: string; origin?: string } = {};
        if (str(input.arguments.key_id)) filter.key_id = str(input.arguments.key_id);
        if (str(input.arguments.origin)) filter.origin = str(input.arguments.origin);
        const grants: GrantSummary[] = await daemon.listGrants(filter);
        return { ok: true, result: { grants } };
      }
      case 'list_tools': {
        const tools: ToolCatalogEntry[] = await daemon.listTools();
        return { ok: true, result: { tools } };
      }
      case 'list_anomalies': {
        const since = num(input.arguments.since);
        const anomalies: AnomalySummary[] = await daemon.listAnomalies(since);
        return { ok: true, result: { anomalies } };
      }
      case 'item_history': {
        const keyId = requireStr(input.arguments.key_id, 'key_id');
        const limit = num(input.arguments.limit);
        const events: ItemHistoryEntry[] = await daemon.itemHistory(keyId, limit);
        return { ok: true, result: { events } };
      }
      case 'annotate_item': {
        const keyId = requireStr(input.arguments.key_id, 'key_id');
        const notes = requireStr(input.arguments.notes, 'notes');
        const r = await daemon.annotateItem(keyId, notes);
        return { ok: true, result: { ok: true, updated_at: r.updated_at } };
      }
      case 'revoke_grant': {
        const grantId = requireStr(input.arguments.grant_id, 'grant_id');
        const r = await daemon.revokeGrant(grantId);
        return { ok: true, result: { ok: true, ...r } };
      }
      case 'capture_key': {
        const provider = requireStr(input.arguments.provider, 'provider');
        const label = requireStr(input.arguments.label, 'label');
        const notes = str(input.arguments.notes);
        const r = await daemon.captureKey(provider, label, notes);
        return { ok: true, result: { ok: true, ...r } };
      }
      case 'rotate_key': {
        const keyId = requireStr(input.arguments.key_id, 'key_id');
        const newKey = str(input.arguments.new_key_from_capture);
        const r = await daemon.rotateKey(keyId, newKey);
        return { ok: true, result: { ok: true, ...r } };
      }
      case 'exec': {
        const command = requireStrArray(input.arguments.command, 'command');
        const providerHint = str(input.arguments.provider_hint);
        const label = str(input.arguments.label);
        const cwd = str(input.arguments.cwd);
        const timeoutMs = num(input.arguments.timeout_ms);
        const raw = await daemon.exec(command, {
          provider_hint: providerHint,
          label,
          cwd,
          timeout_ms: timeoutMs,
        });
        // Zero-knowledge: scrub key shapes from child output.
        const stdoutR = redact(raw.stdout);
        const stderrR = redact(raw.stderr);
        const providers = [...new Set([...stdoutR.providersRedacted, ...stderrR.providersRedacted])];
        const result: ExecResult = {
          ok: raw.exit_code === 0,
          stdout: stdoutR.text,
          stderr: stderrR.text,
          exit_code: raw.exit_code,
          duration_ms: raw.duration_ms,
          redactions: {
            stdout_count: stdoutR.redactionCount,
            stderr_count: stderrR.redactionCount,
            providers,
          },
        };
        return { ok: true, result };
      }
      case 'uri_lint': {
        const uri = requireStr(input.arguments.uri, 'uri');
        // Import lazily to keep this module test-friendly if uri parser lives
        // in a different tree.
        const { parseMoltypassUri } = await import('./uri-parser');
        const parsed = parseMoltypassUri(uri);
        if ('kind' in parsed) {
          return {
            ok: true,
            result: {
              valid_syntax: false,
              syntax_error: parsed.detail,
              exists: false,
            } as UriLintResult,
          };
        }
        // Syntax OK — check existence against the daemon (does NOT return value).
        const lookup = await daemon.uriLintCheck(uri);
        return {
          ok: true,
          result: {
            valid_syntax: true,
            exists: lookup.exists,
            key_id: lookup.key_id,
          } as UriLintResult,
        };
      }
      default:
        return { ok: false, error: { code: 'unknown_tool', message: 'Unknown tool: ' + input.name } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        code: /vault[_ ]?locked|user[_ ]?denied|unknown_key|unknown_grant/i.test(message)
          ? 'daemon_error'
          : 'internal',
        message,
      },
    };
  }
}

// ------- tiny arg helpers -------

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function requireStr(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error('missing_arg:' + field);
  return v;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function requireStrArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) {
    throw new Error('missing_arg:' + field);
  }
  return v as string[];
}
