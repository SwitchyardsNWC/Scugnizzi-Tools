// A design system pasted in.
//
// Defended: the five shapes are told apart; a `.system.json` round-trips and a partial one keeps everything it
// did not mention; replacing the palette repoints every preset, button and border onto it, so nothing falls back
// to black; a web page's numbers are refused by range rather than taken; and the things that must never be
// inferred are not.

import { describe, expect, it } from 'vitest';

import { DEFAULT_DESIGN_SYSTEM, theme, type DesignSystem } from '../src/model/design-system.ts';
import { serializeDesignSystem } from '../src/model/serialize.ts';
import { switchyardsDesignSystem } from '../src/model/switchyards.ts';
import { detectShape, importDesignSystem, normalizeHex, repointRefs, tokenName } from '../src/model/import-system.ts';

const base = DEFAULT_DESIGN_SYSTEM;

describe('reading a colour', () => {
  it('takes the shapes a design system writes, and lowercases every one', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('#D20000')).toBe('#d20000');
    expect(normalizeHex('d20000')).toBe('#d20000');
    expect(normalizeHex('  #F7F6F3  ')).toBe('#f7f6f3');
    expect(normalizeHex('rgb(1, 18, 114)')).toBe('#011272');
    expect(normalizeHex('rgba(255, 255, 255, 0.5)')).toBe('#ffffff');
    // Eight digits carry transparency; the colour survives, the alpha does not.
    expect(normalizeHex('#011272ff')).toBe('#011272');
  });

  it('is nothing for what is not a colour', () => {
    expect(normalizeHex('navy')).toBeNull();
    expect(normalizeHex('var(--navy)')).toBeNull();
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex('#12')).toBeNull();
  });
});

describe('naming a colour the source did not name well', () => {
  it('drops the words that say where a token lives, never the word that says what it is', () => {
    const taken = new Map<string, string>();
    expect(tokenName('--color-brand-navy', taken, '#011272')).toBe('navy');
    expect(tokenName('color/palette/red', new Map(), '#d20000')).toBe('red');
    expect(tokenName('--text-primary', new Map(), '#111111')).toBe('primary');
    // The last part is never dropped, even when it is a word that usually is.
    expect(tokenName('--color', new Map(), '#111111')).toBe('color');
  });

  it('keeps a number attached to the word in front of it', () => {
    expect(tokenName('--brand-500', new Map(), '#111111')).toBe('brand500');
  });

  it('gives a second colour that wants the same name a name of its own', () => {
    const taken = new Map<string, string>([['red', '#d20000']]);
    expect(tokenName('--accent-red', taken, '#ff0000')).toBe('accentRed');
  });

  it('lets the same colour keep the same name', () => {
    const taken = new Map<string, string>([['red', '#d20000']]);
    expect(tokenName('--brand-red', taken, '#d20000')).toBe('red');
  });
});

describe('telling the shapes apart', () => {
  it('knows a system, a token file, CSS, a page, loose text and nothing', () => {
    expect(detectShape(serializeDesignSystem(base))).toBe('system');
    expect(detectShape('{"color":{"navy":{"value":"#011272"}}}')).toBe('tokens');
    expect(detectShape(':root { --navy: #011272 }')).toBe('css');
    expect(detectShape('<html><body><p>Navy #011272</p></body></html>')).toBe('html');
    expect(detectShape('Navy #011272\nRed #d20000')).toBe('text');
    expect(detectShape('   ')).toBe('none');
    expect(detectShape('just some words about a brand')).toBe('none');
  });
});

describe('a design system file', () => {
  it('round-trips', () => {
    const out = importDesignSystem(serializeDesignSystem(switchyardsDesignSystem()));
    expect(out.shape).toBe('system');
    expect(out.ds).toEqual(switchyardsDesignSystem());
    expect(out.warnings).toEqual([]);
  });

  it('keeps every value it did not mention, and repoints what named the old palette', () => {
    const out = importDesignSystem('{"colors":{"ink":"#111111"},"fontStack":"Georgia, serif"}');
    expect(out.ds.colors).toEqual({ ink: '#111111' });
    expect(out.ds.containerWidth).toBe(600);
    expect(out.ds.type).toEqual(base.type);
    // The invariant that matters: every preset still resolves to the colours it resolved to before.
    expect(theme(out.ds, 'cream')).toEqual(theme(base, 'cream'));
    expect(theme(out.ds, 'navy')).toEqual(theme(base, 'navy'));
    expect(out.warnings.join(' ')).toContain('cream');
  });

  it('drops a key that is not the right shape instead of spreading it', () => {
    const out = importDesignSystem('{"colors":{"ink":"#111"},"containerWidth":"six hundred","type":"big","themes":{}}');
    expect(out.ds.colors['ink']).toBe('#111111');
    expect(out.ds.containerWidth).toBe(600);
    expect(out.ds.type).toEqual(base.type);
    // The presets were refused, so they are still the shipped ones — repointed onto the new palette, which is
    // why they are compared by what they resolve to rather than by the names they now carry.
    expect(Object.keys(out.ds.themes)).toEqual(Object.keys(base.themes));
    for (const name of Object.keys(base.themes)) expect(theme(out.ds, name)).toEqual(theme(base, name));
    expect(out.warnings.join(' ')).toContain('background preset');
  });

  it('refuses a width that belongs to a page', () => {
    const out = importDesignSystem('{"colors":{"a":"#111"},"containerWidth":1280}');
    expect(out.ds.containerWidth).toBe(600);
    expect(out.warnings.join(' ')).toContain('1280');
  });
});

describe('replacing the palette', () => {
  it('leaves nothing naming a colour that is gone', () => {
    const next: DesignSystem = { ...structuredClone(base), colors: { ink: '#111111' } };
    const { ds, lost } = repointRefs(next, base.colors);
    expect(lost.length).toBeGreaterThan(0);
    for (const preset of Object.values(ds.themes)) {
      for (const ref of [preset.band, preset.container, preset.text, preset.link]) {
        if (ref === null) continue;
        expect(ref.startsWith('#') || ds.colors[ref] !== undefined).toBe(true);
      }
    }
    // The value survived even though the name did not.
    expect(theme(ds, 'navy')).toEqual(theme(base, 'navy'));
  });

  it('keeps a name when the new palette holds the same colour under a new one', () => {
    const navy = base.colors['navy']!;
    const next: DesignSystem = { ...structuredClone(base), colors: { midnight: navy } };
    const { ds } = repointRefs(next, base.colors);
    expect(ds.themes['navy']!.band).toBe('midnight');
  });
});

describe('a page of CSS custom properties', () => {
  const css = `
    :root {
      --color-brand-navy: #011272;
      --color-brand-red: #D20000;
      --color-paper: #f7f6f3;
      --font-body: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      --font-heading: Georgia, serif;
      --text-h1: 36px;
      --text-h2: 22px;
      --text-body: 18px;
      --radius-button: 9999px;
      --container-width: 600px;
    }
  `;

  it('takes the palette, the stacks, the named roles and the shape', () => {
    const out = importDesignSystem(css);
    expect(out.shape).toBe('css');
    expect(out.ds.colors).toEqual({ navy: '#011272', red: '#d20000', paper: '#f7f6f3' });
    expect(out.ds.fontStack).toBe("'Helvetica Neue', Helvetica, Arial, sans-serif");
    expect(out.ds.fonts['heading']).toBe('Georgia, serif');
    expect(out.ds.type['h1']!.size).toBe(36);
    expect(out.ds.type['h2']!.size).toBe(22);
    expect(out.ds.type['body']!.size).toBe(18);
    // A heading stack that differs from the email's font is named by the heading roles.
    expect(out.ds.type['h1']!.font).toBe('heading');
    expect(out.ds.containerWidth).toBe(600);
    expect(out.ds.buttons['primary']!.radius).toBe(25);
    expect(out.touched).toContain('colors');
  });

  it('still resolves every preset after the palette is replaced', () => {
    const out = importDesignSystem(css);
    for (const name of Object.keys(out.ds.themes)) {
      const resolved = theme(out.ds, name);
      expect(resolved.text).not.toBe('#000000');
    }
  });
});

describe('what is never inferred', () => {
  it('does not take the body size from a ladder that names no roles', () => {
    const out = importDesignSystem(':root{--size-1:48px;--size-2:32px;--size-3:24px;--size-4:20px;--size-5:16px;--size-6:14px}');
    expect(out.ds.type['h1']!.size).toBe(48);
    expect(out.ds.type['body']!.size).toBe(base.type['body']!.size);
  });

  it('never raises a phone size above the size it belongs to', () => {
    const out = importDesignSystem(':root{--text-h1:20px}');
    expect(out.ds.type['h1']!.size).toBe(20);
    expect(out.ds.type['h1']!.mobileSize).toBeLessThanOrEqual(20);
  });

  it('never reads the phone breakpoint from a media query', () => {
    const out = importDesignSystem(':root{--color-a:#111111}@media (max-width: 768px){body{font-size:14px}}');
    expect(out.ds.mobileBreakpoint).toBe(base.mobileBreakpoint);
  });

  it('never repairs a font stack', () => {
    const out = importDesignSystem(":root{--font-display:'Tiempos'}");
    expect(out.ds.fonts['display']).toBe("'Tiempos'");
    expect(out.ds.fontStack).toBe("'Tiempos'");
    expect(out.warnings.join(' ')).toContain('body font');
  });
});

describe('a whole page', () => {
  it('reads its style block and ignores what its scripts say', () => {
    const html = `<!doctype html><html><head><title>Acme brand</title>
      <style>:root{--color-ink:#101010;--color-sand:#e8e2d9}</style>
      <script>const palette = { fake: "#ff00ff" };</script></head>
      <body><h1>Acme</h1></body></html>`;
    const out = importDesignSystem(html);
    expect(out.shape).toBe('html');
    expect(out.name).toBe('Acme brand');
    expect(Object.values(out.ds.colors)).toContain('#101010');
    expect(Object.values(out.ds.colors)).not.toContain('#ff00ff');
  });
});

describe('nothing usable', () => {
  it('says so and changes nothing', () => {
    const out = importDesignSystem('the brand is friendly and confident');
    expect(out.shape).toBe('none');
    expect(out.ds).toEqual(base);
    expect(out.touched).toEqual([]);
    expect(out.warnings[0]).toContain('Nothing');
  });
});

describe('what it produces is a system this project can save', () => {
  it('serializes and reads back as itself', () => {
    const out = importDesignSystem(':root{--color-ink:#101010;--text-h1:30px}');
    expect(importDesignSystem(serializeDesignSystem(out.ds)).ds).toEqual(out.ds);
  });
});
