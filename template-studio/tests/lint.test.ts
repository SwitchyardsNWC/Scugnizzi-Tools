// The linter has to actually catch things. A validator that only ever passes is worse than none,
// because it buys confidence it has not earned — so each rule gets a tree that violates it.

import { describe, expect, it } from 'vitest';

import { collectColors, emptyRegistry } from '../src/compile/colors.ts';
import { decl, el, frag, voidEl, when, type Field, type IRNode } from '../src/compile/ir.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { serialize } from '../src/compile/serialize.ts';
import { compile } from '../src/compile/compile.ts';
import { allBlocks, renderAsImage } from '../src/model/edit.ts';
import { importV1 } from '../src/model/import-v1.ts';
import fixture from '../reference/v1-standard-email.design.json';

const field = (over: Partial<Field> = {}): Field => ({
  name: 'headline',
  kind: 'text',
  label: 'Headline',
  value: 'Hello',
  exported: true,
  ...over,
});

/** Runs a tree through the same pipeline compile() uses, so the linter sees what it normally sees. */
function check(tree: IRNode) {
  const registry = collectColors(tree, emptyRegistry());
  const html = serialize(tree, { mode: 'hubl' });
  return lint({ tree, registry, html, bytes: Buffer.byteLength(html) });
}

const ruleNames = (tree: IRNode) => errorsIn(check(tree)).map((f) => f.rule);

describe('the declaration invariant', () => {
  it('rejects a declaration inside a conditional', () => {
    // The shape that produces a field the team never sees — a checkbox that does nothing
    // (learnings 1.5). This is the single most important thing the linter does.
    const tree = when({ k: 'textFilled', field: 'other' }, [decl(field()), el('p', null, 'hi')]);
    expect(ruleNames(tree)).toContain('declaration-inside-conditional');
  });

  it('accepts declaration, then conditional, then markup', () => {
    const tree = frag([
      decl(field()),
      when({ k: 'textFilled', field: 'headline' }, el('p', null, 'hi')),
    ]);
    expect(ruleNames(tree)).not.toContain('declaration-inside-conditional');
  });

  it('rejects a declaration nested several levels inside a conditional', () => {
    const tree = when({ k: 'textFilled', field: 'other' }, el('div', null, el('span', null, decl(field()))));
    expect(ruleNames(tree)).toContain('declaration-inside-conditional');
  });
});

describe('field names', () => {
  it('rejects duplicates', () => {
    const tree = frag([decl(field()), decl(field())]);
    expect(ruleNames(tree)).toContain('duplicate-field');
  });

  it('rejects names HubSpot cannot use', () => {
    expect(ruleNames(frag([decl(field({ name: 'Head Line' }))]))).toContain('field-name-shape');
  });

  it('rejects an unlabelled field, because the label is the whole interface', () => {
    expect(ruleNames(frag([decl(field({ label: '  ' }))]))).toContain('unlabelled-field');
  });
});

describe('references', () => {
  it('catches a read of a field that is never declared', () => {
    const tree = when({ k: 'path', path: 'widget_data.ghost.img.src', field: 'ghost' }, el('p', null, 'hi'));
    expect(ruleNames(tree)).toContain('dangling-reference');
  });
});

describe('dark mode coverage', () => {
  it('catches a colour with no override, by parsing the output', () => {
    // The tree declares a colour but the html passed to lint has no generated CSS, which is what a
    // compiler that forgot to emit the layers would produce.
    const tree = el('div', null, 'x', { bg: '#123456' });
    const registry = collectColors(tree, emptyRegistry());
    const findings = lint({ tree, registry, html: '<div></div>', bytes: 12 });
    expect(errorsIn(findings).map((f) => f.rule)).toContain('dark-mode-coverage');
  });
});

describe('email rules', () => {
  it('flags an image with no width, because it would render at its natural size', () => {
    const tree = el('div', null, voidEl('img', { src: 'https://x/y.png', alt: 'y' }));
    expect(ruleNames(tree)).toContain('image-width');
  });

  it('warns about an image with no alt text', () => {
    const tree = el('div', null, voidEl('img', { src: 'https://x/y.png', width: 100 }));
    expect(check(tree).map((f) => f.rule)).toContain('image-alt');
  });

  it('rejects a relative link, which has no base URL to resolve against in an email', () => {
    const tree = el('a', { href: '/about' }, 'About');
    expect(ruleNames(tree)).toContain('relative-link');
  });

  it('requires an unsubscribe link', () => {
    expect(ruleNames(el('p', null, 'no footer here'))).toContain('can-spam');
  });
});

describe('a picture of text', () => {
  // The rule is about a *decision*, not about markup: the output is an ordinary `<img>` and there
  // is nothing in it to find. So the linter is handed the document, and these are the two things
  // worth saying about the choice.
  const template = () => {
    const doc = importV1(fixture as never).template;
    const block = allBlocks(doc).find((b) => b.type === 'richtext')!;
    return { doc, id: block.id };
  };

  const findingsFor = (doc: ReturnType<typeof template>['doc']) => {
    const out = compile(doc, { mode: 'hubl' });
    return lint({ tree: out.tree, registry: out.registry, html: out.html, bytes: out.bytes, template: doc });
  };

  it('says nothing about a template that has none', () => {
    const { doc } = template();
    expect(findingsFor(doc).map((f) => f.rule)).not.toContain('text-as-image');
  });

  it('warns once somewhere is one, because images are off by default in Outlook', () => {
    const { doc, id } = template();
    const found = findingsFor(renderAsImage(doc, id, { src: 'https://x.test/a.png', alt: 'Headline', width: 560 }));
    const warning = found.find((f) => f.rule === 'text-as-image');
    expect(warning?.severity).toBe('warning');
    expect(warning?.message).toContain('One block is a picture');
  });

  it('is an error rather than a warning when the words did not come with it', () => {
    // Without the alt there is nothing at all for a reader with images off, which is not a trade
    // any more — it is a blank space where the copy was.
    const { doc, id } = template();
    const found = findingsFor(renderAsImage(doc, id, { src: 'https://x.test/a.png', alt: '  ', width: 560 }));
    expect(found.find((f) => f.rule === 'text-as-image-alt')?.severity).toBe('error');
    expect(found.map((f) => f.rule)).not.toContain('text-as-image');
  });

  it('still refuses to export one that is not hosted yet', () => {
    // The rasteriser writes into `assets/`, which is a file name and not a URL. `local-image` is
    // the half of learnings 3.36 that makes the convenience safe.
    const { doc, id } = template();
    const found = findingsFor(renderAsImage(doc, id, { src: 'headline-a1.png', alt: 'Headline', width: 560 }));
    expect(errorsIn(found).map((f) => f.rule)).toContain('local-image');
  });
});
