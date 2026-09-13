// The dark-mode simulation is the one part of the preview that transforms the compiled output
// rather than showing it, so it gets its own tests.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { importV1 } from '../src/model/import-v1.ts';
import { compile } from '../src/compile/compile.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { darkRules, simulateDark } from '../src/compile/dark.ts';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../reference/v1-standard-email.design.json', import.meta.url)), 'utf8'),
);
const template = importV1(fixture).template;
const html = compile(template, { mode: 'preview' }).html;

describe('simulateDark', () => {
  it('lifts every rule out of the media block', () => {
    const rules = darkRules(html);
    expect(rules).toContain('.sy-bg-011272 { background-color:#011272 !important }');
    expect(rules).toContain('background-color:#f7f6f3 !important');
    // Every colour the design used, not a sample of them.
    expect(rules.split('\n').length).toBeGreaterThan(5);
  });

  it('re-asserts them unconditionally, inside the head', () => {
    const dark = simulateDark(html);
    expect(dark).toContain('Dark-mode simulation');
    expect(dark.indexOf('Dark-mode simulation')).toBeLessThan(dark.indexOf('</head>'));
    // The original media block is left alone — this adds, it does not rewrite.
    expect(dark).toContain('@media (prefers-color-scheme: dark)');
  });

  it('is a no-op on markup with no dark block', () => {
    expect(simulateDark('<p>hi</p>')).toBe('<p>hi</p>');
    expect(darkRules('<p>hi</p>')).toBe('');
  });

  it('does not inject a broken stylesheet when the braces are unbalanced', () => {
    const broken = '<head></head>@media (prefers-color-scheme: dark) { .a { color:red }';
    expect(simulateDark(broken)).toBe(broken);
  });

  it('handles the nested braces of a real rule block', () => {
    const nested = '@media (prefers-color-scheme: dark) { .a { color:red } .b { color:blue } } .c { color:green }';
    expect(darkRules(nested)).toBe('.a { color:red } .b { color:blue }');
  });
});

describe('a type role’s own colour survives dark mode', () => {
  // The bug Jared found: a role coloured red rendered red in a light client and reverted to the
  // section's colour in a dark one. The force-light layer re-asserts `.sy-text-<hex> <element>`
  // with `!important` across every descendant — which is what stops a dark client rewriting the
  // email, and was also overriding the designer's own choice, because a colour living only in a
  // stylesheet rule never reached the registry (learnings 2.6).
  const withRoleColour = (role: string) => {
    const ds = structuredClone(DEFAULT_DESIGN_SYSTEM);
    ds.type[role] = { ...ds.type[role]!, color: 'red' };
    return compile({ ...template, ds }, { mode: 'hubl' }).html;
  };

  it('re-asserts the role after the section colour, so the role wins the tie', () => {
    const html = withRoleColour('h1');
    const dark = html.slice(html.indexOf('@media (prefers-color-scheme: dark)'));
    const section = dark.indexOf('.sy-text-011272');
    const role = dark.indexOf('.sy-rich h1 { color:#d10000 !important }');
    expect(section).toBeGreaterThan(-1);
    expect(role).toBeGreaterThan(-1);
    // Same specificity and both `!important`, so source order decides it.
    expect(role).toBeGreaterThan(section);
  });

  it('covers the block the template renders as well as the one the team types', () => {
    // Two different elements: `.sy-rich h1` is an h1 typed in HubSpot's editor, `h1.sy-h1` is a
    // Heading block. Element-plus-class on the second, or it loses to `.sy-text-x h1` by a notch.
    const html = withRoleColour('h2');
    expect(html).toContain('.sy-rich h2 { color:#d10000 !important }');
    expect(html).toContain('h2.sy-h2 { color:#d10000 !important }');
  });

  it('covers the Outlook.com layer too', () => {
    expect(withRoleColour('h1')).toContain('[data-ogsc] .sy-rich h1 { color:#d10000 !important }');
  });

  it('says nothing for a role that follows the background', () => {
    // The default, and the common case. A rule per role per layer for colours nobody chose would be
    // bytes in every send against the Gmail clip (learnings 2.12).
    const plain = compile(template, { mode: 'hubl' }).html;
    expect(plain).not.toContain('.sy-rich h1 { color:');
    expect(plain).not.toContain('h1.sy-h1 { color:');
  });
});
