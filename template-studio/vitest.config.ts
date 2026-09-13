import { defineConfig } from 'vitest/config';

// The compiler is pure and DOM-free (acceptance.md §1), so the tests run in plain Node.
// If a test ever needs a DOM, that test is testing the wrong layer.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
