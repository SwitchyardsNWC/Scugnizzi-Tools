// Compile a template to a HubSpot coded email template, from the command line.
//
//   npm run compile -- reference/v1-standard-email.design.json
//   npm run compile -- my.template.json --preview --out preview.html
//
// This exists before the editor does on purpose: it makes the compiler usable, and therefore
// testable against real designs, from the first step rather than the second (architecture.md §4).

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import { importV1 } from '../src/model/import-v1.ts';
import { migrate } from '../src/model/schema.ts';
import { compile } from '../src/compile/compile.ts';
import { lint } from '../src/compile/lint.ts';
import { branchVariables, enumerateBranches } from '../src/compile/branches.ts';

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const input = argv.find((a) => !a.startsWith('--') && a !== option('out'));

if (!input) {
  console.error('usage: npm run compile -- <template.json | v1.design.json> [--preview] [--out file.html]');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(input, 'utf8'));

// A v1 design has a flat `blocks` array; a v2 template has `sections` and a schema version.
const isV1 = Array.isArray(raw.blocks) && !raw.sections;
const { template, warnings } = isV1 ? importV1(raw) : { template: migrate(raw), warnings: [] as string[] };

for (const warning of warnings) console.error(`  import: ${warning}`);

const mode = flag('preview') ? 'preview' : 'hubl';
const result = compile(template, { mode });
const out = option('out');

if (out) {
  writeFileSync(out, result.html);
  console.error(`wrote ${out}`);
} else {
  process.stdout.write(result.html);
}

// Everything else goes to stderr so the HTML can be piped.
const findings = lint({ tree: result.tree, registry: result.registry, html: result.html, bytes: result.bytes, mode });
const errors = findings.filter((f) => f.severity === 'error');

console.error(`\n${basename(input)} → ${mode}, ${(result.bytes / 1024).toFixed(1)}KB`);

const variables = branchVariables(result.tree);
if (variables.length) {
  console.error(
    `${variables.length} branch${variables.length === 1 ? '' : 'es'} (${enumerateBranches(variables).length} possible emails): ` +
      variables.map((v) => v.label).join(', '),
  );
}

for (const f of findings) console.error(`  ${f.severity === 'error' ? 'error' : 'warn '}  ${f.rule}: ${f.message}`);
if (!findings.length) console.error('  validation: clean');

process.exit(errors.length ? 1 : 0);
