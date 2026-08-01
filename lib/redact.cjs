// Plain-JS mirror of src/mcp/redact.ts + src/cli/redact.ts. Streaming
// redactor that scrubs provider-key-shaped substrings from a byte stream
// before it reaches the parent terminal.

'use strict';

const REDACTION_MARKER = '[REDACTED-BY-MOLTYPASS]';

// Longer prefixes first so more-specific matches win.
const KEY_SHAPES = [
  { name: 'anthropic',  re: /sk-ant-[A-Za-z0-9_-]{32,}/g },
  { name: 'openrouter', re: /sk-or-[A-Za-z0-9_-]{32,}/g },
  { name: 'openai',     re: /sk-[A-Za-z0-9_-]{32,}/g },
  { name: 'gemini',     re: /AIza[A-Za-z0-9_-]{35}/g },
  { name: 'nebius',     re: /nebius_[A-Za-z0-9_-]{20,}/g },
  { name: 'together',   re: /tgp_[A-Za-z0-9_-]{20,}/g },
  { name: 'groq',       re: /gsk_[A-Za-z0-9_-]{20,}/g },
  { name: 'cohere',     re: /co_[A-Za-z0-9_-]{40,}/g },
  { name: 'mistral',    re: /msl_[A-Za-z0-9_-]{20,}/g },
];

function redact(input) {
  if (!input || input.length === 0) return { text: '', count: 0, providers: [] };
  let text = input;
  let count = 0;
  const providers = new Set();
  for (const { name, re } of KEY_SHAPES) {
    const rx = new RegExp(re.source, 'g');
    const before = text;
    text = text.replace(rx, () => { count++; return REDACTION_MARKER; });
    if (before !== text) providers.add(name);
  }
  return { text, count, providers: [...providers] };
}

const SOFT_CAP = 64 * 1024;
const MIN_TAIL = 128;

function redactStream() {
  let buffer = '';
  let totalCount = 0;
  const totalProviders = new Set();

  function emit(raw) {
    const r = redact(raw);
    totalCount += r.count;
    for (const p of r.providers) totalProviders.add(p);
    return r;
  }

  return {
    push(chunk) {
      buffer += chunk;
      const lastNewline = buffer.lastIndexOf('\n');
      if (lastNewline >= 0) {
        const raw = buffer.slice(0, lastNewline + 1);
        buffer = buffer.slice(lastNewline + 1);
        return emit(raw);
      }
      if (buffer.length > SOFT_CAP) {
        const boundary = lastSafeBoundary(buffer, buffer.length - MIN_TAIL);
        if (boundary > 0) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary);
          return emit(raw);
        }
      }
      return { text: '', count: 0, providers: [] };
    },
    flush() {
      if (!buffer.length) return { text: '', count: 0, providers: [] };
      const raw = buffer;
      buffer = '';
      return emit(raw);
    },
    totals() { return { count: totalCount, providers: [...totalProviders] }; },
  };
}

function lastSafeBoundary(s, hint) {
  const start = Math.min(hint, s.length - 1);
  for (let i = start; i > 0; i--) {
    const c = s.charCodeAt(i);
    if (c <= 32 || c === 127) return i + 1;
  }
  return 0;
}

module.exports = { redact, redactStream, REDACTION_MARKER };
