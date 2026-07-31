// Streaming redactor for `moltypass exec` output. Wraps the same regex set
// as src/mcp/redact.ts but works on incrementally-arriving chunks so
// long-running commands don't buffer forever.
//
// The naive "emit all but the last LOOKBACK bytes" approach breaks under
// pathological chunking (e.g. one byte per push) because each emit sees
// only 1 char and no key shape survives. This impl instead:
//   1. Buffers all arriving bytes.
//   2. Emits only up to the last newline in the buffer, always keeping the
//      trailing partial line for the next push (so key-shaped tokens are
//      never split across an emit boundary — keys never contain newlines).
//   3. Falls back to a size-triggered emit if the buffer grows past
//      SOFT_CAP without a newline (e.g. a huge json blob on one line).
//      The forced-emit still runs redact() over the full buffer prefix and
//      only surrenders bytes up to a safe whitespace/boundary character.
//   4. On flush, runs a final redact() over whatever remains.

import { redact } from '../mcp/redact';

const SOFT_CAP = 64 * 1024;  // 64 KiB — force an emit even without a newline
const MIN_TAIL = 128;         // never emit trailing bytes shorter than this

export interface RedactStreamChunk {
  text: string;
  redactionCount: number;
  providers: string[];
}

export interface RedactStream {
  push(chunk: string): RedactStreamChunk;
  flush(): RedactStreamChunk;
  totals(): { count: number; providers: string[] };
}

export function redactStream(): RedactStream {
  let buffer = '';
  let totalCount = 0;
  const totalProviders = new Set<string>();

  return {
    push(chunk: string): RedactStreamChunk {
      buffer += chunk;
      // Emit up to and including the last newline. Keys never contain
      // newlines, so this is a safe boundary.
      const lastNewline = buffer.lastIndexOf('\n');
      if (lastNewline >= 0) {
        const emitRaw = buffer.slice(0, lastNewline + 1);
        buffer = buffer.slice(lastNewline + 1);
        return emit(emitRaw);
      }
      // No newline. Force-emit if the buffer is huge — pick a safe boundary
      // (last whitespace) so we still don't split a key.
      if (buffer.length > SOFT_CAP) {
        const boundary = lastSafeBoundary(buffer, buffer.length - MIN_TAIL);
        if (boundary > 0) {
          const emitRaw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary);
          return emit(emitRaw);
        }
      }
      return { text: '', redactionCount: 0, providers: [] };
    },
    flush(): RedactStreamChunk {
      if (buffer.length === 0) return { text: '', redactionCount: 0, providers: [] };
      const emitRaw = buffer;
      buffer = '';
      return emit(emitRaw);
    },
    totals() {
      return { count: totalCount, providers: [...totalProviders] };
    },
  };

  function emit(raw: string): RedactStreamChunk {
    const result = redact(raw);
    totalCount += result.redactionCount;
    for (const p of result.providersRedacted) totalProviders.add(p);
    return {
      text: result.text,
      redactionCount: result.redactionCount,
      providers: result.providersRedacted,
    };
  }
}

/**
 * Return the rightmost position ≤ hint at which we can safely cut without
 * splitting a possible key token. A safe cut is one immediately after a
 * whitespace / newline / null / control char (bytes that never appear in an
 * API-key alphabet). Returns 0 if no safe cut exists.
 */
function lastSafeBoundary(s: string, hint: number): number {
  const start = Math.min(hint, s.length - 1);
  for (let i = start; i > 0; i--) {
    const c = s.charCodeAt(i);
    if (c <= 32 || c === 127) return i + 1;
  }
  return 0;
}
