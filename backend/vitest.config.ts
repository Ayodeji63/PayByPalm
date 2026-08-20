import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /**
     * setupFiles, not `env`: src/config.ts reads process.env at import time and
     * exits if anything is missing, and `env` is applied too late to satisfy it.
     * A setup file is imported before the test modules that pull config in.
     */
    setupFiles: ['./vitest.setup.ts'],
  },
});
