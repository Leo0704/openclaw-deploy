import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['apps/cli/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/node_modules/**', 'apps/cli/src/app/**'],
    },
  },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, '../apps/cli/src/app'),
      '@core': path.resolve(__dirname, '../apps/cli/src/core'),
      '@runtime': path.resolve(__dirname, '../apps/cli/src/runtime'),
      '@platform': path.resolve(__dirname, '../apps/cli/src/platform'),
      '@packaging': path.resolve(__dirname, '../apps/cli/src/packaging'),
      '@shared': path.resolve(__dirname, '../apps/cli/src/shared'),
    },
  },
});
