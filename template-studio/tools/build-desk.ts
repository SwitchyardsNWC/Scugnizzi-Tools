// Builds the HubSpot desk (src/desk) into the files a claude.ai artifact publishes:
//
//   dist-desk/index.html    the page, written the way the Artifact tool wants it: no doctype, html, head or body of
//                           its own (claude.ai wraps it), its title and styles first
//   dist-desk/desk.js       the bundle: the desk, the compiler and Preact, one script published beside the page
//   dist-desk/preview.html  the same page as a whole document, for opening locally (there is no HubSpot there)
//
// The artifact's sandbox loads scripts only from its own files and a few CDNs, and styles only inline or from Google
// Fonts, so everything the desk needs is in these files.
//
//   npm run desk

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import { suiteDefine } from '../suite-version.ts';

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const out = at('dist-desk');
mkdirSync(out, { recursive: true });

const result = await build({
  entryPoints: [at('src/desk/main.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  define: suiteDefine,
  write: false,
  logLevel: 'warning',
});
const js = result.outputFiles[0]!.text;
const css = readFileSync(at('src/desk/desk.css'), 'utf8');

const page =
  `<title>Template Studio Desk</title>\n` +
  `<link rel="preconnect" href="https://fonts.googleapis.com">\n` +
  `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n` +
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=JetBrains+Mono:wght@300;400&display=swap">\n` +
  `<style>\n${css}</style>\n` +
  `<div id="desk"></div>\n` +
  `<script src="desk.js"></script>\n`;

writeFileSync(`${out}/desk.js`, js);
writeFileSync(`${out}/index.html`, page);
writeFileSync(`${out}/preview.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>\n${page}</body></html>\n`);

console.error(`dist-desk/index.html ${(page.length / 1024).toFixed(1)}KB, desk.js ${(js.length / 1024).toFixed(1)}KB`);
