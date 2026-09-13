import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the built app runs from a file:// path or any subfolder of a static
  // server without being told where it lives.
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    // The compiler is pure and DOM-free (acceptance.md §1), so the tests run in plain Node.
    // If a test ever needs a DOM, that test is testing the wrong layer.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
