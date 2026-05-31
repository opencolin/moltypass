import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx, defineManifest } from '@crxjs/vite-plugin';

// The @crxjs/vite-plugin rewrites manifest paths to point at compiled
// assets and bundles content scripts, the service worker, the inpage
// script (declared as a web_accessible_resource and built from src/inpage),
// and the React HTML entry points.

const manifest = defineManifest({
  manifest_version: 3,
  name: 'Moltypass',
  version: '0.0.1',
  description:
    'Encrypted vault for AI service API keys. Per-origin consent. Keys never enter the page.',
  minimum_chrome_version: '120',
  permissions: ['storage', 'alarms', 'tabs'],
  host_permissions: [
    'https://api.anthropic.com/*',
    'https://api.openai.com/*',
    'https://generativelanguage.googleapis.com/*',
  ],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_start',
      all_frames: false,
      world: 'ISOLATED',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['src/inpage/provider.ts'],
      matches: ['http://*/*', 'https://*/*'],
    },
  ],
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Moltypass',
  },
});

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        consent: 'src/consent/index.html',
        audit: 'src/audit/index.html',
      },
    },
  },
});
