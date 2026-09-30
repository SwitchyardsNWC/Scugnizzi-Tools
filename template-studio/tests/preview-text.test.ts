// HubSpot's preview text (compile/preview-text.ts, learnings 1.17).
//
// Jared, 2026-09-30: "In template studio - create a tool to use Hubspots 'Preview text'."
//
// Defended: every template declares HubSpot's `preview_text` exactly once, in the shape HubSpot documents —
// rendered in place, unwrapped, in a hidden div that is the first thing in the body; Studio's preview text is its
// default, on one line; the spacer follows only written preview text; the canvas carries the same hidden div; the
// email itself does not move; no block field can take the name; and the email's first words, which a client shows
// when there is no preview text, skip everything a client would skip.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { firstWords, PREVIEW_TEXT, SPACER } from '../src/compile/preview-text.ts';
import { fieldName, slug } from '../src/model/ids.ts';
import { importV1 } from '../src/model/import-v1.ts';
import { blankTemplate, cardTemplate } from '../src/model/starters.ts';
import { switchyardsShortTemplate, switchyardsTemplate } from '../src/model/switchyards.ts';
import type { Template } from '../src/model/types.ts';
import fixture from '../reference/v1-standard-email.design.json';

const hubl = (t: Template) => compile(t, { mode: 'hubl', date: '2026-09-30' });
const written = (t: Template, previewText: string): Template => ({ ...t, previewText });
const everyTemplate = (): Template[] => [switchyardsTemplate(), switchyardsShortTemplate(), cardTemplate(), blankTemplate(), importV1(fixture as never).template];
const tag = (html: string) => /\{%\s*text\s+"preview_text"[\s\S]*?%\}/.exec(html)?.[0] ?? '';

describe('HubSpot’s preview text', () => {
  it('is declared once in every template, in the shape HubSpot documents', () => {
    for (const t of everyTemplate()) {
      const html = hubl(t).html;
      expect(html.match(/\{%\s*text\s+"preview_text"/g), t.name).toHaveLength(1);
      const declared = tag(html);
      expect(declared, t.name).toContain('label="Preview Text <span class=help-text>This will be used as the preview text that displays in some email clients</span>"');
      expect(declared, t.name).toContain('no_wrapper=True');
      // Rendered where it stands, so the value lands in the hidden div. Exported, it would print nothing there.
      expect(declared, t.name).not.toContain('export_to_template_context');
    }
  });

  it('sits in a hidden div, the first thing in the body, outside the wrapper', () => {
    const html = hubl(switchyardsTemplate()).html;
    const bodyEnd = html.indexOf('>', html.indexOf('<body')) + 1;
    const div = html.indexOf(`<div id="${PREVIEW_TEXT}"`);
    expect(html.slice(bodyEnd, div).trim()).toBe('');
    expect(div).toBeLessThan(html.indexOf('<div class="hse-body-background"'));
    const open = html.slice(div, html.indexOf('>', div) + 1);
    expect(open).toContain('display:none!important');
    // Outlook on Windows ignores `display` on a div.
    expect(open).toContain('mso-hide:all');
    expect(html.indexOf(tag(html))).toBe(div + open.length);
  });

  it('carries Studio’s preview text as its default, on one line, with its apostrophes safe', () => {
    const html = hubl(written(switchyardsTemplate(), "Doors open at six.\nIt's free for members.  ")).html;
    expect(tag(html)).toContain("value='Doors open at six. It’s free for members.'");
  });

  it('is followed by the spacer only when there is preview text for it to follow', () => {
    const blank = hubl(switchyardsTemplate()).html;
    expect(tag(blank)).toContain("value=''");
    expect(blank).not.toContain(SPACER);
    expect(hubl(written(switchyardsTemplate(), '   ')).html).not.toContain(SPACER);

    const html = hubl(written(switchyardsTemplate(), 'Doors open at six.')).html;
    const declared = tag(html);
    expect(html).toContain(`${declared}${SPACER}</div>`);
  });

  it('is on the canvas too, hidden, with the text in it and no HubL', () => {
    const html = compile(written(switchyardsTemplate(), 'Members & guests'), { mode: 'preview' }).html;
    expect(html).toMatch(/<div id="preview_text" style="display:none!important[^"]*">Members &amp; guests&#847;/);
    expect(html).not.toContain('{%');
  });

  it('leaves the email itself as it was', () => {
    const email = (html: string) => html.slice(html.indexOf('<div class="hse-body-background"'));
    for (const t of everyTemplate()) {
      expect(email(hubl(written(t, 'Doors open at six.')).html), t.name).toBe(email(hubl(t).html));
    }
  });

  it('passes the checks', () => {
    for (const t of everyTemplate()) {
      const w = written(t, 'Doors open at six.');
      const out = hubl(w);
      expect(errorsIn(lint({ ...out, mode: 'hubl', template: w })), t.name).toEqual([]);
    }
  });

  it('keeps its name to itself', () => {
    // A Text block labelled "Preview text" would otherwise be named `preview_text`, a second declaration of
    // HubSpot's field that the upload refuses.
    expect(slug('Preview text')).not.toBe(PREVIEW_TEXT);
    expect(fieldName('Preview text', new Set())).toBe('preview_text_field');

    // And a document that holds the name anyway, written by hand or by an older build, is caught.
    const t = switchyardsTemplate();
    const clash = JSON.parse(JSON.stringify(t).replace(/"email_body"/g, `"${PREVIEW_TEXT}"`)) as Template;
    const out = hubl(clash);
    expect(errorsIn(lint({ ...out, mode: 'hubl', template: clash })).map((f) => f.rule)).toContain('duplicate-field');
  });
});

describe('the email’s first words', () => {
  it('skip what a client skips', () => {
    const html =
      '<html><head><title>Title</title><style>.a { color:red }</style></head>' +
      '<body class="x"><div id="preview_text" style="display:none!important">Hidden <div>nested</div> still hidden</div>' +
      '<!--[if mso]><p>Outlook only</p><![endif]-->' +
      '<table><tr><td><img alt="Logo" src="logo.png"><p style="margin:0">Hello&nbsp;there &amp; welcome</p>' +
      '<div data-sy-slot="">Drop a block here</div>' +
      '<p title="a > b">It&#39;s   <b>here</b>&#847;&zwnj;</p></td></tr></table></body></html>';
    expect(firstWords(html)).toBe("Hello there & welcome It's here");
  });

  it('read a real email’s canvas, and never the preview text', () => {
    const preview = compile(written(switchyardsTemplate(), 'Doors open at six.'), { mode: 'preview', annotate: true }).html;
    const words = firstWords(preview);
    expect(words.length).toBeGreaterThan(20);
    expect(words).not.toContain('Doors open at six');
    expect(words).not.toContain('Drop a block');
    expect(words).not.toMatch(/[<>{}]/);
  });

  it('run through a bold word or a link without a space either side', () => {
    expect(firstWords('<body><p>Open on <b>October 26</b>. <a href="x">Book</a>, now.</p><p>Next</p></body>')).toBe('Open on October 26. Book, now. Next');
  });

  it('stop at the length asked for', () => {
    expect(firstWords('<body><p>one two three four</p></body>', 7)).toBe('one two');
  });
});
