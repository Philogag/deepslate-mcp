import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // vitest@4 defaults to node -- no JSDOM needed for headless-gl
    environment: 'node',
  },
  // Match the project's TS module resolution so imports with .js extensions work
  resolve: {
    conditions: ['node', 'import'],
  },
});
