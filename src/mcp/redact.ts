// Redaction for MCP exec output. The MCP zero-knowledge invariant requires
// that no key value reaches the MCP client, INCLUDING via a child process
// that prints its own key to stdout. Before returning exec output to the
// MCP client, we scan for key-shaped strings and replace them with a
// canonical redaction marker.
//
// The regexes here MUST stay in sync with the CI grep guard at
// scripts/grep-no-keys.ts. Add a provider here, add it there.

/**
 * Ordered list of provider-key regexes. Longer / more-specific shapes first
 * so a match of a longer prefix wins over a shorter one.
 *
 * Each regex is UNANCHORED at scan time (used with `g` flag over free-form
 * text). The shapes here are deliberately loose — the goal is preventing
 * accidental leakage, not distinguishing valid keys.
 */
const KEY_SHAPES: readonly { name: string; pattern: RegExp }[] = [
  // Longer prefixes come first so a more-specific match wins.
  // Anthropic — sk-ant-<32+ base64ish chars>
  { name: 'anthropic',  pattern: /sk-ant-[A-Za-z0-9_-]{32,}/g },
  // OpenRouter — sk-or-<32+ chars>. Must precede plain OpenAI sk-.
  { name: 'openrouter', pattern: /sk-or-[A-Za-z0-9_-]{32,}/g },
  // OpenAI — sk-<32+ chars>. Order matters — after sk-ant and sk-or.
  { name: 'openai',     pattern: /sk-[A-Za-z0-9_-]{32,}/g },
  // Google AI Studio / Gemini — AIza<35 chars>
  { name: 'gemini',     pattern: /AIza[A-Za-z0-9_-]{35}/g },
  // Nebius
  { name: 'nebius',     pattern: /nebius_[A-Za-z0-9_-]{20,}/g },
  // Together / Groq / Fireworks
  { name: 'together',   pattern: /tgp_[A-Za-z0-9_-]{20,}/g },
  { name: 'groq',       pattern: /gsk_[A-Za-z0-9_-]{20,}/g },
  { name: 'cohere',     pattern: /co_[A-Za-z0-9_-]{40,}/g },
  { name: 'mistral',    pattern: /msl_[A-Za-z0-9_-]{20,}/g },
];

export const REDACTION_MARKER = '[REDACTED-BY-MOLTYPASS]';

export interface RedactResult {
  /** The input with any key-shaped substrings replaced. */
  text: string;
  /**
   * Number of substrings replaced across all providers. Zero if the input
   * was already clean.
   */
  redactionCount: number;
  /** Which provider shapes matched, deduped. */
  providersRedacted: string[];
}

/**
 * Scan a string for provider-key shapes and replace each match with the
 * redaction marker. Pure function; idempotent (running twice does not
 * double-redact because the marker itself contains no key-shape chars).
 */
export function redact(input: string): RedactResult {
  if (input.length === 0) {
    return { text: '', redactionCount: 0, providersRedacted: [] };
  }
  let text = input;
  let redactionCount = 0;
  const providersRedacted = new Set<string>();
  for (const { name, pattern } of KEY_SHAPES) {
    // Recreate the regex per call so lastIndex is 0.
    const rx = new RegExp(pattern.source, 'g');
    const before = text;
    text = text.replace(rx, () => {
      redactionCount++;
      return REDACTION_MARKER;
    });
    if (before !== text) providersRedacted.add(name);
  }
  return { text, redactionCount, providersRedacted: [...providersRedacted] };
}

/** Cheap sniff — is there any risk of key-shape in this string? */
export function containsKeyShape(input: string): boolean {
  return KEY_SHAPES.some(({ pattern }) => new RegExp(pattern.source).test(input));
}
