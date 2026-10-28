import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/api/**/*.ts', 'src/lib/**/*.ts', 'server/**/*.ts'],
      exclude: ['**/*.test.ts']
    }
  }
});
