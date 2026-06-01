// THIS FILE IS THE ONLY PLACE IN THE REPO ALLOWED TO CONTAIN KEY-SHAPED
// STRINGS. The CI grep guard (scripts/grep-no-keys.ts) enforces this.
//
// Tests that need to assert on key validation, shape regexes, or
// capture flows import from here. No real key bytes — all values are
// random synthetic strings shaped like the real thing.

export const SYNTHETIC = {
  // Synthetic Anthropic shape: sk-ant- prefix + random
  anthropic: 'sk-ant-' + 'A'.repeat(48),
  // Synthetic OpenAI shape: sk- prefix + random
  openai: 'sk-' + 'B'.repeat(48),
  // Synthetic Gemini shape: AIza prefix + random
  gemini: 'AIza' + 'C'.repeat(35),
} as const;
