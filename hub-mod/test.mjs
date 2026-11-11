// HUB-MOD's checks. Run from the repo root:   node --test hub-mod/test.mjs
//
// Two kinds. The structural ones need nothing installed: every starter and a module that uses every part builds
// to exactly the files HubSpot accepts for email, every field module.html reads exists in fields.json, every
// {% if %}, {% for %} and MSO conditional closes, and meta.json is the key set HubSpot's own CLI writes.
//
// The second kind proves learnings 3.1 end to end: module.html, rendered by a Jinja engine with the defaults from
// fields.json, is the same email as the preview. HubL is Jinjava, and nunjucks speaks enough of the same dialect
// to stand in for it. It is optional: `npm i --no-save nunjucks` (or NODE_PATH pointing at one) turns it on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const H = require('./compile.js');
const SYS = H.normalizeSystem(H.SWITCHYARDS);

let nunjucks = null;
try { nunjucks = require('nunjucks'); } catch { /* the render check is skipped */ }

// ---------------------------------------------------------------------------------------------------------------
// A module that uses everything: each part type, links of every kind, a toggle, a theme choice, both column modes,
// both group layouts, fixed parts beside editable ones.
// ---------------------------------------------------------------------------------------------------------------

function kitchenSink() {
  const P = (type, props) => Object.assign(H.makePart(type, SYS), props || {});
  const d = H.newDoc('Kitchen sink', [], { themes: ['cream', 'navy', 'offwhite'] });
  const cols = P('columns', { stack: true, gap: 20 });
  cols.cols[0].parts = [P('image', { name: 'photo', label: 'Photo', src: 'https://example.com/a.png', alt: 'A & B', width: 270, link: true, href: 'https://example.com/?a=1&b=2' })];
  cols.cols[1].parts = [P('heading', { name: 'side_head', label: 'Side heading', value: 'Side <heading>', link: true, href: 'mailto:hello@switchyards.com' }), P('richtext', { name: 'side_body', label: 'Side body' })];
  const fixedCols = P('columns', { stack: false, gap: 12 });
  fixedCols.cols[0].parts = [P('text', { name: 'left_text', label: 'Left', value: 'Left' })];
  fixedCols.cols[1].parts = [P('text', { editable: false, value: 'Fixed right' })];
  const list = P('repeat', { name: 'events', label: 'Events', itemLabel: 'Event', layout: 'list', rule: true, min: 1, max: 6 });
  list.parts = [P('heading', { name: 'title', label: 'Title', style: 'h3', link: true, href: 'https://example.com/e' }), P('text', { name: 'where', label: 'Where' }), P('button', { name: 'rsvp', label: 'RSVP' })];
  list.items = [{ [list.parts[0].id]: { value: 'One', href: 'https://example.com/1' } }, { [list.parts[1].id]: 'Somewhere else' }, {}];
  const grid = P('repeat', { name: 'stats', label: 'Stats', itemLabel: 'Stat', layout: 'grid', perRow: 3, stack: true, min: 0, max: 9 });
  grid.parts = [P('heading', { name: 'number', label: 'Number', style: 'h1', value: '12', optional: false, required: true }), P('text', { name: 'caption', label: 'Caption', value: 'clubs' })];
  grid.items = [{}, {}, {}, {}];
  const fixedGrid = P('repeat', { name: 'logos', label: 'Logos', itemLabel: 'Logo', layout: 'grid', perRow: 2, stack: false, min: 1, max: 4 });
  fixedGrid.parts = [P('image', { name: 'logo', label: 'Logo', src: 'https://example.com/logo.png', alt: 'Logo', width: 200 })];
  fixedGrid.items = [{}, {}, {}];
  d.parts = [
    P('eyebrow', { name: 'eyebrow', label: 'Eyebrow', toggle: true }),
    P('heading', { name: 'heading', label: 'Heading', style: 'h1', color: 'red' }),
    P('divider', {}),
    cols, P('spacer', { height: 24, phoneHeight: 12 }), fixedCols, list, grid, fixedGrid,
    P('button', { name: 'cta', label: 'Button', themed: false, variant: 'secondary', full: true }),
    P('button', { editable: false, value: 'Fixed button', href: 'https://example.com/fixed' }),
  ];
  return d;
}

/** Columns where one side can empty out, a button with no link, and a group item whose required value was edited. */
function edgeCases() {
  const P = (type, props) => Object.assign(H.makePart(type, SYS), props || {});
  const d = H.newDoc('Edge cases', [], { themes: ['cream', 'navy'] });
  const two = P('columns', { stack: true, gap: 24 });
  two.cols[0].parts = [P('eyebrow', { name: 'left_note', label: 'Left note', value: '' })];   // empty by default: the column goes
  two.cols[1].parts = [P('heading', { name: 'right_head', label: 'Right heading', value: 'Takes the full width' })];
  const three = P('columns', { stack: true, gap: 12 });
  three.cols = [{ w: 33, parts: [P('text', { name: 'a', label: 'A', value: 'A' })] }, { w: 34, parts: [P('text', { name: 'b', label: 'B', value: '' })] }, { w: 33, parts: [P('text', { name: 'c', label: 'C', value: 'C' })] }];
  const group = P('repeat', { name: 'rows', label: 'Rows', itemLabel: 'Row', layout: 'list', rule: false, min: 2, max: 4 });
  group.parts = [P('text', { name: 'code', label: 'Code', value: 'X', optional: false, required: true }), P('text', { name: 'note', label: 'Note', value: 'note' })];
  group.items = [{ [group.parts[0].id]: 'Y' }, { [group.parts[0].id]: 'Z', [group.parts[1].id]: '' }, {}];
  d.parts = [two, three, group, P('button', { name: 'nowhere', label: 'Nowhere', value: 'Goes nowhere', href: '' }), P('text', { name: 'tail', label: 'Tail', value: '' })];
  return d;
}

const DOCS = [...H.STARTERS.filter(s => s.id !== 'blank').map(s => [s.name, () => s.make(SYS)]), ['Kitchen sink', kitchenSink], ['Edge cases', edgeCases]];

/** Every picture gets an address, so the preview draws an <img> where the export would. */
function withPictures(d) {
  H.walk(d.parts, p => { if (p.type === 'image' && !p.src) p.src = 'https://example.com/picture.png'; });
  return d;
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

const VOID = new Set(['img', 'br', 'hr', 'meta', 'input', 'link']);
/** Throws on the first unbalanced tag. HubL and comments must be stripped first. */
function assertBalanced(html, where) {
  const stack = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const [, close, tag0, selfClose] = m; const tag = tag0.toLowerCase();
    if (VOID.has(tag) || selfClose) continue;
    if (!close) stack.push(tag);
    else {
      const top = stack.pop();
      assert.equal(top, tag, `${where}: </${tag}> closes <${top}> near …${html.slice(Math.max(0, m.index - 80), m.index + 20)}`);
    }
  }
  assert.deepEqual(stack, [], `${where}: unclosed ${stack.join(', ')}`);
}
const stripHubl = s => s.replace(/\{#[\s\S]*?#\}/g, '').replace(/\{%[\s\S]*?%\}/g, '').replace(/\{\{[\s\S]*?\}\}/g, 'X');
const stripComments = s => s.replace(/<!--\[if !mso\]><!-->/g, '').replace(/<!--<!\[endif\]-->/g, '').replace(/<!--[\s\S]*?-->/g, '');
const msoParts = s => [...s.matchAll(/<!--\[if mso\]>([\s\S]*?)<!\[endif\]-->/g)].map(m => m[1]).join('');
const stripStyles = s => s.replace(/<style[\s\S]*?<\/style>/g, '');

// ---------------------------------------------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------------------------------------------

for (const [name, make] of DOCS) {
  test(`${name}: builds the three files an email module may hold, and passes its own checks`, () => {
    const d = make(); const b = H.build(d, SYS);
    assert.deepEqual(b.files.map(f => f.path), ['module.html', 'fields.json', 'meta.json']);
    const errors = H.check(d, SYS, b).filter(i => i.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${name}: meta.json is the key set the HubSpot CLI writes for an email module`, () => {
    const meta = JSON.parse(H.build(make(), SYS).files[2].text);
    assert.deepEqual(Object.keys(meta).sort(), ['content_types', 'css_assets', 'external_js', 'global', 'help_text', 'is_available_for_new_content', 'js_assets', 'label', 'other_assets', 'smart_type', 'tags'].sort());
    assert.deepEqual(meta.content_types, ['EMAIL']);
    assert.equal(meta.global, false);
    assert.equal(meta.is_available_for_new_content, true);
    assert.ok(meta.label.length > 0);
    assert.equal('host_template_types' in meta, false);
  });

  test(`${name}: fields.json is well formed`, () => {
    const fields = JSON.parse(H.build(make(), SYS).files[1].text);
    const checkList = (list, where) => {
      const names = new Set();
      for (const f of list) {
        for (const k of ['name', 'label', 'type']) assert.ok(f[k], `${where}: a field without ${k}`);
        assert.match(f.name, /^[a-z][a-z0-9_]*$/, `${where}: bad name ${f.name}`);
        assert.ok(!names.has(f.name), `${where}: ${f.name} twice`); names.add(f.name);
        assert.ok(['text', 'richtext', 'image', 'link', 'boolean', 'choice', 'group'].includes(f.type), `${where}: ${f.type} is not a type HUB-MOD emits`);
        if (f.type === 'choice') assert.ok(f.choices.some(c => c[0] === f.default), `${where}: ${f.name} default is not a choice`);
        if (f.type === 'link') { assert.ok(f.default.url && 'href' in f.default.url); assert.ok(!/^mailto:/i.test(f.default.url.href), 'an email address is stored bare'); }
        if (f.type === 'image') assert.equal(typeof f.default.src, 'string');
        if (f.type === 'group') {
          checkList(f.children, `${where}.${f.name}`);
          if (f.occurrence) {
            assert.ok(Array.isArray(f.default), 'a repeating group defaults to an array');
            assert.equal(f.default.length, f.occurrence.default);
            assert.ok(f.occurrence.min <= f.occurrence.default && f.occurrence.default <= f.occurrence.max);
            const kids = new Set(f.children.map(c => c.name));
            for (const item of f.default) for (const k of Object.keys(item)) assert.ok(kids.has(k), `${f.name} default has ${k}, which is not a child`);
            if (f.occurrence.sorting_label_field) assert.ok(kids.has(f.occurrence.sorting_label_field.split('.')[1]));
          }
        }
      }
    };
    checkList(fields, 'fields');
  });

  test(`${name}: module.html reads only fields that exist, and every block closes`, () => {
    const b = H.build(make(), SYS);
    const fields = JSON.parse(b.files[1].text);
    const top = new Set(fields.map(f => f.name));
    const kids = new Set(fields.filter(f => f.type === 'group').flatMap(f => f.children.map(c => c.name)));
    for (const m of b.html.matchAll(/\bmodule\.([a-z0-9_]+)/g)) assert.ok(top.has(m[1]), `module.${m[1]} is not in fields.json`);
    for (const m of b.html.matchAll(/\bitem\.([a-z0-9_]+)/g)) assert.ok(kids.has(m[1]), `item.${m[1]} is not a group child`);
    const count = re => (b.html.match(re) || []).length;
    assert.equal(count(/\{%\s*if\b/g), count(/\{%\s*endif\s*%\}/g), 'if / endif');
    assert.equal(count(/\{%\s*for\b/g), count(/\{%\s*endfor\s*%\}/g), 'for / endfor');
    assert.equal(count(/\{\{/g), count(/\}\}/g), '{{ / }}');
    assert.equal(count(/<!--\[if/g), count(/<!\[endif\]-->/g), 'MSO conditionals');
    assert.ok(!/require_css|require_head|module\.css/i.test(b.html.replace(/\{#[\s\S]*?#\}/g, '')), 'nothing that only works on pages');
    const body = stripStyles(b.html);
    assertBalanced(stripComments(stripHubl(body)), 'markup outside Outlook');
    assertBalanced(stripHubl(msoParts(body)), 'Outlook ghost tables');
  });

  test(`${name}: the preview is balanced HTML, filled and empty`, () => {
    const d = make();
    for (const empty of [false, true]) {
      const html = H.render(d, SYS, { mode: 'preview', empty, theme: d.themes[0] });
      assert.ok(!/\{\{|\{%/.test(html), 'no HubL in the preview');
      assertBalanced(stripComments(html), `preview ${empty ? 'empty' : 'filled'}`);
    }
  });
}

test('names stay unique when parts are copied, and a group keeps its items when it is', () => {
  const d = kitchenSink();
  const list = d.parts.find(p => p.type === 'repeat');
  const copy = H.reid(JSON.parse(JSON.stringify(list)));
  d.parts.push(copy); H.claimNames(d, copy);
  assert.notEqual(copy.name, list.name);
  assert.equal(copy.items[0][copy.parts[0].id].value, 'One', 'item values follow the re-id');
  assert.deepEqual(H.check(d, SYS, H.build(d, SYS)).filter(i => i.level === 'error'), []);
});

test('the checks catch what HubSpot or the team would trip on', () => {
  const d = H.newDoc('Broken', [Object.assign(H.makePart('image', SYS), { src: 'file:///Users/me/a.png' }), Object.assign(H.makePart('text', SYS), { name: 'label' }), Object.assign(H.makePart('text', SYS), { name: 'label_2' })]);
  d.parts[2].name = d.parts[1].name = 'dupe';
  const msgs = H.check(d, SYS, H.build(d, SYS)).filter(i => i.level === 'error').map(i => i.msg).join('\n');
  assert.match(msgs, /https:\/\//);
  assert.match(msgs, /Two fields are called “dupe”/);
  const r = H.newDoc('Reserved', [Object.assign(H.makePart('text', SYS), { name: 'items' })]);
  assert.match(H.check(r, SYS).map(i => i.msg).join('\n'), /HubL already uses/);
});

test('a HubL keyword is never a field name', () => {
  for (const word of ['empty', 'in', 'or', 'not', 'div', 'mod', 'if']) {
    const d = H.newDoc('Keywords', [Object.assign(H.makePart('text', SYS), { label: word, name: word })]);
    assert.match(H.check(d, SYS).filter(i => i.level === 'error').map(i => i.msg).join('\n'), /HubL already uses/, word);
    const p = Object.assign(H.makePart('text', SYS), { label: word, name: '' });
    d.parts.push(p); H.claimNames(d, p);
    assert.notEqual(p.name, word, `${word} is suffixed when it is claimed`);
  }
});

test('a button with no link, and an edge-case module, behave', () => {
  const d = edgeCases();
  const html = H.render(d, SYS, { mode: 'preview', ids: false });
  assert.ok(!html.includes('Goes nowhere'), 'a button with no address is not drawn');
  assert.ok(html.includes('width:100%;min-width:100%'), 'the column left alone takes the full width');
  assert.match(H.check(d, SYS).map(i => i.msg).join('\n'), /no link/);
  const empty = H.render(d, SYS, { mode: 'preview', ids: false, empty: true });
  assert.ok(empty.includes('>Y<') && empty.includes('>Z<'), 'empty keeps each item\'s own required value');
});

test('a missing value is not content, and a dropped theme falls back', { skip: !nunjucks && 'nunjucks not installed' }, () => {
  const d = H.STARTERS.find(s => s.id === 'events').make(SYS);
  d.themes = ['cream', 'navy'];
  const b = H.build(d, SYS);
  const env = new nunjucks.Environment(null, { autoescape: false });
  env.addFilter('escape_html', escHtml); env.addFilter('escape_attr', escHtml); env.addFilter('escape_url', escHtml);
  const ctx = context(JSON.parse(b.files[1].text), false);
  const blank = JSON.parse(JSON.stringify(ctx)); blank.module.events[0].where = '';
  const missing = JSON.parse(JSON.stringify(ctx)); delete missing.module.events[0].where;
  assert.equal(norm(env.renderString(b.html, missing)), norm(env.renderString(b.html, blank)), 'an item made before a field existed collapses like an empty one');
  const gone = JSON.parse(JSON.stringify(ctx)); gone.module.theme_choice = 'offwhite';
  assert.match(env.renderString(b.html, gone), /hm-t-cream/, 'a theme the module no longer offers falls back to the first');
});

test('a zip holds the folder', () => {
  const z = H.zip([{ path: 'a.module/module.html', text: 'hi' }, { path: 'a.module/meta.json', text: '{}' }]);
  const v = new DataView(z.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(z.length - 22, true), 0x06054b50);
  assert.equal(v.getUint16(z.length - 22 + 10, true), 2);
});

// ---------------------------------------------------------------------------------------------------------------
// One render path: the export, rendered, is the preview.
// ---------------------------------------------------------------------------------------------------------------

const escHtml = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const norm = s => stripStyles(s).replace(/\{#[\s\S]*?#\}/g, '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

/** What HubSpot hands module.html: each field's default, groups as lists of item objects. */
function context(fields, empty) {
  const blank = f => (f.type === 'image' ? Object.assign({}, f.default, { src: '' }) : f.type === 'link' ? f.default : f.type === 'boolean' || f.type === 'choice' ? f.default : '');
  const value = (f, v) => (empty && !f.required && ['text', 'richtext', 'image'].includes(f.type) ? blank(f) : v);
  const module = {};
  for (const f of fields) {
    if (f.type === 'group' && f.occurrence) {
      const items = empty ? f.default.slice(0, f.occurrence.min) : f.default;
      module[f.name] = items.map(it => { const o = {}; for (const c of f.children) o[c.name] = value(c, it[c.name] !== undefined ? it[c.name] : c.default); return o; });
    } else module[f.name] = value(f, f.default);
  }
  return { module };
}

for (const [name, make] of DOCS) {
  for (const empty of [false, true]) {
    test(`${name}: module.html rendered from its defaults is the preview (${empty ? 'optional fields empty' : 'filled'})`, { skip: !nunjucks && 'nunjucks not installed' }, () => {
      const d = withPictures(make());
      const b = H.build(d, SYS);
      const env = new nunjucks.Environment(null, { autoescape: false, throwOnUndefined: false });
      env.addFilter('escape_html', escHtml); env.addFilter('escape_attr', escHtml); env.addFilter('escape_url', escHtml);
      const out = env.renderString(b.html, context(JSON.parse(b.files[1].text), empty));
      const preview = H.render(d, SYS, { mode: 'preview', ids: false, empty, theme: d.themes[0] });
      assert.equal(norm(out), norm(preview));
    });
  }
}
