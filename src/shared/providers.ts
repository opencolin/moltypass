import type { ProviderConfig, ProviderId } from './types';

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic (Claude)',
    apiBaseUrl: 'https://api.anthropic.com',
    authHeader: 'x-api-key',
    docsUrl: 'https://docs.anthropic.com',
    keyShape: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    createKeyUrl: 'https://console.anthropic.com/settings/keys',
    instructions: [
      'Sign in to console.anthropic.com.',
      'Click "Create Key" and give it a name.',
      'Moltypass detects the new key on the page and offers to save it — no clipboard needed.',
    ],
    prerequisites: 'You need a payment method on file to make API calls.',
  },
  openai: {
    id: 'openai',
    displayName: 'OpenAI',
    apiBaseUrl: 'https://api.openai.com',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    docsUrl: 'https://platform.openai.com/docs',
    keyShape: /^sk-[A-Za-z0-9_-]{20,}$/,
    createKeyUrl: 'https://platform.openai.com/api-keys',
    instructions: [
      'Sign in to platform.openai.com.',
      'Click "Create new secret key".',
      'When the one-time key modal appears, Moltypass captures it directly from the page.',
    ],
    prerequisites: 'You need a paid OpenAI account (you can add billing at platform.openai.com/billing).',
  },
  gemini: {
    id: 'gemini',
    displayName: 'Google Gemini',
    apiBaseUrl: 'https://generativelanguage.googleapis.com',
    authHeader: 'x-goog-api-key',
    docsUrl: 'https://ai.google.dev/docs',
    keyShape: /^[A-Za-z0-9_-]{30,}$/,
    createKeyUrl: 'https://aistudio.google.com/apikey',
    instructions: [
      'Sign in to aistudio.google.com.',
      'Click "Create API key" and pick a Cloud project.',
      'Moltypass captures the key from the AI Studio modal.',
    ],
    prerequisites: 'Free tier available; no billing required to start.',
  },
};

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDERS;
}

export function listProviders(): ProviderId[] {
  return Object.keys(PROVIDERS) as ProviderId[];
}
