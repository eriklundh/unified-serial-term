import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test-hw/**/*.test.ts'],
    testTimeout: 30_000,
    // Sequential: multiple files must not claim the same USB device concurrently.
    fileParallelism: false,
  },
});
