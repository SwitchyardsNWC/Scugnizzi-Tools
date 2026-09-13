// One design system per folder, and the templates that follow it.
//
// The layer `types.ts` said was not built. A template names a folder system; while it does, its
// `ds` is that file materialised on open and written back on edit, and never saved into the
// template's own file — so five templates on one system are one system, not five copies.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { completeDesignSystem, DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { detachFromFolderSystem, followFolderSystem, materialiseFolderSystem, resetDesignSystem, setValue } from '../src/model/edit.ts';
import { serializeDesignSystem, serializeTemplate, systemFileName, patternFileName, fileSlug } from '../src/model/serialize.ts';
import { blankTemplate, cardDesignSystem, cardTemplate } from '../src/model/starters.ts';

describe('following a folder system', () => {
  it('materialises the system and re-resolves every section that names a preset', () => {
    const card = cardDesignSystem();
    const t = followFolderSystem(blankTemplate(), 'card', card);
    expect(t.designSystem).toBe('card');
    expect(t.ds).toBe(card);
    // The blank template's footer names the banded preset — `navy` in the shipped system — which
    // the card system does not have, so it keeps its stored colours: following is not a repaint
    // of sections that name nothing the system knows.
    const footer = t.sections.find((s) => s.domId === 'section-legal')!;
    expect(footer.theme).toBe('navy');
    // But the output is set in the folder system's face and colours.
    expect(compile(t, { mode: 'hubl' }).html).toContain('Menlo, Consolas, Courier New, monospace');
  });

  it('a section naming a preset the system has follows it', () => {
    const t = followFolderSystem(cardTemplate(), 'card', cardDesignSystem());
    const tuned = setValue(t, { kind: 'template' }, 'ds.colors.ink', '#222222');
    const footer = tuned.sections.find((s) => s.domId === 'section-legal')!;
    expect(footer.bandColor).toBe('#222222');
    expect(tuned.designSystem).toBe('card');
  });

  it('is written to the template file without the system', () => {
    const t = followFolderSystem(cardTemplate(), 'card', cardDesignSystem());
    const json = JSON.parse(serializeTemplate(t));
    expect(json.designSystem).toBe('card');
    expect(json.ds).toBeUndefined();
    // And a template that carries its own system still writes it.
    const own = JSON.parse(serializeTemplate(cardTemplate()));
    expect(own.ds).toBeDefined();
    expect(own.designSystem).toBeUndefined();
  });

  it('detaching keeps the system as the template’s own copy, so nothing moves on screen', () => {
    const t = followFolderSystem(cardTemplate(), 'card', cardDesignSystem());
    const before = compile(t, { mode: 'hubl', date: '2026-01-01' }).html;
    const own = detachFromFolderSystem(t);
    expect(own.designSystem).toBeUndefined();
    expect(own.ds).toEqual(cardDesignSystem());
    expect(compile(own, { mode: 'hubl', date: '2026-01-01' }).html).toBe(before);
  });

  it('resetting a folder-backed template resets the system rather than dropping it', () => {
    const t = followFolderSystem(cardTemplate(), 'card', cardDesignSystem());
    const reset = resetDesignSystem(t);
    expect(reset.designSystem).toBe('card');
    expect(reset.ds).toEqual(DEFAULT_DESIGN_SYSTEM);
    // Sections re-resolved against the shipped values: `white` and `ink` are not presets there,
    // so they keep their colours — but the footer still says which preset it means.
    expect(reset.sections.find((s) => s.domId === 'section-legal')!.theme).toBe('ink');
  });
});

describe('opening a template that names a system', () => {
  it('materialises it from the folder', () => {
    const saved = JSON.parse(serializeTemplate(followFolderSystem(cardTemplate(), 'card', cardDesignSystem())));
    const { template, warning } = materialiseFolderSystem(saved, { card: cardDesignSystem() });
    expect(warning).toBeUndefined();
    expect(template.ds).toEqual(cardDesignSystem());
  });

  it('warns, rather than silently falling back, when the folder lacks it', () => {
    const saved = JSON.parse(serializeTemplate(followFolderSystem(cardTemplate(), 'card', cardDesignSystem())));
    const { template, warning } = materialiseFolderSystem(saved, {});
    expect(warning).toMatch(/"card"/);
    expect(template.ds).toBeUndefined();
    expect(template.designSystem).toBe('card');
  });

  it('leaves a template that names nothing alone', () => {
    const t = cardTemplate();
    expect(materialiseFolderSystem(t, { card: cardDesignSystem() }).template).toBe(t);
  });
});

describe('the system file', () => {
  it('round-trips through the serialiser', () => {
    const card = cardDesignSystem();
    expect(completeDesignSystem(JSON.parse(serializeDesignSystem(card)))).toEqual(card);
  });

  it('fills keys a newer build added from the shipped values', () => {
    const old = { version: 1, colors: { ink: '#000000' }, fontStack: 'Georgia, serif' };
    const made = completeDesignSystem(old);
    expect(made.colors).toEqual({ ink: '#000000' });
    expect(made.fontStack).toBe('Georgia, serif');
    expect(made.pageBorderWidth).toBe(0);
    expect(made.type['h1']).toEqual(DEFAULT_DESIGN_SYSTEM.type['h1']);
    // And garbage is the shipped system, not a crash.
    expect(completeDesignSystem('nope')).toEqual(DEFAULT_DESIGN_SYSTEM);
  });

  it('names files from the system name, safely', () => {
    expect(systemFileName('Switchyards')).toBe('switchyards.system.json');
    expect(systemFileName('Card / probe look')).toBe('card-probe-look.system.json');
    expect(patternFileName('Footer with links')).toBe('footer-with-links.pattern.json');
    expect(fileSlug('   ')).toBe('untitled');
  });
});
