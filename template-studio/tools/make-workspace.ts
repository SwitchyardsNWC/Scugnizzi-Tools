// The example workspace: what a folder looks like once it has shared design systems.
//
//   npm run workspace
//
// Writes, into this project's own folder (which the app can open as a workspace):
//
//   design-systems/switchyards.system.json   the brand system — the shipped values, as a file
//   design-systems/card.system.json          the card look, from the Phase 0 probe
//   templates/standard-email.template.json   the standard email, following `switchyards`
//   templates/card-email.template.json       the card email, following `card`
//
// Built from the model rather than typed out, for the reason the baseline is: a fixture written
// as JSON is right on the day it is written and wrong from the first model change after. And the
// templates are written *through* `serializeTemplate`, so they carry no copy of their system — a
// template that follows a folder system holds it in memory only (types.ts, `designSystem`).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { followFolderSystem } from '../src/model/edit.ts';
import { importV1 } from '../src/model/import-v1.ts';
import { serializeDesignSystem, serializeTemplate, systemFileName, templateFileName } from '../src/model/serialize.ts';
import { cardDesignSystem, cardTemplate } from '../src/model/starters.ts';
import type { Template } from '../src/model/types.ts';

// `fileURLToPath`, not `url.pathname`: a pathname is percent-encoded, so a project living in a
// folder whose name contains a space resolves to a directory that does not exist — and because
// `mkdirSync` is recursive, the tool cheerfully creates it and writes the output there. That is
// exactly what happened when this project moved into a folder with two spaces in its name.
const here = (path: string) => resolve(dirname(fileURLToPath(import.meta.url)), '..', path);
const write = (path: string, text: string) => {
  mkdirSync(dirname(here(path)), { recursive: true });
  writeFileSync(here(path), text);
  return path;
};

const systems = {
  switchyards: structuredClone(DEFAULT_DESIGN_SYSTEM),
  card: cardDesignSystem(),
};

const fixture = JSON.parse(readFileSync(here('reference/v1-standard-email.design.json'), 'utf8'));
const standard: Template = followFolderSystem(importV1(fixture).template, 'switchyards', systems.switchyards);
const card: Template = followFolderSystem(cardTemplate(), 'card', systems.card);

for (const [name, system] of Object.entries(systems)) {
  write(`design-systems/${systemFileName(name)}`, serializeDesignSystem(system));
}
write(
  'design-systems/README.md',
  [
    '# Design systems',
    '',
    'One file per system. A template names the one it follows in its `designSystem` field and',
    'carries no copy of its own; every edit in Design goes back to the file here, so every template',
    'that names the same system moves together. `switchyards` is the brand system. `card` is the',
    'monospace, bordered look from the Phase 0 probe.',
    '',
    'Regenerate the examples with `npm run workspace`.',
    '',
  ].join('\n'),
);
for (const template of [standard, card]) {
  const out = compile(template, { mode: 'hubl' });
  const errors = errorsIn(lint({ ...out, mode: 'hubl', template }));
  if (errors.length) {
    console.error(`${template.name}: ${errors.map((e) => e.rule).join(', ')}`);
    process.exitCode = 1;
  }
  const path = write(`templates/${templateFileName(template)}`, serializeTemplate(template));
  console.log(`${path}  follows ${template.designSystem}  ·  ${(out.bytes / 1024).toFixed(1)}KB${errors.length ? '  ·  NOT clean' : ''}`);
}
console.log('design-systems/switchyards.system.json, design-systems/card.system.json');
