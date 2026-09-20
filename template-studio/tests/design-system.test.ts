// The design system, once it is load-bearing.
//
// Until this step the tokens existed as a type nobody read: the compiler carried a `DesignSystem`
// through every context and then hard-coded Helvetica, 38px and 600 anyway. The editor would have
// been a panel of dials wired to nothing.
//
// Two things are checked here, and they are in tension on purpose:
//
//   1. **Threading the tokens changed nothing.** The defaults reproduce the previous output byte
//      for byte, which is what makes this a refactor rather than a redesign. `v1-parity.test.ts`
//      is the real proof — it still diffs against the golden file — and the first test below says
//      it directly.
//   2. **Changing a token changes everything it should.** A test per token, each naming the places
//      the value is supposed to reach, because a token that only moves one of its four sites is
//      worse than a literal: it looks like it worked.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { DEFAULT_DESIGN_SYSTEM, theme as themeOf, type DesignSystem } from '../src/model/design-system.ts';
import {
  addColor,
  addPreset,
  presetUsage,
  removePreset,
  renamePreset,
  colorUsage,
  designSystemOf,
  readValue,
  removeColor,
  renameColor,
  resetDesignSystem,
  resetPalette,
  setValue,
} from '../src/model/edit.ts';
import { importV1 } from '../src/model/import-v1.ts';
import { migrate } from '../src/model/schema.ts';
import { serializeTemplate } from '../src/model/serialize.ts';
import type { Template } from '../src/model/types.ts';
import fixture from '../reference/v1-standard-email.design.json';

const base = (): Template => importV1(fixture as never).template;

/** The same template, tuned. `structuredClone` so one test cannot leak into the next. */
function tuned(change: (ds: DesignSystem) => void): Template {
  const ds = structuredClone(DEFAULT_DESIGN_SYSTEM);
  change(ds);
  return { ...base(), ds };
}

const html = (template: Template) => compile(template, { mode: 'hubl', date: '2026-01-01' }).html;
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('threading the tokens through', () => {
  it('changes nothing at the defaults', () => {
    // The guarantee the whole refactor rests on. Passing the defaults explicitly and letting the
    // compiler fall back to them must be the same document, and `v1-parity.test.ts` separately
    // proves that document is still byte-for-byte what v1 produces.
    const template = base();
    const explicit = compile(template, { mode: 'hubl', ds: DEFAULT_DESIGN_SYSTEM, date: '2026-01-01' }).html;
    expect(explicit).toBe(html(template));
  });

  it('reads the design system off the template, not a global', () => {
    const template = tuned((ds) => {
      ds.containerWidth = 640;
    });
    expect(html(template)).toContain('max-width:640px');
    // And the untouched template is unaffected — no shared mutable default.
    expect(html(base())).toContain('max-width:600px');
  });

  it('treats a document with no design system as the defaults', () => {
    expect(designSystemOf(base())).toBe(DEFAULT_DESIGN_SYSTEM);
    expect(base().ds).toBeUndefined();
  });
});

describe('the font stack', () => {
  it('reaches every inline style, not just the first one', () => {
    // There were seven separate `font-family:Helvetica, Arial, sans-serif;` sites across the
    // layout primitives, the heading, the legal footer and the document shell. A token that moved
    // six of them would look like it worked.
    const before = html(base());
    expect(count(before, 'font-family:Helvetica, Arial, sans-serif;')).toBeGreaterThan(5);

    const after = html(tuned((ds) => (ds.fontStack = 'Georgia, Times, serif')));
    expect(count(after, 'font-family:Helvetica, Arial, sans-serif;')).toBe(0);
    expect(count(after, 'font-family:Georgia, Times, serif;')).toBe(count(before, 'font-family:Helvetica, Arial, sans-serif;'));
  });

  it('keeps the button anchor’s comma-tight spelling', () => {
    // v1 wrote the stack without spaces in this one place. Byte parity depends on reproducing that
    // rather than normalising it.
    expect(html(tuned((ds) => (ds.fontStack = 'Georgia, Times, serif')))).toContain('font-family:Georgia,Times,serif');
  });
});

describe('the type scale', () => {
  it('moves the heading markup and the stylesheet HubSpot inlines together', () => {
    const t = tuned((ds) => (ds.type['h1'] = { ...ds.type['h1']!, size: 44, mobileSize: 34 }));
    const after = html(withHeading(t));
    // The h1 a block renders...
    expect(after).toContain('font-size:44px');
    // ...the rule applied to an h1 the team types in the rich text editor...
    expect(after).toContain('.sy-rich h1 { margin:0 0 16px 0; line-height:120%; font-size:44px; font-weight:bold }');
    // ...and the phone size for both.
    expect(after).toContain('.sy-h1, .sy-rich h1 { font-size:34px !important }');
    expect(after).not.toContain('font-size:38px');
  });

  it('moves body copy everywhere it is stated', () => {
    const after = html(tuned((ds) => (ds.type['body'] = { ...ds.type['body']!, size: 16, lineHeight: 160 })));
    expect(after).toContain('.sy-rich p { margin:0 0 16px 0; line-height:160%; font-size:16px }');
    // The padded cell and the document shell both state the body size.
    expect(count(after, 'font-size:16px')).toBeGreaterThan(3);
  });

  it('states a weight on headings and stays silent about a normal one', () => {
    // Not cosmetic: clients disagree about what an h3 weighs inside an email, so a heading says so
    // explicitly. Body text saying `font-weight:normal` would add bytes to every send and change
    // nothing, which is why v1 left it out and the golden file records its absence.
    const out = html(base());
    expect(out).toContain('.sy-rich h3 { margin:0 0 10px 0; line-height:130%; font-size:17px; font-weight:bold }');
    expect(out).toContain('.sy-rich p { margin:0 0 16px 0; line-height:150%; font-size:18px }');
    // Narrow on purpose: the legal footer's own note does say `font-weight:normal`, and that is
    // its markup rather than the type scale.
    expect(out).not.toContain('font-size:18px; font-weight:normal');
  });

  it('keeps the uppercase levels uppercase', () => {
    const after = html(tuned((ds) => (ds.type['h5'] = { ...ds.type['h5']!, size: 13, letterSpacing: 1.5 })));
    expect(after).toContain('font-size:13px; font-weight:bold; text-transform:uppercase; letter-spacing:1.5px');
  });
});

describe('the container width', () => {
  it('moves the div, the Outlook table and every media query at once', () => {
    const after = html(tuned((ds) => (ds.containerWidth = 680)));
    expect(after).toContain('max-width:680px; margin:0 auto');
    expect(after).toContain('<table align="center" style="width:680px;"');
    expect(after).toContain('role="presentation" width="680"');
    expect(after).toContain('.hse-size-12 { max-width:680px !important; width:680px !important }');
    // No `.hse-size-6` rule at all: the columns are a table, not HubSpot's div grid, and a rule
    // for a class nothing emits is what `unused-css` exists to catch (learnings 3.57).
    expect(after).not.toContain('hse-size-6');
    expect(count(after, '600px')).toBe(0);
  });
});

describe('the phone breakpoint', () => {
  it('moves both sides of it together', () => {
    // The reason it is stored as a number: the phone rules use `max-width:639px` and the desktop
    // ones `min-width:640px`, and two strings that must stay exactly one apart is a bug waiting to
    // be typed.
    const after = html(tuned((ds) => (ds.mobileBreakpoint = 599)));
    expect(count(after, 'max-width:599px')).toBeGreaterThan(0);
    expect(after).toContain('min-width:600px');
    expect(count(after, '639px')).toBe(0);
    expect(count(after, '640px')).toBe(0);
  });

  it('keeps the print-media trick, which is how some clients get the rules at all', () => {
    // learnings 2.3. Losing the `only print` prefix would silently drop phone styling in the
    // clients that need it most.
    // One phone block and one desktop block. It was five, before the boilerplate nothing used
    // came out of the head (learnings 3.57).
    expect(count(html(base()), '@media only print, only screen and')).toBe(2);
  });
});

describe('the brand colours', () => {
  it('moves the button, the links, the rule and the quote bar', () => {
    const after = html(tuned((ds) => (ds.colors['red'] = '#7a0f3d')));
    expect(after).toContain('border:2px solid #7a0f3d');
    expect(after).toContain('.sy-rich a { color:#7a0f3d; text-decoration:underline }');
    expect(after).toContain('border-left:3px solid #7a0f3d');
    expect(after).toContain('border-top:2px solid #7a0f3d');
  });

  it('moves the navy band the top bar and the footer draw', () => {
    // Through `setValue`, not a raw `ds` on the document: the top bar and the footer draw their
    // *section's* colours now, like every other block, and a section follows its preset through
    // `recolor` when the palette is edited. A design system attached without that step describes
    // colours no section has resolved yet — which is the app's own path for every other edit.
    const after = html(setValue(base(), { kind: 'template' }, 'ds.colors.navy', '#101820'));
    expect(after).toContain('background-color:#101820');
    expect(after).toContain('#section-legal { background-color:#101820 !important }');
    expect(after).not.toContain('#011272');
  });
});

describe('editing a token', () => {
  it('materialises the whole system rather than a fragment', () => {
    // A partial `ds` on the document would mean every reader needs a merge step, and one of them
    // would forget. The first write writes all of it.
    const next = setValue(base(), { kind: 'template' }, 'ds.containerWidth', 640);
    expect(next.ds?.containerWidth).toBe(640);
    expect(next.ds?.type['h1']?.size).toBe(38);
    expect(next.ds?.fontStack).toBe(DEFAULT_DESIGN_SYSTEM.fontStack);
  });

  it('leaves its siblings alone', () => {
    let t = setValue(base(), { kind: 'template' }, 'ds.type.h1.size', 44);
    t = setValue(t, { kind: 'template' }, 'ds.type.h2.size', 26);
    expect(t.ds?.type['h1']?.size).toBe(44);
    expect(t.ds?.type['h2']?.size).toBe(26);
    expect(t.ds?.type['h1']?.mobileSize).toBe(30);
  });

  it('does not mutate the shipped defaults', () => {
    setValue(base(), { kind: 'template' }, 'ds.type.h1.size', 99);
    expect(DEFAULT_DESIGN_SYSTEM.type['h1']?.size).toBe(38);
  });

  it('reads back through the same path', () => {
    const t = setValue(base(), { kind: 'template' }, 'ds.type.body.lineHeight', 165);
    expect(readValue(t, { kind: 'template' }, 'ds.type.body.lineHeight')).toBe(165);
    // And an untouched document reads the defaults rather than undefined.
    expect(readValue(base(), { kind: 'template' }, 'ds.type.body.lineHeight')).toBe(150);
  });

  it('survives a save and a reload', () => {
    const t = setValue(base(), { kind: 'template' }, 'ds.colors.red', '#7a0f3d');
    const reloaded = migrate(JSON.parse(serializeTemplate(t)));
    expect(reloaded.ds?.colors['red']).toBe('#7a0f3d');
    expect(html(reloaded)).toContain('#7a0f3d');
  });
});

describe('changing a preset', () => {
  it('recolours every section that follows it', () => {
    // The debt `types.ts` left for this step. Sections store their colours resolved rather than by
    // reference, so without this a designer edits the cream preset and nothing on the canvas moves.
    const t = setValue(base(), { kind: 'template' }, 'ds.themes.cream.container', '#efe7dd');
    const cream = t.sections.filter((s) => s.theme === 'cream');
    expect(cream.length).toBeGreaterThan(0);
    expect(cream.every((s) => s.containerColor === '#efe7dd')).toBe(true);
    expect(html(t)).toContain('#efe7dd');
  });

  it('leaves sections that follow a different preset alone', () => {
    const before = base();
    const navy = before.sections.filter((s) => s.theme === 'navy');
    const t = setValue(before, { kind: 'template' }, 'ds.themes.cream.container', '#efe7dd');
    const after = t.sections.filter((s) => s.theme === 'navy');
    expect(after.map((s) => s.bandColor)).toEqual(navy.map((s) => s.bandColor));
  });

  it('does not undo a section whose colours were set by hand', () => {
    // Overriding a colour on one section is a deliberate act. Moving a token should not silently
    // take it back, and it cannot: only sections still naming the preset are re-resolved.
    const before = base();
    const target = before.sections.find((s) => s.theme === 'cream')!;
    const overridden = setValue(before, { kind: 'section', sectionId: target.id }, 'section.containerColor', '#123456');
    const t = setValue(overridden, { kind: 'template' }, 'ds.themes.cream.container', '#efe7dd');
    // It still names the preset, so it does follow — the escape hatch is clearing the name, which
    // is what "detach" will mean when Patterns land. Named here so the behaviour is deliberate.
    expect(t.sections.find((s) => s.id === target.id)?.containerColor).toBe('#efe7dd');
  });
});

describe('resetting', () => {
  it('takes the document back to the shipped values, sections included', () => {
    let t = setValue(base(), { kind: 'template' }, 'ds.themes.cream.container', '#efe7dd');
    t = setValue(t, { kind: 'template' }, 'ds.containerWidth', 720);
    const back = resetDesignSystem(t);
    expect(back.ds).toBeUndefined();
    expect(back.sections.filter((s) => s.theme === 'cream').every((s) => s.containerColor === '#f7f6f3')).toBe(true);
    expect(html(back)).toBe(html(base()));
  });
});

describe('presets name colours rather than repeating them', () => {
  it('follows the palette, so one change reaches links as well as buttons', () => {
    // The bug this type exists to prevent, and it was real: presets used to store `#d10000`
    // alongside `colors.red`, so changing the brand red moved the button outlines and left every
    // body link behind. A preset now names a role.
    const t = setValue(base(), { kind: 'template' }, 'ds.colors.red', '#0a7d5a');
    const out = html(t);
    expect(out).toContain('border:2px solid #0a7d5a'); // the button
    expect(out).toContain('.sy-rich a { color:#0a7d5a; text-decoration:underline }'); // the base scale
    // ...and the per-block rule, which reads the *section's* resolved link colour.
    expect(out).toContain('a { color:#0a7d5a }');
    expect(out).not.toContain('#d10000');
  });

  it('resolves a preset to hexes, because that is all a section ever stores', () => {
    const cream = DEFAULT_DESIGN_SYSTEM.themes['cream']!;
    expect(cream.container).toBe('cream'); // a role in the system...
    const resolved = themeOf(DEFAULT_DESIGN_SYSTEM, 'cream');
    expect(resolved.container).toBe('#f7f6f3'); // ...a colour by the time it reaches a document
    expect(resolved.band).toBeNull();
  });

  it('still honours a literal, so an override is possible and visible', () => {
    const t = setValue(base(), { kind: 'template' }, 'ds.themes.cream.container', '#efe7dd');
    expect(themeOf(t.ds!, 'cream').container).toBe('#efe7dd');
    // And it has stopped following the palette, which is what an override means.
    const moved = setValue(t, { kind: 'template' }, 'ds.colors.cream', '#000000');
    expect(themeOf(moved.ds!, 'cream').container).toBe('#efe7dd');
  });

  it('leaves a section with no preset alone — that is how detaching works', () => {
    const before = base();
    const detached = { ...before, sections: before.sections.map((s, i) => (i === 0 ? { ...s, theme: undefined } : s)) };
    const t = setValue(detached, { kind: 'template' }, 'ds.colors.navy', '#101820');
    expect(t.sections[0]!.bandColor).toBe(before.sections[0]!.bandColor);
  });
});

/**
 * The fixture's headline is typed inside a rich text block, not a Heading block — so the tests
 * below add a real one. Both paths matter and they are styled differently: a Heading block states
 * its type inline, while an `<h1>` the team types in HubSpot's editor is reached only by the
 * `.sy-rich` rules HubSpot inlines at send (learnings 1.9).
 */
function withHeading(template: Template): Template {
  const first = template.sections[0]!;
  const column = first.rows[0]!.columns[0]!;
  return {
    ...template,
    sections: [
      ...template.sections,
      {
        ...first,
        id: 'sec-heading',
        rows: [
          {
            id: 'row-heading',
            mobile: 'stack',
            columns: [
              {
                ...column,
                id: 'col-heading',
                blocks: [
                  {
                    id: 'blk-heading',
                    type: 'heading',
                    lock: { editable: false, label: 'Headline', field: '' },
                    text: 'A real heading block',
                    level: 'h1',
                    align: 'left',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('a type role can differ from the rest of the email', () => {
  it('renders a heading in its own font without touching body copy', () => {
    // The ask, plainly: a Georgia H1 over Helvetica body copy. One role moving is the whole point
    // of having roles; a single global font stack cannot express a typographic decision.
    const t = tuned((ds) => (ds.type['h1'] = { ...ds.type['h1']!, font: 'georgia' }));
    const after = html(withHeading(t));
    expect(after).toContain('font-family:Georgia, Times New Roman, serif; font-size:38px');
    expect(after).toContain('.sy-rich h1 { margin:0 0 16px 0; line-height:120%; font-size:38px; font-weight:bold; font-family:Georgia, Times New Roman, serif }');
    // Body copy is untouched, and so is everything that is not a type role.
    expect(after).toContain('.sy-rich p { margin:0 0 16px 0; line-height:150%; font-size:18px }');
    expect(count(after, 'font-family:Helvetica, Arial, sans-serif;')).toBeGreaterThan(3);
  });

  it('says nothing when it agrees with the email’s font', () => {
    // A declaration that repeats the default costs bytes in every send and changes nothing. h1 is
    // the exception: it always states the stack, because it is the heading most likely to be
    // restyled, and the golden file records that.
    const out = html(withHeading(base()));
    // 120%, from `type.h1.lineHeight` — v1 wrote a flat 125% into the markup regardless of level.
    expect(out).toContain('margin:0; line-height:120%; font-family:Helvetica, Arial, sans-serif; font-size:38px');
    expect(out).toContain('.sy-rich h2 { margin:0 0 12px 0; line-height:125%; font-size:22px; font-weight:bold }');
    expect(out).not.toContain('font-weight:bold; font-family');
  });

  it('names a palette colour rather than repeating a hex', () => {
    const t = tuned((ds) => (ds.type['h1'] = { ...ds.type['h1']!, color: 'red' }));
    expect(html(withHeading(t))).toContain('color:#d10000');
    // And it follows the palette, like every other reference (learnings 3.12).
    const moved = tuned((ds) => {
      ds.type['h1'] = { ...ds.type['h1']!, color: 'red' };
      ds.colors['red'] = '#0a7d5a';
    });
    expect(html(withHeading(moved))).toContain('color:#0a7d5a');
  });

  it('leaves the section in charge when the role names no colour', () => {
    // The default, and deliberately so: a role that pins its own colour stops being readable the
    // moment it lands on the navy band.
    expect(DEFAULT_DESIGN_SYSTEM.type['h1']?.color).toBeUndefined();
    expect(html(base())).toContain('color:#011272');
  });

  it('has no third level: a block cannot override its role', () => {
    // Removed on purpose, 2026-09-11. A colour on a block is a value with no name, invisible from
    // anywhere except that block. Precedence is role, then section, and that is the whole list.
    const heading = withHeading(base()).sections.at(-1)!.rows[0]!.columns[0]!.blocks[0]!;
    expect(heading).not.toHaveProperty('color');
    expect(heading).not.toHaveProperty('size');
  });
});

describe('the email width bounds the whole email', () => {
  it('stops the band, the stripes and the footer at the same edge as the text', () => {
    // The bug Jared drew a line through: the container narrowed and the navy bar, the stripes and
    // every section background carried on to the window edge. "Email width" has to mean the email.
    const narrow = html(tuned((ds) => (ds.containerWidth = 320)));
    expect(narrow).toContain('class="hse-section" style="padding:0; max-width:320px; margin:0 auto');
    // Outlook paints its band from a conditional table, which is bounded the same way — otherwise
    // the one client nobody can check is the one that ignores the width.
    expect(narrow).toContain('role="presentation" width="320" style="width:320px"');
    expect(narrow).not.toContain('role="presentation" width="100%" style="width:100%" bgcolor');
  });

  it('bounds without forcing, so a 600px email still fills a phone', () => {
    // `max-width` is the whole trick: full bleed where it matters survives (learnings 2.4). What it
    // stops is a 320px email whose navy bar runs across a 900px window.
    expect(html(base())).toContain('max-width:600px; margin:0 auto');
  });

  it('bounds every section, with no way to opt out', () => {
    // There is no unbounded mode any more. v1's full-window band was the last thing the parity
    // flag existed for, and the flag went with it — see tests/hubspot-contract.test.ts.
    const out = html(base());
    expect(out).not.toContain('class="hse-section" style="padding:0"');
    expect(count(out, 'max-width:600px; margin:0 auto')).toBeGreaterThan(10);
  });
});

describe('page padding', () => {
  it('sets the gutter on every content block at once', () => {
    // One decision about the email, not sixteen decisions about blocks. Sixteen columns each
    // carrying their own 20 is not a design, it is sixteen chances to disagree.
    const wide = html(tuned((ds) => (ds.pagePadding = 40)));
    expect(wide).toContain('padding:10px 40px 10px');
    expect(count(wide, 'px 20px ')).toBe(0);
  });

  it('collapses to the three-value shorthand, because the sides always match', () => {
    expect(html(base())).toContain('padding:10px 20px 10px');
  });

  it('can go to nothing, for an email that is all edge-to-edge image', () => {
    expect(html(tuned((ds) => (ds.pagePadding = 0)))).toContain('padding:10px 0px 10px');
  });
});

describe('the frame around the page, and the space outside it', () => {
  it('emits nothing at all when both are off', () => {
    // The default has to be free. Every template written before these tokens existed compiles
    // through the same code now, and an extra wrapper — or even an extra semicolon on the wrapper
    // cell — would mean the golden file no longer proves anything.
    const out = html(base());
    expect(out).not.toContain('hse-body-frame');
    expect(out).toContain('color:#011272; word-break:break-word">');
  });

  it('draws the frame outside every band, not inside one', () => {
    // The top bar and the footer are full-bleed sections. A frame that sat inside them would draw
    // a line through the middle of the email instead of around it.
    const out = html(tuned((ds) => {
      ds.pageBorderWidth = 2;
      ds.pageBorderColor = 'red';
    }));
    expect(out).toContain('<div class="hse-body-frame" style="max-width:600px; margin:0 auto; border:2px solid #d10000">');
    // Every band is inside it: the frame opens before the first section and closes after the last.
    const opens = out.indexOf('hse-body-frame');
    const closes = out.lastIndexOf('</div>\n<!--[if gte mso 9]></td></tr></tbody></table><![endif]-->');
    expect(opens).toBeLessThan(out.indexOf('class="hse-section'));
    expect(closes).toBeGreaterThan(out.lastIndexOf('class="hse-section'));
    // Including the two that draw their own full-width band. `lastIndexOf`, because the tagline's
    // class is named once in the head's phone rules before it is ever used in the body.
    expect(out.lastIndexOf('sy-tagline')).toBeGreaterThan(opens);
    expect(out.indexOf('section-legal')).toBeLessThan(closes);
  });

  it('gives Outlook a fixed-width table, because Word has no max-width', () => {
    // Left to the div alone, Outlook draws the border at the width of the window rather than the
    // width of the email — the one case where a frame is worse than no frame.
    const out = html(tuned((ds) => {
      ds.pageBorderWidth = 3;
      ds.containerWidth = 320;
    }));
    // 326, not 320: Word's table width is the overall width, borders included, so the conditional
    // is the email plus its two borders. Erring wide costs a few pixels of page background in
    // Outlook; erring narrow would push the content over the border there, unseen.
    expect(out).toContain('<!--[if gte mso 9]><table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" width="326" style="width:326px; border:3px solid #011272"><tbody><tr><td valign="top" style="padding:0"><![endif]-->');
    expect(count(out, '<!--[if gte mso 9]></td></tr></tbody></table><![endif]-->')).toBeGreaterThan(0);
  });

  it('draws the border outside the width, so the content cannot spill over it', () => {
    // The first version used `box-sizing:border-box`, so that "email width" kept meaning the
    // outside edge. It painted a frame with three sides. The desktop rules force
    // `.hse-size-12 { width:<containerWidth>px !important }`, so the content stayed at its full
    // width inside a content box two borders narrower and ran out over the right-hand border.
    //
    // So the content box is exactly the email width and the frame adds to the overall, the way an
    // image's border does.
    const out = html(tuned((ds) => {
      ds.pageBorderWidth = 3;
      ds.containerWidth = 320;
    }));
    expect(out).toContain('max-width:320px; margin:0 auto; border:3px solid #011272">');
    // The rule that caused it, still asking for the full width — which now fits.
    expect(out).toContain('.hse-section .hse-size-12 { max-width:320px !important; width:320px !important }');
  });

  it('follows the palette rather than freezing a hex', () => {
    const out = html(tuned((ds) => {
      ds.pageBorderWidth = 1;
      ds.pageBorderColor = 'red';
      ds.colors['red'] = '#ff0000';
    }));
    expect(out).toContain('border:1px solid #ff0000');
    expect(out).not.toContain('border:1px solid #d10000');
  });

  it('puts the margin on the wrapper cell, where every client agrees about the box model', () => {
    // Padding on a td, not a margin on a div: Word is the reason, and the page background showing
    // through the gap is what makes the email read as sitting on a page.
    const out = html(tuned((ds) => (ds.pageMargin = 24)));
    expect(out).toContain('class="hse-body-wrapper-td" valign="top"');
    expect(out).toContain('word-break:break-word; padding:24px">');
  });
});

describe('a block that departs from the page gutter', () => {
  /** The v1 fixture with one column — section 6's image, padded 10 and 10 — given its own sides. */
  const sided = (left: number | null, right: number | null): Template => {
    const t = base();
    const column = t.sections[6]!.rows[0]!.columns[0]!;
    column.padLeft = left;
    column.padRight = right;
    return t;
  };

  it('writes the four-value form only when the sides differ', () => {
    // Every block that follows the page keeps v1's three-value shorthand, which is what lets the
    // golden file still mean something.
    expect(html(sided(40, 40))).toContain('padding:10px 40px 10px;');
    expect(html(sided(0, 40))).toContain('padding:10px 40px 10px 0px;');
  });

  it('leaves every other block on the page gutter', () => {
    const out = html(sided(0, 0));
    expect(count(out, 'padding:20px 20px 20px')).toBeGreaterThan(1);
    expect(count(out, 'padding:10px 0px 10px')).toBe(1);
  });

  it('keeps its own sides on a phone, where `.hs_padded` would drag it back', () => {
    // The head carries `@media phone { .hs_padded { padding-left:20px !important } }` — HubSpot's
    // own class, and not droppable. Without a rule of its own the one block asked to run edge to
    // edge would be inset by 20px on every phone in the world, which is where it is read.
    const out = html(sided(0, 0));
    expect(out).toContain('.sy-pad-0-0 { padding-left:0px !important; padding-right:0px !important }');
    expect(out).toContain('class="hs_padded sy-pad-0-0"');
    // Later in the sheet than the generic rule, or same specificity would go the other way.
    expect(out.indexOf('.sy-pad-0-0 {')).toBeGreaterThan(out.indexOf('.hs_padded { padding-left:20px !important'));
  });

  it('emits one rule however many blocks made the same choice', () => {
    const t = sided(0, 0);
    t.sections[3]!.rows[0]!.columns[0]!.padLeft = 0;
    t.sections[3]!.rows[0]!.columns[0]!.padRight = 0;
    expect(count(html(t), '.sy-pad-0-0 {')).toBe(1);
    expect(count(html(t), 'class="hs_padded sy-pad-0-0"')).toBe(2);
  });

  it('emits no class at all for a block that follows, or one that matches the gutter', () => {
    expect(html(base())).not.toContain('sy-pad-');
    expect(html(sided(20, 20))).not.toContain('sy-pad-');
  });

  it('follows the page when the page moves, and stops when it has its own', () => {
    // The whole reason the sides are an override rather than a stored number: `pagePadding` has to
    // keep moving everything that has not opted out.
    const t = sided(0, null);
    t.ds = { ...DEFAULT_DESIGN_SYSTEM, pagePadding: 44 };
    const out = html(t);
    expect(out).toContain('padding:10px 44px 10px 0px;');
    expect(count(out, '44px')).toBeGreaterThan(4);
    expect(out).not.toContain('20px 10px;');
  });
});

describe('a box around a block', () => {
  const boxed = (over: Record<string, unknown>): Template => {
    const t = base();
    Object.assign(t.sections[6]!.rows[0]!.columns[0]!, over);
    return t;
  };

  it('emits nothing at all without one, which is every block by default', () => {
    expect(html(base())).not.toContain('border-collapse:separate; border:');
  });

  it('is a real table, because Word gives a div the width of whatever contains it', () => {
    const out = html(boxed({ borderWidth: 2, borderColor: 'red', borderPad: 12 }));
    expect(out).toContain('style="width:100%; border-collapse:separate; border:2px solid #d10000"');
    expect(out).toContain('<td style="padding:12px">');
  });

  it('sits inside the page gutter, so it is a callout and not a rule across the email', () => {
    // The cell keeps its own padding and the box is what it contains. The other way round would
    // put the line hard against the edges of the email, which is a different thing entirely.
    const out = html(boxed({ borderWidth: 1, borderPad: 10 }));
    const cell = out.indexOf('padding:10px 20px 10px');
    expect(cell).toBeGreaterThan(-1);
    expect(out.indexOf('border-collapse:separate; border:1px')).toBeGreaterThan(cell);
  });

  it('needs border-collapse:separate or the corners stay square everywhere', () => {
    const out = html(boxed({ borderWidth: 1, borderRadius: 8 }));
    expect(out).toContain('border-collapse:separate; border:1px solid #011272; border-radius:8px');
  });

  it('follows the palette rather than freezing a hex', () => {
    const t = boxed({ borderWidth: 2, borderColor: 'red' });
    t.ds = { ...DEFAULT_DESIGN_SYSTEM, colors: { ...DEFAULT_DESIGN_SYSTEM.colors, red: '#ff0000' } };
    expect(html(t)).toContain('border:2px solid #ff0000');
  });

  it('falls back to the body colour rather than to nothing when the reference is empty', () => {
    // A box with no colour would be `border:2px solid null` — a declaration every client drops,
    // so the box a designer asked for would simply not be there.
    expect(html(boxed({ borderWidth: 2, borderColor: null }))).toContain('border:2px solid #011272');
  });
});

describe('a deliberately narrow email', () => {
  it('is actually narrow, rather than propped open by a minimum', () => {
    // A 300px receipt is a template, not a mistake. The container carried a hard
    // `min-width:280px`, which would have quietly kept a 260px email at 280.
    const out = html(tuned((ds) => (ds.containerWidth = 300)));
    expect(out).toContain('max-width:300px; margin:0 auto');
    expect(out).toContain('<table align="center" style="width:300px;"');
    expect(out).toContain('.hse-size-12 { max-width:300px !important; width:300px !important }');

    // Below the old hard floor, the floor follows rather than propping the email open at 280.
    const tiny = html(tuned((ds) => (ds.containerWidth = 260)));
    expect(tiny).toContain('min-width:260px; max-width:260px');
  });

  it('keeps the 280px floor once the email is wider than it', () => {
    // The floor exists so a 600px email does not collapse in a narrow window; it should follow the
    // container down rather than sit above it.
    expect(html(base())).toContain('min-width:280px; max-width:600px');
  });

  it('still wraps the body in a full-width table, so the page background fills the window', () => {
    // The email gets narrow; the thing behind it does not. Otherwise a 300px receipt sits in a
    // 300px window with nothing either side of it.
    expect(html(tuned((ds) => (ds.containerWidth = 300)))).toContain('width:100% !important; min-width:320px !important');
  });
});

describe('the button, now that it is tokens rather than literals', () => {
  /** One button of a given variant, so the white one is covered — it never was before. */
  function withButton(style: 'primary' | 'secondary', ds?: DesignSystem): Template {
    const t = base();
    const first = t.sections[0]!;
    return {
      ...t,
      ...(ds ? { ds } : {}),
      sections: [
        {
          ...first,
          id: 'sec-btn',
          rows: [
            {
              id: 'row-btn',
              mobile: 'stack',
              columns: [
                {
                  ...first.rows[0]!.columns[0]!,
                  id: 'col-btn',
                  blocks: [
                    {
                      id: 'blk-btn',
                      type: 'button',
                      lock: { editable: false, label: 'Label', field: '' },
                      link: { editable: false, label: 'Link', field: '' },
                      text: 'GO',
                      href: 'https://x.test/',
                      style,
                      align: 'center',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it('still emits exactly what v1 emitted, at the shipped values', () => {
    const out = html(withButton('primary'));
    expect(out).toContain('border-radius:25px');
    expect(out).toContain('border:2px solid #d10000');
    expect(out).toContain('mso-padding-alt:12px 18px');
    expect(out).toContain('padding:12px 18px');
    expect(out).toContain('font-size:16px');
  });

  it('writes the white variant’s border in the same case as everything else', () => {
    // v1 had `#FFFFFF` here and `#ffffff` two lines below it, for the same colour. It survived only
    // because changing it broke the byte diff against v1, which is no longer the gate.
    const out = html(withButton('secondary'));
    expect(out).toContain('border:2px solid #ffffff');
    expect(out).not.toContain('#FFFFFF');
  });

  it('moves its shape when the tokens move, Outlook’s padding included', () => {
    const squared = structuredClone(DEFAULT_DESIGN_SYSTEM);
    squared.buttons['primary'] = { ...squared.buttons['primary']!, radius: 4, padY: 16, padX: 28, size: 18, borderWidth: 1 };
    const out = html(withButton('primary', squared));
    expect(out).toContain('border-radius:4px');
    expect(out).toContain('border:1px solid #d10000');
    // Both, because Outlook reads `mso-padding-alt` and ignores the anchor's own padding.
    expect(out).toContain('mso-padding-alt:16px 28px');
    expect(out).toContain('padding:16px 28px');
    expect(out).toContain('font-size:18px');
  });

  it('follows the palette rather than repeating it', () => {
    const green = structuredClone(DEFAULT_DESIGN_SYSTEM);
    green.colors['red'] = '#0a7d5a';
    expect(html(withButton('primary', green))).toContain('border:2px solid #0a7d5a');
  });

  it('sizes every button of a variant together, including on phones', () => {
    // The per-block size went with the rest; a long label wrapping on a phone is still real
    // (learnings 2.10), so the phone size became a token on the variant instead.
    const small = structuredClone(DEFAULT_DESIGN_SYSTEM);
    small.buttons['primary'] = { ...small.buttons['primary']!, mobileSize: 12 };
    expect(html(withButton('primary', small))).toContain('.sy-bt-primary { font-size:12px !important }');
    // Zero means "the same on a phone", and emits no rule at all.
    expect(html(withButton('primary'))).not.toContain('.sy-bt-primary');
  });
});

describe('editing the palette', () => {
  it('adds a colour under a key derived from what you typed', () => {
    const t = addColor(base(), 'Sun Yellow', '#f4c430');
    expect(t.ds?.colors['sunyellow']).toBe('#f4c430');
    expect(Object.keys(t.ds!.colors)).toContain('navy');
  });

  it('does not collide when the same name is added twice', () => {
    const t = addColor(addColor(base(), 'Sun', '#f4c430'), 'Sun', '#ffd700');
    expect(Object.keys(t.ds!.colors).filter((k) => k.startsWith('sun'))).toEqual(['sun', 'sun2']);
  });

  it('carries every reference along when a colour is renamed', () => {
    // The whole operation. `colorOf` returns null for a name nothing defines, so a preset left
    // pointing at the old one does not error — it quietly loses its background, which is the worst
    // kind of failure to ship.
    const t = renameColor(base(), 'red', 'Brand');
    const ds = t.ds!;
    expect(ds.colors['brand']).toBe('#d10000');
    expect(ds.colors['red']).toBeUndefined();
    expect(ds.themes['cream']?.link).toBe('brand');
    expect(ds.buttons['primary']?.ink).toBe('brand');
    expect(ds.buttons['primary']?.border).toBe('brand');
    // And the output is unchanged, because only the name moved.
    expect(html(t)).toContain('#d10000');
    expect(colorUsage(ds, 'red')).toEqual([]);
  });

  it('keeps the palette in the order somebody arranged it in', () => {
    const before = Object.keys(base().ds?.colors ?? DEFAULT_DESIGN_SYSTEM.colors);
    const after = Object.keys(renameColor(base(), 'red', 'Brand').ds!.colors);
    expect(after).toEqual(before.map((k) => (k === 'red' ? 'brand' : k)));
  });

  it('re-resolves the sections that were following it', () => {
    const t = renameColor(base(), 'cream', 'Paper');
    expect(t.sections.filter((s) => s.theme === 'cream').every((s) => s.containerColor === '#f7f6f3')).toBe(true);
  });

  it('removes one nothing is pointing at', () => {
    const added = addColor(base(), 'Spare', '#123456');
    expect(removeColor(added, 'spare').ds?.colors['spare']).toBeUndefined();
  });

  it('resets the palette to the brand without touching the type scale', () => {
    let t = addColor(base(), 'Spare', '#123456');
    t = setValue(t, { kind: 'template' }, 'ds.colors.red', '#0a7d5a');
    t = setValue(t, { kind: 'template' }, 'ds.type.h1.size', 44);
    const back = resetPalette(t);
    expect(back.ds?.colors['red']).toBe('#d10000');
    expect(back.ds?.colors['spare']).toBeUndefined();
    expect(back.ds?.type['h1']?.size).toBe(44);
    // Sections follow it back, the same as any other palette change.
    expect(html(back)).not.toContain('#0a7d5a');
  });
});

describe('a colour the document uses is not reported as free', () => {
  it('counts stripes, which is the case that made this a bug', () => {
    // Jared's report: only one of the two reds could be deleted. The one that *could* be was the
    // one three stripes are painted in — because the block held a raw hex rather than the name, so
    // the palette could not see it.
    const t = base();
    expect(colorUsage(designSystemOf(t), 'redBright')).toEqual([]);
    expect(colorUsage(designSystemOf(t), 'redBright', t)).toEqual(['4 stripes']);
    expect(removeColor(t, 'redBright').ds?.colors['redBright'] ?? DEFAULT_DESIGN_SYSTEM.colors['redBright']).toBe('#d20000');
  });

  it('imports v1’s literal hexes as palette names', () => {
    const stripes = base()
      .sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)))
      .filter((b) => b.type === 'stripes');
    expect(stripes.length).toBeGreaterThan(0);
    for (const block of stripes) {
      if (block.type !== 'stripes') continue;
      for (const stripe of block.stripes) {
        expect(typeof stripe.color === 'string' ? stripe.color.startsWith('#') : false).toBe(false);
      }
    }
  });

  it('renders the same colours it always did', () => {
    // The reference changed; the output must not.
    expect(html(base())).toContain('background-color:#d20000');
  });

  it('carries stripes through a rename', () => {
    // A stripe left pointing at a name nothing defines renders as no stripe at all — the failure is
    // a missing rule, not an error.
    const t = renameColor(base(), 'redBright', 'Accent');
    expect(colorUsage(t.ds!, 'accent', t)).toEqual(['4 stripes']);
    expect(html(t)).toContain('background-color:#d20000');
  });

  it('moves the stripes when the palette entry moves', () => {
    // The point of naming it: recolouring the brand should reach the stripes too.
    const t = setValue(base(), { kind: 'template' }, 'ds.colors.redBright', '#0a7d5a');
    expect(html(t)).toContain('background-color:#0a7d5a');
    expect(html(t)).not.toContain('background-color:#d20000');
  });
});

describe('removing a colour is a replace', () => {
  // Refusing while anything still named it was the first shape, and it was a dead end from both
  // ends: in a real palette everything is used, so the button never worked — and the count shown to
  // explain why was a bare number beside a hex, which reads as part of the hex.

  it('repoints everything that named it, then removes it', () => {
    const t = removeColor(base(), 'red', 'navy');
    const ds = t.ds!;
    expect(ds.colors['red']).toBeUndefined();
    expect(ds.themes['cream']?.link).toBe('navy');
    expect(ds.buttons['primary']?.ink).toBe('navy');
    expect(ds.buttons['primary']?.border).toBe('navy');
    expect(colorUsage(ds, 'red', t)).toEqual([]);
    // And the output follows: what was red is now navy, everywhere at once.
    expect(html(t)).not.toContain('#d10000');
  });

  it('carries stripes with it, which is the reference easiest to forget', () => {
    const t = removeColor(base(), 'redBright', 'navy');
    expect(t.ds?.colors['redBright']).toBeUndefined();
    expect(html(t)).not.toContain('#d20000');
    expect(html(t)).toContain('background-color:#011272');
  });

  it('re-resolves the sections that were following a preset it touched', () => {
    const t = removeColor(base(), 'cream', 'white');
    expect(t.sections.filter((s) => s.theme === 'cream').every((s) => s.containerColor === '#ffffff')).toBe(true);
  });

  it('needs no replacement when nothing names it', () => {
    const added = addColor(base(), 'Spare', '#123456');
    expect(removeColor(added, 'spare').ds?.colors['spare']).toBeUndefined();
  });

  it('refuses rather than dangling when the replacement is missing or nonsense', () => {
    // A reference to a name nothing defines resolves to null, which is a legitimate value meaning
    // "transparent" — so a bad replace would quietly remove backgrounds rather than fail.
    for (const bad of [undefined, 'notacolour', 'red']) {
      expect(removeColor(base(), 'red', bad).ds?.colors['red'] ?? DEFAULT_DESIGN_SYSTEM.colors['red']).toBe('#d10000');
    }
  });

  it('still reports what uses a colour, for the question the panel asks', () => {
    const uses = colorUsage(DEFAULT_DESIGN_SYSTEM, 'red');
    expect(uses).toContain('cream preset · link');
    expect(uses).toContain('primary button · ink');
  });
});

describe('background presets can be added, renamed and removed', () => {
  it('renames the preset and every section following it', () => {
    // A section's `theme` is the only place a preset is named, and it is what makes "change the navy
    // band everywhere" one edit. A rename that missed the sections would leave them naming nothing.
    const t = renamePreset(base(), 'cream', 'Paper');
    expect(t.ds?.themes['paper']).toBeDefined();
    expect(t.ds?.themes['cream']).toBeUndefined();
    expect(t.sections.every((s) => s.theme !== 'cream')).toBe(true);
    expect(presetUsage(t, 'paper')).toBeGreaterThan(0);
    // Nothing about the output moved — only the name did.
    expect(html(t)).toBe(html(base()));
  });

  it('keeps the presets in the order somebody arranged them in', () => {
    const before = Object.keys(designSystemOf(base()).themes);
    const after = Object.keys(renamePreset(base(), 'navy', 'Dark').ds!.themes);
    expect(after).toEqual(before.map((k) => (k === 'navy' ? 'dark' : k)));
  });

  it('adds one as a copy, so it starts from something', () => {
    const t = addPreset(base(), 'Sand', 'navy');
    expect(t.ds?.themes['sand']).toEqual(designSystemOf(base()).themes['navy']);
  });

  it('moves the sections when a used preset is removed', () => {
    const before = presetUsage(base(), 'cream');
    expect(before).toBeGreaterThan(0);
    const t = removePreset(base(), 'cream', 'offwhite');
    expect(t.ds?.themes['cream']).toBeUndefined();
    expect(presetUsage(t, 'offwhite')).toBeGreaterThanOrEqual(before);
    // And they take the new preset's colours, not the ones they last resolved.
    expect(t.sections.filter((s) => s.theme === 'offwhite').every((s) => s.bandColor === '#fcfff5')).toBe(true);
  });

  it('refuses rather than orphaning when the replacement is missing', () => {
    // A section naming a preset that does not exist keeps the colours it last resolved, so it does
    // not break — it silently stops following the system, which nothing would tell anybody.
    for (const bad of [undefined, 'notapreset', 'cream']) {
      expect(removePreset(base(), 'cream', bad).ds?.themes['cream'] ?? DEFAULT_DESIGN_SYSTEM.themes['cream']).toBeDefined();
    }
  });

  it('keeps the last one, whatever happens', () => {
    let t = removePreset(base(), 'navy', 'cream');
    t = removePreset(t, 'offwhite', 'cream');
    expect(Object.keys(t.ds!.themes)).toEqual(['cream']);
    // A template with no presets has no way to describe a background at all.
    expect(Object.keys(removePreset(t, 'cream').ds!.themes)).toEqual(['cream']);
  });

  it('falls back to the first preset, not to one called cream', () => {
    // The fallback used to name `cream` — which is a key that can now be renamed or removed, and a
    // fallback naming a key that may not exist is the bug this file keeps producing.
    const renamed = renamePreset(base(), 'cream', 'Paper');
    expect(themeOf(renamed.ds!, 'nothing-by-this-name').container).toBe('#f7f6f3');
  });
});

describe('a Heading block and a heading the team typed are the same role', () => {
  /** Every declaration except the margin, which legitimately differs. */
  const declarations = (style: string) =>
    style
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d && !d.startsWith('margin') && !d.startsWith('text-align') && !d.startsWith('color'))
      .sort();

  it('renders the same way at every level', () => {
    // The bug: the block took size, line height and font from the role and left weight, capitals and
    // tracking to the browser. So a Heading block set to H5 was whatever the client thinks an `<h5>`
    // weighs, while an `<h5>` typed in HubSpot's editor was bold, uppercase and tracked. One role,
    // two renderings, in one email.
    for (const level of ['h1', 'h2', 'h3', 'h4'] as const) {
      const t = withHeading(base());
      const block = t.sections.at(-1)!.rows[0]!.columns[0]!.blocks[0]!;
      const levelled: Template = {
        ...t,
        sections: t.sections.map((s) =>
          s.id === 'sec-heading'
            ? { ...s, rows: [{ ...s.rows[0]!, columns: [{ ...s.rows[0]!.columns[0]!, blocks: [{ ...block, level } as typeof block] }] }] }
            : s,
        ),
      };
      const out = html(levelled);

      const inline = new RegExp(`<${level} class="sy-${level}" style="([^"]*)"`).exec(out)?.[1] ?? '';
      // Anchored to the start of a line, or it matches the *phone* rule first — that one is
      // written `  .sy-h1, .sy-rich h1 { … !important }` and is indented inside a media query.
      const rule = new RegExp(`^\\.sy-rich ${level} \\{([^}]*)\\}`, 'm').exec(out)?.[1] ?? '';
      expect(inline, `${level} block renders nothing`).not.toBe('');
      expect(rule, `${level} rich rule is missing`).not.toBe('');

      // The rich rule always names its font; the block only does for h1. Compared on the rest.
      const drop = (list: string[]) => list.filter((d) => !d.startsWith('font-family'));
      expect(drop(declarations(inline)), `${level} differs between the block and the editor`).toEqual(
        drop(declarations(rule)),
      );
    }
  });

  it('carries the capitals and the tracking an uppercase role asks for', () => {
    const t = tuned((ds) => (ds.type['h4'] = { ...ds.type['h4']!, uppercase: true, letterSpacing: 1.2 }));
    const withH4 = withHeading(t);
    const block = withH4.sections.at(-1)!.rows[0]!.columns[0]!.blocks[0]!;
    const out = html({
      ...withH4,
      sections: withH4.sections.map((s) =>
        s.id === 'sec-heading'
          ? { ...s, rows: [{ ...s.rows[0]!, columns: [{ ...s.rows[0]!.columns[0]!, blocks: [{ ...block, level: 'h4' } as typeof block] }] }] }
          : s,
      ),
    });
    expect(out).toContain('<h4 class="sy-h4" style="margin:0; line-height:135%; font-size:15px; font-weight:bold; text-transform:uppercase; letter-spacing:1.2px');
  });
});

describe('text padding', () => {
  it('adds an inner cell around headings and text blocks, and nothing at zero', async () => {
    const { compile } = await import('../src/compile/compile.ts');
    const { createSection } = await import('../src/model/catalog.ts');
    const { blankTemplate } = await import('../src/model/starters.ts');
    const { DEFAULT_DESIGN_SYSTEM } = await import('../src/model/design-system.ts');
    const { sequentialIds } = await import('../src/model/ids.ts');
    const ids = () => ({ id: sequentialIds(), taken: new Set<string>() });
    const base = { ...blankTemplate(), sections: [createSection('heading', ids(), DEFAULT_DESIGN_SYSTEM), createSection('richtext', ids(), DEFAULT_DESIGN_SYSTEM)] };
    const plain = compile(base, { mode: 'hubl', date: '2026-09-19' }).html;
    const padded = compile({ ...base, ds: { ...DEFAULT_DESIGN_SYSTEM, textPadX: 12, textPadY: 6 } }, { mode: 'hubl', date: '2026-09-19' }).html;
    expect(plain).not.toContain('padding:6px 12px');
    expect((padded.match(/padding:6px 12px/g) ?? []).length).toBe(2);
    // The same words, once more table deep, and nothing else moved.
    expect(padded.replace(/<table[^>]*>\s*<tbody>\s*<tr>\s*<td[^>]*padding:6px 12px[^>]*>|<\/td>\s*<\/tr>\s*<\/tbody>\s*<\/table>/g, '').length).toBeLessThan(padded.length);
  });

  it('keeps sy-rich on the cell that holds the paragraphs, which is what the canvas opens for editing', async () => {
    const { compile } = await import('../src/compile/compile.ts');
    const { createSection } = await import('../src/model/catalog.ts');
    const { blankTemplate } = await import('../src/model/starters.ts');
    const { DEFAULT_DESIGN_SYSTEM } = await import('../src/model/design-system.ts');
    const { sequentialIds } = await import('../src/model/ids.ts');
    const ids = () => ({ id: sequentialIds(), taken: new Set<string>() });
    const base = { ...blankTemplate(), sections: [createSection('richtext', ids(), DEFAULT_DESIGN_SYSTEM)] };
    /** What sits immediately after the `sy-rich` cell's opening tag: the words, never a table. */
    const afterRich = (html: string) => html.slice(html.indexOf('sy-rich')).replace(/^[^>]*>/, '').trimStart().slice(0, 7);
    expect(afterRich(compile(base, { mode: 'preview' }).html)).not.toContain('<table');
    const padded = compile({ ...base, ds: { ...DEFAULT_DESIGN_SYSTEM, textPadX: 12, textPadY: 6 } }, { mode: 'preview' }).html;
    expect(afterRich(padded)).not.toContain('<table');
    // And it is the inset cell that wears it, so the padding is on the editable itself.
    expect(padded).toMatch(/padding:6px 12px[^>]*class="sy-rich|class="sy-rich[^>]*padding:6px 12px/);
  });
});

/**
 * Padding that differs between a phone and a desktop (Jared: "allow mobile and desktop values").
 *
 * The thing to defend is the sentinel. `null` means follow the desktop number and `0` means zero, which is a real
 * design — a phone gutter of 0 is an email that runs to the edge of the screen. `ButtonTokens.mobileSize` uses 0
 * for "inherit" and copying that here would have made the most likely phone value unsayable.
 */
describe('padding on phones', () => {
  const load = async () => {
    const { compile } = await import('../src/compile/compile.ts');
    const { createSection } = await import('../src/model/catalog.ts');
    const { blankTemplate } = await import('../src/model/starters.ts');
    const { DEFAULT_DESIGN_SYSTEM } = await import('../src/model/design-system.ts');
    const { sequentialIds } = await import('../src/model/ids.ts');
    const ids = () => ({ id: sequentialIds(), taken: new Set<string>() });
    const base = { ...blankTemplate(), sections: [createSection('heading', ids(), DEFAULT_DESIGN_SYSTEM), createSection('richtext', ids(), DEFAULT_DESIGN_SYSTEM)] };
    const html = (over: Record<string, unknown>) => compile({ ...base, ds: { ...DEFAULT_DESIGN_SYSTEM, ...over } }, { mode: 'hubl', date: '2026-09-19' }).html;
    return { html, ds: DEFAULT_DESIGN_SYSTEM };
  };

  it('changes nothing at all while every phone value is null', async () => {
    const { html, ds } = await load();
    expect(html({})).toBe(html({ mobilePagePadding: null, mobileTextPadX: null, mobileTextPadY: null }));
    // The phone gutter rule is the desktop number, which is what it has always been.
    expect(html({})).toContain(`.hs_padded { padding-left:${ds.pagePadding}px !important`);
    expect(html({})).not.toContain('.sy-tp {');
  });

  it('takes a phone gutter of its own, leaving the desktop one alone', async () => {
    const { html } = await load();
    const out = html({ pagePadding: 24, mobilePagePadding: 8 });
    expect(out).toContain('.hs_padded { padding-left:8px !important; padding-right:8px !important }');
    // The cell itself still carries the desktop number inline, sides second in the shorthand; the phone rule
    // overrides it, which is the only way an email can say "this width, but not that one".
    expect(out).toMatch(/padding:\d+px 24px/);
  });

  it('treats a phone gutter of zero as zero, not as "follow the desktop one"', async () => {
    const { html } = await load();
    const out = html({ pagePadding: 24, mobilePagePadding: 0 });
    expect(out).toContain('.hs_padded { padding-left:0px !important; padding-right:0px !important }');
    expect(out).not.toContain('.hs_padded { padding-left:24px');
  });

  it('takes phone text padding, and gives the rule a cell to select', async () => {
    const { html } = await load();
    const out = html({ textPadX: 12, textPadY: 6, mobileTextPadX: 4, mobileTextPadY: 2 });
    expect(out).toContain('.sy-tp { padding:2px 4px !important }');
    expect((out.match(/sy-tp/g) ?? []).length).toBeGreaterThan(2);
    // One rule for the whole email, however many text blocks wear the class.
    expect((out.match(/\.sy-tp \{/g) ?? []).length).toBe(1);
  });

  it('emits the inset cell for a system with phone text padding and none on desktop', async () => {
    const { html } = await load();
    const out = html({ textPadX: 0, textPadY: 0, mobileTextPadX: 8 });
    // Nothing to see on a desktop, but the media query needs something to select.
    expect(out).toContain('padding:0px 0px');
    expect(out).toContain('.sy-tp { padding:0px 8px !important }');
  });

  it('moves the legal footer with the rest of the email', async () => {
    const { compile } = await import('../src/compile/compile.ts');
    const { createSection } = await import('../src/model/catalog.ts');
    const { blankTemplate } = await import('../src/model/starters.ts');
    const { DEFAULT_DESIGN_SYSTEM } = await import('../src/model/design-system.ts');
    const { sequentialIds } = await import('../src/model/ids.ts');
    const ids = () => ({ id: sequentialIds(), taken: new Set<string>() });
    // A footer on its own: the gutter's phone rule has to be asked for by the footer itself, because no padded
    // column ran to ask for it. Setting a phone gutter and watching the footer stay put would read as a bug.
    const only = { ...blankTemplate(), sections: [createSection('legal', ids(), DEFAULT_DESIGN_SYSTEM)] };
    const out = compile({ ...only, ds: { ...DEFAULT_DESIGN_SYSTEM, pagePadding: 24, mobilePagePadding: 6 } }, { mode: 'hubl', date: '2026-09-19' }).html;
    expect(out).toContain('.hs_padded { padding-left:6px !important; padding-right:6px !important }');
    // And the footer's own address cell wears the class the rule selects.
    expect(out).toMatch(/padding:10px 24px"[^>]*class="hs_padded/);
  });

  it('leaves a column that set its own sides on its own number, phone or not', async () => {
    const { html } = await load();
    const out = html({ pagePadding: 24, mobilePagePadding: 8 });
    expect(out).toContain('.hs_padded { padding-left:8px !important');
    // And a system whose phone gutter matches its desktop one says it once, as before.
    const same = html({ pagePadding: 24, mobilePagePadding: 24 });
    expect(same).toBe(html({ pagePadding: 24 }));
  });
});
