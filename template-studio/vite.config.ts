import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  // Relative asset paths, so the built app runs from a file:// path or any subfolder of a static
  // server without being told where it lives.
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Two pages over one source tree: Template Studio, and the Freeform canvas as a tool of its own.
    // They share every module, so a change to the canvas lands in both.
    rollupOptions: { input: { main: page('index.html'), freeform: page('freeform.html') } },
  },
  test: {
    // The compiler is pure and DOM-free (acceptance.md §1), so the tests run in plain Node.
    // If a test ever needs a DOM, that test is testing the wrong layer.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
