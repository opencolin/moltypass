import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup/index.ts'],
    globals: false,
    include: ['tests/**/*.spec.ts', 'src/**/*.spec.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['tests/**', 'dist/**', 'web/**', '**/*.config.*'],
    },
  },
});
