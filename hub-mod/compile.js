// HUB-MOD's compiler: a module design in, a HubSpot custom email module out.
//
// Pure and DOM-free, so it runs in the page as `window.HubMod` and under Node for the checks in test.mjs.
//
// The one rule it is built on (learnings 3.1): every part renders through the same function in two modes.
// `preview` writes the defaults in place; `hubl` writes the HubL that reads the team's fields. The canvas is
// therefore the module itself, and the two cannot drift.
//
// What a module is, in HubSpot's terms: a folder `<slug>.module/` holding module.html (markup, HubL and its own
// <style> blocks), fields.json (what the team edits) and meta.json (what HubSpot calls it, and that it is for
// email). An email module has no module.css or module.js: HubSpot refuses both. The marketing team drags the
// module into a drag-and-drop email and fills in the fields.
(function (root) {
  'use strict';

  // -----------------------------------------------------------------------------------------------------------
  // The Switchyards system. The page reads the live file from template-studio/design-systems when it is served;
  // this copy is the fallback for a double-clicked file, and the fixture for test.mjs.
  // -----------------------------------------------------------------------------------------------------------

  const SWITCHYARDS = {
    blockGap: 16,
    buttons: {
      primary: { border: 'red', borderWidth: 2, fill: 'cream', ink: 'red', mobileSize: 0, padX: 18, padY: 12, radius: 25, size: 16 },
      secondary: { border: 'white', borderWidth: 2, fill: 'navy', ink: 'white', mobileSize: 0, padX: 17, padY: 9, radius: 25, size: 13 },
    },
    colors: { cream: '#f7f6f3', navy: '#011272', offwhite: '#fcfff5', red: '#d10000', redBright: '#d20000', white: '#ffffff' },
    containerWidth: 600,
    fontStack: 'Helvetica, Arial, sans-serif',
    mobileBreakpoint: 639,
    pageBackground: '#f7f6f3',
    richText: { listGap: 4, listIndent: 22, listLineHeight: 135, quoteBar: 3, quoteColor: 'red', quoteInset: 16, quoteItalic: true, ruleColor: 'red', ruleWidth: 2 },
    space: { l: 40, m: 20, s: 10 },
    themes: {
      cream: { band: null, button: 'primary', container: 'cream', link: 'red', text: 'navy' },
      navy: { band: 'navy', button: 'secondary', container: null, link: 'offwhite', text: 'offwhite' },
      offwhite: { band: 'offwhite', button: 'primary', container: null, link: 'red', text: 'navy' },
    },
    type: {
      body: { lineHeight: 150, marginBottom: 16, mobileSize: 17, size: 18, weight: 'normal' },
      h1: { lineHeight: 120, marginBottom: 16, mobileSize: 30, size: 38, weight: 'bold' },
      h2: { lineHeight: 125, marginBottom: 12, mobileSize: 20, size: 22, weight: 'bold' },
      h3: { lineHeight: 130, marginBottom: 10, mobileSize: 17, size: 17, weight: 'bold' },
      h4: { lineHeight: 135, marginBottom: 8, mobileSize: 15, size: 15, weight: 'bold' },
      h5: { letterSpacing: 0.6, lineHeight: 135, marginBottom: 8, mobileSize: 14, size: 14, uppercase: true, weight: 'bold' },
      h6: { letterSpacing: 0.7, lineHeight: 135, marginBottom: 8, mobileSize: 12, size: 12, uppercase: true, weight: 'bold' },
    },
  };

  const COLOR_NAMES = { cream: 'Cream', navy: 'Navy', offwhite: 'Off-white', red: 'Red', redBright: 'Bright red', white: 'White' };
  const TEXT_LABELS = { h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4', h5: 'Eyebrow (H5)', h6: 'Label (H6)', body: 'Body', small: 'Small' };

  function titleCase(k) { return String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()); }

  /** The system file as this tool uses it: hex values resolved, every theme spelled out, a label on everything. */
  function normalizeSystem(j) {
    j = j || SWITCHYARDS;
    const colors = Object.assign({}, SWITCHYARDS.colors, j.colors || {});
    const hex = t => colors[t] || (/^#[0-9a-f]{3,8}$/i.test(t || '') ? t : '#000000');
    const colorNames = {};
    for (const k of Object.keys(colors)) colorNames[k] = COLOR_NAMES[k] || titleCase(k);
    const buttons = {};
    for (const [k, b] of Object.entries(j.buttons || SWITCHYARDS.buttons)) {
      buttons[k] = { label: titleCase(k), fillToken: b.fill, fill: hex(b.fill), borderToken: b.border, border: hex(b.border), borderWidth: b.borderWidth | 0,
        inkToken: b.ink, ink: hex(b.ink), radius: b.radius | 0, padX: b.padX | 0, padY: b.padY | 0, size: b.size || 16, mobileSize: b.mobileSize | 0 };
    }
    const themes = {};
    for (const [k, t] of Object.entries(j.themes || SWITCHYARDS.themes)) {
      const bgToken = t.band || t.container || 'white';
      themes[k] = { label: titleCase(k === 'offwhite' ? 'Off-white' : k), bgToken, bg: hex(bgToken), textToken: t.text, text: hex(t.text),
        accentToken: t.link, accent: hex(t.link), button: buttons[t.button] ? t.button : Object.keys(buttons)[0] };
    }
    const type = Object.assign({}, SWITCHYARDS.type, j.type || {});
    const text = {};
    for (const k of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body']) {
      const s = type[k]; if (!s) continue;
      text[k] = { label: TEXT_LABELS[k], size: s.size, mobileSize: s.mobileSize || s.size, lineHeight: s.lineHeight, weight: s.weight || 'normal',
        uppercase: !!s.uppercase, letterSpacing: s.letterSpacing || 0, marginBottom: s.marginBottom == null ? 16 : s.marginBottom };
    }
    // Not in the system file: a smaller body for dates, places and captions. Derived, not invented: body's leading.
    text.small = { label: TEXT_LABELS.small, size: 14, mobileSize: 14, lineHeight: 140, weight: 'normal', uppercase: false, letterSpacing: 0, marginBottom: 8 };
    return {
      colors, colorNames, buttons, themes, text,
      fontStack: j.fontStack || SWITCHYARDS.fontStack,
      space: Object.assign({}, j.space || SWITCHYARDS.space),
      mobileBreakpoint: j.mobileBreakpoint || 639,
      containerWidth: j.containerWidth || 600,
      richText: Object.assign({}, SWITCHYARDS.richText, j.richText || {}),
      hex,
    };
  }

  // -----------------------------------------------------------------------------------------------------------
  // Parts
  // -----------------------------------------------------------------------------------------------------------

  let counter = 0;
  function uid(prefix) { counter = (counter + 1) % 1296; return `${prefix || 'p'}_${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 5)}`; }

  // `field` is the HubSpot field type the part becomes; `collapses` means "hide when empty" makes sense for it.
  const TYPES = {
    eyebrow: { label: 'Eyebrow', glyph: 'Ey', field: 'text', collapses: true, blurb: 'A short label over a heading' },
    heading: { label: 'Heading', glyph: 'H', field: 'text', collapses: true, blurb: 'A line or two in the type scale' },
    text: { label: 'Text', glyph: 'Tx', field: 'text', collapses: true, blurb: 'One plain line: a date, a place, a caption' },
    richtext: { label: 'Rich text', glyph: '¶', field: 'richtext', collapses: true, blurb: 'Paragraphs, links and lists the team formats' },
    image: { label: 'Image', glyph: 'Im', field: 'image', collapses: false, blurb: 'A picture from HubSpot Files, linked or not' },
    button: { label: 'Button', glyph: 'Bt', field: 'link', collapses: true, blurb: 'A bulletproof button: its label and its link' },
    divider: { label: 'Divider', glyph: '—', field: null, blurb: 'A rule in a theme colour' },
    spacer: { label: 'Spacer', glyph: '↕', field: null, blurb: 'Fixed space, with its own phone height' },
    columns: { label: 'Columns', glyph: '▥', container: true, blurb: 'Two or three side by side; stacks on phones' },
    repeat: { label: 'Repeating group', glyph: '⟳', container: true, blurb: 'A set the team adds to: events, stats, people' },
  };

  const DEFAULT_LABEL = { eyebrow: 'Eyebrow', heading: 'Heading', text: 'Text', richtext: 'Body', image: 'Image', button: 'Button' };

  function makePart(type, sys) {
    const base = { id: uid('p'), type };
    const field = n => ({ editable: true, label: DEFAULT_LABEL[type], name: n, nameAuto: true, help: '', required: false, optional: true, toggle: false });
    switch (type) {
      case 'eyebrow': return Object.assign(base, field('eyebrow'), { value: 'Coming up', style: 'h5', color: 'accent', align: 'left', gap: 8, link: false, href: '' });
      case 'heading': return Object.assign(base, field('heading'), { value: 'A heading that says the one thing', style: 'h2', color: 'text', align: 'left', gap: 12, link: false, href: '' });
      case 'text': return Object.assign(base, field('text'), { value: 'Thursday, 6 pm · Midtown', style: 'small', color: 'text', align: 'left', gap: 8, link: false, href: '' });
      case 'richtext': return Object.assign(base, field('body'), { value: '<p>Two or three sentences the team rewrites for each send. Keep it short: the button does the rest.</p>', style: 'body', color: 'text', linkColor: 'accent', align: 'left', gap: 16 });
      case 'image': return Object.assign(base, field('image'), { src: '', alt: '', width: 560, align: 'left', link: false, href: '', phoneFull: true, radius: 0, gap: 16 });
      case 'button': return Object.assign(base, field('button'), { value: 'Book a tour', href: 'https://switchyards.com', variant: 'primary', themed: true, align: 'left', full: false, phoneFull: false, gap: 0 });
      case 'divider': return Object.assign(base, { editable: false, color: 'accent', thickness: 2, length: 100, align: 'left', gap: 16 });
      case 'spacer': return Object.assign(base, { editable: false, height: 20, phoneHeight: 0 });
      case 'columns': return Object.assign(base, { cols: [{ w: 50, parts: [] }, { w: 50, parts: [] }], gap: 20, valign: 'top', stack: true, gapBelow: 16 });
      case 'repeat': return Object.assign(base, { label: 'Entries', name: 'entries', nameAuto: true, itemLabel: 'Entry', min: 1, max: 12, layout: 'list', perRow: 3, stack: true, gap: 20, rule: true, gapBelow: 16, sortField: null, parts: [], items: [{}, {}] });
    }
    throw new Error(`Unknown part type ${type}`);
  }

  function isEditable(p) { return !!(p && TYPES[p.type] && TYPES[p.type].field && p.editable); }
  function glyph(p) { return p.type === 'heading' && /^h\d$/.test(p.style) ? p.style.toUpperCase() : TYPES[p.type].glyph; }
  function excerpt(s, n = 40) { const t = String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; }
  function title(p) {
    if (p.type === 'columns') return `Columns · ${p.cols.map(c => c.w).join(' / ')}`;
    if (p.type === 'repeat') return `${p.label || 'Group'} · ${p.items.length} ${p.layout === 'grid' ? `in rows of ${p.perRow}` : 'listed'}`;
    if (p.type === 'divider') return `Divider · ${p.thickness}px`;
    if (p.type === 'spacer') return `Spacer · ${p.height}px`;
    if (isEditable(p)) return p.label || TYPES[p.type].label;
    if (p.type === 'image') return p.alt ? `Image · ${excerpt(p.alt, 30)}` : 'Image';
    return excerpt(p.value) || TYPES[p.type].label;
  }

  /** What may sit where. Columns hold single parts; a repeating group holds parts and columns; nothing nests a group. */
  function canHold(owner, part) {
    if (!owner) return true;
    if (owner.type === 'columns') return !TYPES[part.type].container;
    if (owner.type === 'repeat') return part.type !== 'repeat';
    return false;
  }
  function whyNot(owner, part) {
    if (owner && owner.type === 'columns') return 'A column holds single parts. Put the columns inside the group instead.';
    if (owner && owner.type === 'repeat' && part.type === 'repeat') return 'A repeating group inside another is more than the team can follow. Use one group.';
    return 'That cannot go there';
  }

  function walk(parts, fn, owner = null) {
    for (const p of parts) {
      fn(p, owner);
      if (p.type === 'columns') for (const c of p.cols) walk(c.parts, fn, p);
      if (p.type === 'repeat') walk(p.parts, fn, p);
    }
  }
  function findPath(parts, id, trail = []) {
    for (const p of parts) {
      if (p.id === id) return trail.concat(p);
      if (p.type === 'columns') for (const c of p.cols) { const r = findPath(c.parts, id, trail.concat(p)); if (r) return r; }
      if (p.type === 'repeat') { const r = findPath(p.parts, id, trail.concat(p)); if (r) return r; }
    }
    return null;
  }
  /** The repeating group whose fields a part belongs to, or null for the module's own list. */
  function scopeOf(d, part) {
    const path = findPath(d.parts, part.id) || [];
    for (let i = path.length - 2; i >= 0; i--) if (path[i].type === 'repeat') return path[i];
    return null;
  }
  /** Fresh ids for a copied part and everything in it. A group's items are keyed by its parts' ids, so they follow. */
  function reid(p, map) {
    map = map || {};
    if (p.parts && p.type !== 'repeat' && !p.cols) { /* a whole module */ p.parts.forEach(q => reid(q, map)); return p; }
    const old = p.id; p.id = uid('p'); map[old] = p.id;
    if (p.type === 'columns') p.cols.forEach(c => c.parts.forEach(q => reid(q, map)));
    if (p.type === 'repeat') {
      p.parts.forEach(q => reid(q, map));
      p.items = (p.items || []).map(it => { const o = {}; for (const [k, v] of Object.entries(it)) o[map[k] || k] = v; return o; });
      if (p.sortField && map[p.sortField]) p.sortField = map[p.sortField];
    }
    return p;
  }
  /** A short, stable class suffix for a part: its id hashed, so preview and export always agree. */
  function sid(p) { let h = 2166136261; for (const ch of String(p.id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36).slice(0, 6); }

  // -----------------------------------------------------------------------------------------------------------
  // Names. A field's name is what module.html reads it by; renaming it after use orphans what the team typed
  // (learnings 1.10). So names derive from labels until someone sets one, and stay unique within their scope.
  // -----------------------------------------------------------------------------------------------------------

  // Names that read as HubL or HubSpot's own, which a field should not shadow.
  // HubSpot publishes no list; these are the module tag's own parameters, a dict's methods, and HubL's names.
  const RESERVED = new Set(['module', 'name', 'type', 'label', 'path', 'id', 'no_wrapper', 'extra_classes', 'export_to_template_context', 'items', 'keys', 'values',
    'css', 'style', 'widget_data', 'content', 'request', 'site_settings', 'loop', 'item', 'true', 'false', 'none', 'null', 'theme_settings', 'theme', 'hubspot']);

  function fieldNameFrom(label, type, raw) {
    let n = String(label || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!raw) n = n.slice(0, 40).replace(/_+$/, '');
    if (!n) n = type || 'field';
    if (/^[0-9]/.test(n)) n = `f_${n}`;
    return n;
  }
  function slugFrom(name, raw) {
    let s = String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!raw) s = s.slice(0, 48).replace(/-+$/, '');
    return s || 'module';
  }
  function syncSlug(d, force) { if (d.slugAuto || force) { d.slug = `sy-${slugFrom(d.name)}`.replace(/^sy-sy-/, 'sy-'); d.slugAuto = true; } }

  const LINKABLE = new Set(['eyebrow', 'heading', 'text', 'image']);
  /** Does the part bring a link field of its own: a button always, an image or a line of text when it is linked. */
  function hasLink(p) { return p.type === 'button' || (LINKABLE.has(p.type) && !!p.link); }

  /** Every name a part puts into fields.json. A toggle only exists outside a group: inside one, the team removes the item. */
  function namesOf(p, inRepeat) {
    if (p.type === 'repeat') return [p.name];
    if (!isEditable(p)) return [];
    const out = [p.name];
    if (hasLink(p)) out.push(`${p.name}_link`);
    if (p.toggle && !inRepeat) out.push(`show_${p.name}`);
    return out;
  }

  /** The parts whose names share one namespace: the module's own list, or one group's. */
  function scopeParts(d, scope) {
    const out = [];
    if (scope) walk(scope.parts, q => out.push(q));
    else {
      const top = (parts) => { for (const q of parts) { out.push(q); if (q.type === 'columns') q.cols.forEach(c => top(c.parts)); } };
      top(d.parts);
    }
    return out;
  }
  function takenNames(d, scope, except) {
    const set = new Set();
    for (const q of scopeParts(d, scope)) if (q !== except) for (const n of namesOf(q, !!scope)) set.add(n);
    if (!scope && d.themes && d.themes.length > 1) set.add('theme_choice');
    return set;
  }
  function uniqueFieldName(d, part, base) {
    const scope = part.type === 'repeat' ? null : scopeOf(d, part);
    const taken = takenNames(d, scope, part);
    const mine = n => namesOf(Object.assign({}, part, { name: n }), !!scope);
    const clash = n => RESERVED.has(n) || mine(n).some(x => taken.has(x));
    if (!clash(base)) return base;
    for (let i = 2; ; i++) if (!clash(`${base}_${i}`)) return `${base}_${i}`;
  }
  /** After a part lands somewhere new, make it and everything in it unique in the scope it now belongs to. */
  function claimNames(d, part) {
    const list = [part];
    if (part.type === 'columns') part.cols.forEach(c => walk(c.parts, q => list.push(q)));
    if (part.type === 'repeat') walk(part.parts, q => list.push(q));
    for (const q of list) if (isEditable(q) || q.type === 'repeat') q.name = uniqueFieldName(d, q, q.name || fieldNameFrom(q.label, q.type));
  }

  /** How a field is read in module.html: module.x at the top, item.x inside its group's loop. */
  function fieldPath(d, p, suffix = '') {
    const scope = p.type === 'repeat' ? null : scopeOf(d, p);
    return `${scope ? 'item' : 'module'}.${p.name}${suffix}`;
  }
  /** Every field's full name, group children as group.child: what an export is compared against for renames. */
  function fieldNames(d) {
    const out = d.themes && d.themes.length > 1 ? ['theme_choice'] : [];
    walk(d.parts, q => { const sc = q.type === 'repeat' ? null : scopeOf(d, q); for (const n of namesOf(q, !!sc)) out.push(sc ? `${sc.name}.${n}` : n); });
    return out;
  }
  function countFields(d) { return fieldNames(d).length; }

  // -----------------------------------------------------------------------------------------------------------
  // Repeating group items: the defaults a new copy of the module starts with, one object per item, keyed by the
  // child part's id so a rename does not lose them.
  // -----------------------------------------------------------------------------------------------------------

  /** A part's default: a string for words, an object when there is more than one value (a picture, a link). */
  function partDefault(k) {
    if (k.type === 'image') return { src: k.src || '', alt: k.alt || '', href: k.href || '' };
    if (k.type === 'button' || hasLink(k)) return { value: k.value || '', href: k.href || '' };
    return k.value == null ? '' : k.value;
  }
  /** An item's value for a part, falling back to the part's default. Survives the part gaining or losing a link. */
  function itemValue(rep, item, k) {
    const v = item ? item[k.id] : undefined, def = partDefault(k);
    if (v === undefined || v === null) return def;
    if (typeof def === 'object') return Object.assign({}, def, typeof v === 'object' ? v : { value: v });
    return typeof v === 'object' ? (v.value == null ? def : v.value) : v;
  }
  const words = v => (v && typeof v === 'object' ? v.value : v);
  function setItemValue(rep, i, id, sub, v) {
    const item = rep.items[i]; if (!item) return;
    let k = null; walk(rep.parts, q => { if (q.id === id) k = q; });
    if (!k) return;
    if (sub) item[id] = Object.assign({}, itemValue(rep, item, k), { [sub]: v });
    else item[id] = v;
  }
  function newItem() { return {}; }

  // -----------------------------------------------------------------------------------------------------------
  // Documents
  // -----------------------------------------------------------------------------------------------------------

  const SCHEMA = 1;
  function newDoc(name, parts, extra) {
    const d = Object.assign({ schema: SCHEMA, id: uid('m'), name, slug: '', slugAuto: true, description: '', themes: ['cream'], width: 600,
      pad: { top: 'l', bottom: 'l', side: 'm' }, css: { rich: true, sheet: true }, parts: parts || [], exported: null, created: new Date().toISOString(), updated: new Date().toISOString() }, extra || {});
    syncSlug(d);
    return d;
  }
  /** Old saved designs come forward here. One step per schema version; never edit a step once it has shipped. */
  function migrate(d) {
    if (!d || typeof d !== 'object') return d;
    d = JSON.parse(JSON.stringify(d));
    if (!d.schema) d.schema = 1;
    d.themes = Array.isArray(d.themes) && d.themes.length ? d.themes : ['cream'];
    d.pad = Object.assign({ top: 'l', bottom: 'l', side: 'm' }, d.pad || {});
    d.width = d.width === 300 ? 300 : 600;   // a drag-and-drop email is 600 wide; a half column is 300
    d.css = Object.assign({ rich: true, sheet: true }, d.css || {});
    d.parts = Array.isArray(d.parts) ? d.parts : [];
    if (!d.slug) syncSlug(d, true);
    walk(d.parts, p => {
      const fresh = makePart(p.type, null);
      for (const [k, v] of Object.entries(fresh)) if (p[k] === undefined && k !== 'id') p[k] = v;
      if (!p.id) p.id = uid('p');
    });
    return d;
  }

  // -----------------------------------------------------------------------------------------------------------
  // Geometry. Every width is a number of pixels the email can be held to; images take theirs from here and never
  // from the file HubSpot reports (learnings 1.6a and 2.9).
  // -----------------------------------------------------------------------------------------------------------

  const space = (sys, v) => (v === '0' || v === 0 ? 0 : sys.space[v] != null ? sys.space[v] : Number(v) || 0);
  function contentWidth(d, sys) { return d.width - 2 * space(sys, d.pad.side); }

  // A gap is an element of its own, not padding on a column: on a phone the same element turns from a gutter into
  // the space between stacked columns, so nothing ends up inset on one side (see fluid() below).

  /** Column widths: what is left after the gaps, shared by percentage; the last takes the rounding. */
  function columnWidths(p, W) {
    const n = p.cols.length, g = p.gap | 0, room = W - g * (n - 1);
    let used = 0;
    return p.cols.map((c, i) => { const w = i === n - 1 ? room - used : Math.round(room * c.w / 100); used += w; return w; });
  }
  /** A grid cell's width: equal shares of what the gaps leave. */
  function cellWidth(p, W) { const n = Math.max(2, Math.min(3, p.perRow | 0)); return Math.floor((W - (p.gap | 0) * (n - 1)) / n); }
  function slotWidths(d, sys) {
    const map = {};
    const stack = (parts, W) => {
      for (const p of parts) {
        map[p.id] = W;
        if (p.type === 'columns') columnWidths(p, W).forEach((w, i) => stack(p.cols[i].parts, w));
        if (p.type === 'repeat') stack(p.parts, p.layout === 'grid' ? cellWidth(p, W) : W);
      }
    };
    stack(d.parts, contentWidth(d, sys));
    return map;
  }
  function slotWidth(d, sys, id) { return slotWidths(d, sys)[id] || contentWidth(d, sys); }

  // -----------------------------------------------------------------------------------------------------------
  // Escaping
  // -----------------------------------------------------------------------------------------------------------

  const escHtml = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const escAttr = escHtml;
  /** A HubL string literal in double quotes. */
  const hublStr = s => `"${String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;

  /** The designer's rich text default, reduced to markup an email can carry. Not a security boundary; a tidy-up. */
  const RT_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'span', 'sup', 'sub']);
  function cleanRich(html) {
    let s = String(html || '');
    s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object)[\s\S]*?<\/\1>/gi, '');
    s = s.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (m, tag, attrs) => {
      const t = tag.toLowerCase(); if (!RT_TAGS.has(t)) return '';
      if (m.startsWith('</')) return `</${t}>`;
      if (t === 'a') { const h = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs); const href = h ? (h[2] != null ? h[2] : h[3]) : ''; return /^(https?:|mailto:|tel:|#|\{\{)/i.test(href) ? `<a href="${escAttr(href)}">` : '<a>'; }
      return t === 'br' || t === 'hr' ? `<${t}>` : `<${t}>`;
    });
    if (s.trim() && !/^\s*</.test(s)) s = `<p>${s}</p>`;
    return s.trim();
  }

  // -----------------------------------------------------------------------------------------------------------
  // Colour. A part names a colour by role ('text', 'accent') or by token. A role follows the theme; a token stays
  // put. With one theme everything compiles to literals; with a choice, roles become HubL variables set from the
  // team's pick at the top of module.html.
  // -----------------------------------------------------------------------------------------------------------

  function palette(sys, theme, variantOverride) {
    const t = sys.themes[theme] || Object.values(sys.themes)[0];
    return { bg: t.bg, text: t.text, accent: t.accent, button: sys.buttons[variantOverride || t.button] || Object.values(sys.buttons)[0] };
  }

  // -----------------------------------------------------------------------------------------------------------
  // The render. cx carries the mode; every branch on it is in a helper below, so the markup itself is written once.
  // -----------------------------------------------------------------------------------------------------------

  function makeCx(d, sys, opts) {
    const mode = opts.mode === 'hubl' ? 'hubl' : 'preview';
    const theme = opts.theme && d.themes.includes(opts.theme) ? opts.theme : d.themes[0];
    const choice = d.themes.length > 1;
    const root = `hm-${d.slug}`;
    return {
      d, sys, mode, theme, choice, root, empty: !!opts.empty, ids: mode === 'preview' && opts.ids !== false,
      widths: slotWidths(d, sys), font: sys.fontStack.replace(/"/g, "'"),
      used: { tokens: new Set(), roles: new Set(['bg']), styles: new Set(), phoneFull: false, spacers: [], btnFull: false, buttonsThemed: false, buttonVariants: new Set(), columns: [], grids: [], rich: [] },
    };
  }

  /** A colour value for a style attribute: a literal, or the HubL variable that holds the theme's. */
  function col(cx, spec) {
    if (spec === 'text' || spec === 'accent' || spec === 'bg') {
      cx.used.roles.add(spec);
      if (cx.mode === 'hubl' && cx.choice) return `{{ c_${spec} }}`;
      return palette(cx.sys, cx.theme)[spec];
    }
    cx.used.tokens.add(spec);
    return cx.sys.hex(spec);
  }
  /** The class that lets the dark layer re-assert a colour (learnings 2.6). */
  function colClass(spec, what) { return spec === 'text' || spec === 'accent' || spec === 'bg' ? `hm-r${what}-${spec}` : `hm-${what}-${spec}`; }

  function btnProp(cx, p, prop) {
    if (p.themed && cx.choice && cx.mode === 'hubl') { cx.used.buttonsThemed = true; return `{{ b_${prop} }}`; }
    const v = p.themed ? palette(cx.sys, cx.theme).button : (cx.sys.buttons[p.variant] || Object.values(cx.sys.buttons)[0]);
    if (p.themed) cx.used.buttonsThemed = true; else cx.used.buttonVariants.add(p.variant);
    return v[prop];
  }

  // Values. In preview the default (or an item's value) goes in escaped; in HubL the field's path goes in.
  // `sub` picks a value out of a part that has several: 'src' and 'alt' of a picture, 'href' of any link.
  function val(cx, p, sc, sub) {
    if (!isEditable(p)) {
      if (p.type === 'image') return escAttr(sub === 'src' ? p.src : sub === 'alt' ? p.alt : p.href);
      if (sub === 'href') return escAttr(p.href);
      if (p.type === 'richtext') return cleanRich(p.value);
      return escHtml(p.value);
    }
    if (cx.mode === 'hubl') {
      const base = `${sc.item ? 'item' : 'module'}.${p.name}`;
      if (sub === 'href') return '{{ hm_href|escape_url }}';
      if (p.type === 'image') return sub === 'src' ? `{{ ${base}.src|escape_url }}` : `{{ ${base}.alt|escape_attr }}`;
      if (p.type === 'richtext') return `{{ ${base} }}`;
      return `{{ ${base}|escape_html }}`;
    }
    const v = previewValue(cx, p, sc);
    if (p.type === 'image') return escAttr(sub === 'src' ? v.src : sub === 'alt' ? v.alt : v.href);
    if (sub === 'href') return escAttr(v.href);
    if (p.type === 'richtext') return cleanRich(v);
    return escHtml(words(v));
  }
  /** A field's value in the preview. "Empty" means what it means in HubSpot: every field the team may leave blank,
   *  they did. Links keep their address; a link with no words around it never shows anyway. */
  function previewValue(cx, p, sc) {
    const v = sc.item ? itemValue(sc.rep, sc.item, p) : partDefault(p);
    if (!cx.empty || p.required) return v;
    if (p.type === 'image') return Object.assign({}, v, { src: '' });
    if (v && typeof v === 'object') return Object.assign({}, v, { value: '' });
    return '';
  }
  /** A link around some markup: in HubL only when the team set one, so an empty link field leaves plain words. */
  function linkAround(cx, p, sc, inner, style, cls) {
    if (!hasLink(p) || p.type === 'button') return inner;
    const href = val(cx, p, sc, 'href');
    const open = `<a${cls ? ` class="${cls}"` : ''} href="${href}" target="_blank" style="${style}">`;
    if (cx.mode === 'hubl' && isEditable(p)) return `${hrefSet(cx, p, sc)}{% if hm_href %}${open}{% endif %}${inner}{% if hm_href %}</a>{% endif %}`;
    return href ? `${open}${inner}</a>` : inner;
  }
  /** The link's address into hm_href, just before it is used. An email address arrives bare; mailto: goes on here. */
  function hrefSet(cx, p, sc) {
    if (cx.mode !== 'hubl' || !isEditable(p)) return '';
    const f = `${sc.item ? 'item' : 'module'}.${p.name}_link`;
    return `{% set hm_href = ${f}.url.href %}{% if ${f}.url.type == "EMAIL_ADDRESS" and hm_href %}{% set hm_href = "mailto:" ~ hm_href %}{% endif %}`;
  }
  /** Whether a part shows: its toggle, and if it hides when empty, its content. In HubL, the condition. */
  function shows(cx, p, sc) {
    if (!isEditable(p)) return { hubl: null, on: true };
    const base = `${sc.item ? 'item' : 'module'}.${p.name}`;
    const conds = [];
    if (p.toggle && !sc.item) conds.push(`module.show_${p.name}`);
    // A picture with no address is never drawn, hide-when-empty or not: <img src=""> is a broken image.
    if (p.type === 'image') conds.push(`${base}.src`);
    else if (p.optional && !p.required) {
      if (p.type === 'richtext') conds.push(`${base}|striptags|replace("&nbsp;", "")|trim`);   // a cleared field leaves <p>&nbsp;</p>
      else conds.push(`${base}|trim`);   // whitespace is not content (learnings 1.10)
    }
    if (cx.mode === 'hubl') return { hubl: conds.length ? conds.join(' and ') : null, on: true };
    const v = previewValue(cx, p, sc);
    let on = true;
    if (p.type === 'image') on = !!v.src || !cx.empty;   // while designing, an empty picture shows as a placeholder
    else if (p.optional && !p.required) {
      const s = p.type === 'richtext' ? String(v).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '') : words(v);
      on = String(s || '').trim() !== '';
    }
    return { hubl: null, on };
  }
  function wrapIf(cx, cond, inner) { return cond ? `{% if ${cond} %}\n${inner}\n{% endif %}` : inner; }

  const tdAttr = (cx, p) => (cx.ids ? ` data-hm="${p.id}"` : '');
  const ind = (s, n) => s.split('\n').map(l => (l ? ' '.repeat(n) + l : l)).join('\n');

  /** A vertical stack of parts: one table, one row per part, each row carrying its part's space below. */
  function renderStack(cx, parts, sc, W) {
    const rows = [];
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      const r = renderPart(cx, p, sc, last);
      if (r) rows.push(r);
    });
    if (!parts.length) return cx.mode === 'preview' && cx.ids ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:12px;font:12px Helvetica,Arial,sans-serif;color:#9a968e;text-align:center;border:1px dashed #c9c5bd;">Empty: add a part</td></tr></table>` : '';
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">\n${ind(rows.join('\n'), 2)}\n</table>`;
  }

  function rowTd(cx, p, inner, gap, align, extraClass) {
    const pad = gap ? `padding:0 0 ${gap}px 0;` : 'padding:0;';
    return `<tr>\n  <td${tdAttr(cx, p)}${align ? ` align="${align}"` : ''}${extraClass ? ` class="${extraClass}"` : ''} style="${pad}${align ? `text-align:${align};` : ''}">\n${ind(inner, 4)}\n  </td>\n</tr>`;
  }

  function textStyle(cx, s, color, align) {
    const t = cx.sys.text[s] || cx.sys.text.body;
    cx.used.styles.add(s);
    return `margin:0;font-family:${cx.font};font-size:${t.size}px;line-height:${t.lineHeight}%;font-weight:${t.weight};color:${color};text-align:${align};mso-line-height-rule:exactly;${t.uppercase ? 'text-transform:uppercase;' : ''}${t.letterSpacing ? `letter-spacing:${t.letterSpacing}px;` : ''}`;
  }

  function renderPart(cx, p, sc, last) {
    const s = shows(cx, p, sc);
    if (!s.on) return '';
    const gap = last ? 0 : (p.type === 'columns' || p.type === 'repeat' ? p.gapBelow : p.gap) | 0;
    let out = '';
    switch (p.type) {
      case 'eyebrow': case 'heading': case 'text': {
        const tag = p.type === 'heading' && /^h[1-6]$/.test(p.style) ? p.style : 'p';
        const c = col(cx, p.color);
        const cls = [colClass(p.color, 'c'), `hm-s-${p.style}`].join(' ');
        // A linked line keeps its own colour: clients paint a bare <a> blue (learnings 2.7).
        const words = linkAround(cx, p, sc, val(cx, p, sc), `color:${c};text-decoration:${p.type === 'text' ? 'underline' : 'none'};`, colClass(p.color, 'c'));
        out = rowTd(cx, p, `<${tag} class="${cls}" style="${textStyle(cx, p.style, c, p.align)}">${words}</${tag}>`, gap, p.align);
        break;
      }
      case 'richtext': {
        const c = col(cx, p.color); col(cx, p.linkColor);
        cx.used.rich.push(p);
        const cls = `hm-rt hm-rt-${sid(p)} ${colClass(p.color, 'c')} hm-s-${p.style}`;
        out = rowTd(cx, p, `<div class="${cls}" style="${textStyle(cx, p.style, c, p.align).replace('margin:0;', '')}">${cx.mode === 'hubl' && isEditable(p) ? '\n  ' : ''}${val(cx, p, sc)}${cx.mode === 'hubl' && isEditable(p) ? '\n' : ''}</div>`, gap, p.align);
        break;
      }
      case 'image': out = renderImage(cx, p, sc, gap); break;
      case 'button': out = renderButton(cx, p, sc, gap); break;
      case 'divider': {
        const c = col(cx, p.color);
        const t = Math.max(1, p.thickness | 0);
        out = rowTd(cx, p, `<table role="presentation" width="${p.length}%" align="${p.align === 'right' ? 'right' : p.align === 'center' ? 'center' : 'left'}" cellpadding="0" cellspacing="0" border="0" style="width:${p.length}%;">\n  <tr><td class="${colClass(p.color, 'bg')}" height="${t}" bgcolor="${c}" style="height:${t}px;background-color:${c};font-size:1px;line-height:${t}px;mso-line-height-rule:exactly;">&nbsp;</td></tr>\n</table>`, gap, p.align);
        break;
      }
      case 'spacer': {
        const h = Math.max(1, p.height | 0);
        if (p.phoneHeight) cx.used.spacers.push(p);
        out = `<tr>\n  <td${tdAttr(cx, p)}${p.phoneHeight ? ` class="hm-sp-${sid(p)}"` : ''} height="${h}" style="height:${h}px;font-size:1px;line-height:${h}px;mso-line-height-rule:exactly;">&nbsp;</td>\n</tr>`;
        break;
      }
      case 'columns': out = renderColumns(cx, p, sc, gap); break;
      case 'repeat': out = renderRepeat(cx, p, gap); break;
    }
    return wrapIf(cx, s.hubl, out);
  }

  function renderImage(cx, p, sc, gap) {
    const W = cx.widths[p.id] || contentWidth(cx.d, cx.sys);
    const w = Math.max(1, Math.min(p.width | 0, W));
    if (p.phoneFull) cx.used.phoneFull = true;
    const margin = p.align === 'center' ? 'margin:0 auto;' : p.align === 'right' ? 'margin:0 0 0 auto;' : '';
    const radius = p.radius ? `border-radius:${p.radius | 0}px;` : '';
    const src = val(cx, p, sc, 'src');
    const alt = val(cx, p, sc, 'alt');
    const cls = `hm-img${p.phoneFull ? ' hm-phone-full' : ''}`;
    let img;
    if (cx.mode === 'preview' && !src) {
      const h = Math.round(w * 0.5625);
      img = `<span class="hm-ph ${cls}" style="width:${w}px;max-width:100%;height:${h}px;line-height:${h}px;${margin}${radius}">Image · ${w}px wide</span>`;
    } else {
      // width:100% up to max-width: shrinks to a phone with no media query. The attribute is what Outlook reads.
      img = `<img class="${cls}" src="${src}" alt="${alt}" width="${w}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;outline:none;text-decoration:none;${margin}${radius}">`;
    }
    return rowTd(cx, p, linkAround(cx, p, sc, img, 'text-decoration:none;'), gap, p.align);
  }

  function renderButton(cx, p, sc, gap) {
    const fill = btnProp(cx, p, 'fill'), ink = btnProp(cx, p, 'ink'), border = btnProp(cx, p, 'border');
    const bw = btnProp(cx, p, 'borderWidth'), radius = btnProp(cx, p, 'radius'), size = btnProp(cx, p, 'size');
    const padY = btnProp(cx, p, 'padY'), padX = btnProp(cx, p, 'padX');
    const padding = `${padY}px ${padX}px`;
    const variantClass = p.themed ? 'hm-btn-themed' : `hm-btn-${p.variant}`;
    if (p.phoneFull) cx.used.btnFull = true;
    const full = p.full;
    const table = `<table role="presentation" class="hm-btn-t${p.phoneFull ? ' hm-btn-phone-full' : ''}" ${full ? 'width="100%" ' : ''}align="${full ? 'left' : p.align}" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate !important;${full ? 'width:100%;' : ''}">
  <tr>
    <td class="hm-btn ${variantClass}" align="center" valign="middle" bgcolor="${fill}" style="border-radius:${radius}px;background-color:${fill};border:${bw}px solid ${border};mso-padding-alt:${padding};">
      <a class="hm-btn-a" href="${val(cx, p, sc, 'href')}" target="_blank" style="display:block;padding:${padding};font-family:${cx.font};font-size:${size}px;line-height:120%;color:${ink};text-decoration:none;text-align:center;mso-line-height-rule:exactly;">${val(cx, p, sc, 'value')}</a>
    </td>
  </tr>
</table>`;
    return rowTd(cx, p, `${hrefSet(cx, p, sc)}${hrefSet(cx, p, sc) ? '\n' : ''}${table}`, gap, full ? 'left' : p.align);
  }

  // -----------------------------------------------------------------------------------------------------------
  // Columns that stack on a phone with no media query. A module cannot put a stylesheet in the email's head, and
  // Gmail strips the <style> blocks that sit in the body, so a media query never reaches the client Jared checks
  // first. Each box is an inline-block with the "Fab Four" width: width:calc((breakpoint - 100%) * 1000). Wider
  // than the breakpoint, the calc goes negative and min-width (the desktop share) wins; narrower, it is huge and
  // max-width:100% wins, so every box takes the full width and the boxes stack. A client with no calc keeps the
  // plain percentage before it and stays side by side. Outlook's Word engine has neither inline-block nor calc,
  // so it gets the same boxes as a table, inside MSO conditional comments ("ghost table").
  // -----------------------------------------------------------------------------------------------------------

  const pctOf = (x, W) => Math.floor((x / W) * 10000) / 100;
  const breakpoint = W => Math.round(W * 0.8);
  function fluidBox(cls, w, W, valign, inner) {
    const pct = pctOf(w, W);
    return `<div class="${cls}" style="display:inline-block;vertical-align:${valign};width:${pct}%;min-width:${pct}%;max-width:100%;width:calc((${breakpoint(W)}px - 100%) * 1000);">\n${ind(inner, 2)}\n</div>`;
  }
  /** A gutter on a desktop, the space between two stacked boxes on a phone. Outlook gets a table cell instead. */
  function fluidGap(g, W) {
    const pct = pctOf(g, W);
    return `<!--[if !mso]><!--><div class="hm-fgap" style="display:inline-block;vertical-align:top;width:${pct}%;min-width:${pct}%;max-width:100%;width:calc((${breakpoint(W)}px - 100%) * 1000);height:${g}px;font-size:1px;line-height:1px;">&nbsp;</div><!--<![endif]-->`;
  }
  const msoGap = g => `<td width="${g}" style="width:${g}px;font-size:1px;line-height:1px;">&nbsp;</td>`;
  /** The row that holds a set of fluid boxes: font-size 0 so the whitespace between inline-blocks takes no room. */
  function fluidRow(cx, p, inner, gap) {
    return `<tr>\n  <td${tdAttr(cx, p)} class="hm-fluid" style="padding:0 0 ${gap}px 0;font-size:0;line-height:0;text-align:left;">\n${ind(inner, 4)}\n  </td>\n</tr>`;
  }

  function renderColumns(cx, p, sc, gap) {
    const W = cx.widths[p.id] || contentWidth(cx.d, cx.sys);
    const ws = columnWidths(p, W), g = p.gap | 0, va = p.valign;
    if (p.stack) {
      cx.used.fluid = true;
      const parts = [`<!--[if mso]><table role="presentation" width="${W}" cellpadding="0" cellspacing="0" border="0" style="width:${W}px;"><tr><td width="${ws[0]}" valign="${va}" style="width:${ws[0]}px;"><![endif]-->`];
      p.cols.forEach((c, i) => {
        if (i > 0) parts.push(`<!--[if mso]></td>${g ? msoGap(g) : ''}<td width="${ws[i]}" valign="${va}" style="width:${ws[i]}px;"><![endif]-->`, ...(g ? [fluidGap(g, W)] : []));
        parts.push(fluidBox(`hm-fcol hm-fcol-${sid(p)}`, ws[i], W, va, renderStack(cx, c.parts, sc, ws[i])));
      });
      parts.push('<!--[if mso]></td></tr></table><![endif]-->');
      return fluidRow(cx, p, parts.join('\n'), gap);
    }
    const cells = [];
    p.cols.forEach((c, i) => {
      if (i > 0 && g) cells.push(msoGap(g));
      cells.push(`<td width="${ws[i]}" valign="${va}" style="width:${ws[i]}px;vertical-align:${va};">\n${ind(renderStack(cx, c.parts, sc, ws[i]), 2)}\n</td>`);
    });
    const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">\n  <tr>\n${ind(cells.join('\n'), 4)}\n  </tr>\n</table>`;
    return rowTd(cx, p, table, gap, '');
  }

  /** The item list for a preview: the defaults, or the minimum when "empty" is on. */
  function previewItems(cx, p) {
    if (cx.empty) return p.items.slice(0, Math.max(0, p.min | 0)).map(() => ({ __empty: true }));
    return p.items;
  }

  function renderRepeat(cx, p, gap) {
    const W = cx.widths[p.id] || contentWidth(cx.d, cx.sys);
    const id6 = sid(p);
    const list = `module.${p.name}`;
    const scFor = item => ({ item: item || {}, rep: p });
    // In preview, an item flagged __empty behaves as "every optional field blank".
    const stackFor = item => {
      if (cx.mode === 'preview' && item && item.__empty) { const was = cx.empty; cx.empty = true; const s = renderStack(cx, p.parts, scFor({}), 0); cx.empty = was; return s; }
      const was = cx.empty; if (cx.mode === 'preview') cx.empty = false; const s = renderStack(cx, p.parts, scFor(item), 0); cx.empty = was; return s;
    };
    let body;
    if (p.layout === 'grid') {
      const n = Math.max(2, Math.min(3, p.perRow | 0)), g = p.gap | 0, c = cellWidth(p, W);
      const span = 2 * n - 1;
      const msoRowGap = `</tr><tr><td colspan="${span}" height="${g}" style="height:${g}px;font-size:1px;line-height:1px;">&nbsp;</td></tr><tr>`;
      if (p.stack) {
        // Fluid: cells wrap by width, and on a phone each takes the full width. A row break is a full-width spacer.
        cx.used.fluid = true;
        const rowGap = `<!--[if !mso]><!--><div class="hm-frow" style="display:block;width:100%;height:${g}px;font-size:1px;line-height:1px;">&nbsp;</div><!--<![endif]-->`;
        const cell = inner => `<!--[if mso]><td width="${c}" valign="top" style="width:${c}px;"><![endif]-->\n${fluidBox(`hm-fcell hm-fcell-${id6}`, c, W, 'top', inner)}\n<!--[if mso]></td><![endif]-->`;
        const between = (rowEnd) => (rowEnd ? `<!--[if mso]>${msoRowGap}<![endif]-->\n${rowGap}` : `${g ? `<!--[if mso]>${msoGap(g)}<![endif]-->\n${fluidGap(g, W)}` : ''}`);
        const open = `<!--[if mso]><table role="presentation" width="${W}" cellpadding="0" cellspacing="0" border="0" style="width:${W}px;"><tr><![endif]-->`;
        const close = '<!--[if mso]></tr></table><![endif]-->';
        if (cx.mode === 'hubl') {
          body = `${open}
{% for item in ${list} %}
${cell(stackFor(null))}
{% if not loop.last %}{% if loop.index % ${n} == 0 %}
${between(true)}
{% else %}
${between(false)}
{% endif %}{% endif %}
{% endfor %}
${close}`;
        } else {
          const items = previewItems(cx, p);
          if (!items.length) return '';
          const out = [open];
          items.forEach((it, i) => { out.push(cell(stackFor(it))); if (i < items.length - 1) out.push(between((i + 1) % n === 0)); });
          out.push(close);
          body = out.join('\n');
        }
        return groupRow(cx, p, list, body, gap, true);
      }
      // Fixed: a table that keeps its columns on a phone. Gaps are cells; a short last row is filled out.
      const td = inner => `<td width="${c}" valign="top" style="width:${c}px;vertical-align:top;">\n${ind(inner, 2)}\n</td>`;
      const filler = `<td width="${c}" style="width:${c}px;font-size:1px;line-height:1px;">&nbsp;</td>`;
      if (cx.mode === 'hubl') {
        body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
  <tr>
  {% for item in ${list} %}
${ind(td(stackFor(null)), 4)}
    {% if not loop.last %}{% if loop.index % ${n} == 0 %}${msoRowGap}{% else %}${g ? msoGap(g) : ''}{% endif %}{% endif %}
  {% endfor %}
  {% set hm_rem = ${list}|length % ${n} %}
  {% if hm_rem %}{% for i in range(hm_rem, ${n}) %}${g ? msoGap(g) : ''}${filler}{% endfor %}{% endif %}
  </tr>
</table>`;
      } else {
        const items = previewItems(cx, p);
        if (!items.length) return '';
        const cells = [];
        items.forEach((it, i) => {
          cells.push(td(stackFor(it)));
          if (i < items.length - 1) cells.push((i + 1) % n === 0 ? msoRowGap : (g ? msoGap(g) : ''));
        });
        const rem = items.length % n;
        if (rem) for (let i = rem; i < n; i++) cells.push(`${g ? msoGap(g) : ''}${filler}`);
        body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">\n  <tr>\n${ind(cells.filter(Boolean).join('\n'), 4)}\n  </tr>\n</table>`;
      }
    } else {
      const g = p.gap | 0;
      const rule = p.rule ? col(cx, 'accent') : null;
      const cell = (inner, last, hubl) => {
        const padBottom = hubl ? `{% if not loop.last %}${g}{% else %}0{% endif %}` : (last ? 0 : g);
        const border = rule ? (hubl ? `{% if not loop.last %}border-bottom:1px solid ${rule};{% endif %}` : (last ? '' : `border-bottom:1px solid ${rule};`)) : '';
        const padTop = hubl ? `{% if not loop.first %}${rule ? g : 0}{% else %}0{% endif %}` : null;
        return `<tr>\n  <td class="${rule ? colClass('accent', 'bd') : ''}" style="padding:${hubl ? padTop : '__TOP__'}px 0 ${padBottom}px 0;${border}">\n${ind(inner, 4)}\n  </td>\n</tr>`;
      };
      if (cx.mode === 'hubl') {
        body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
  {% for item in ${list} %}
${ind(cell(stackFor(null), false, true), 2)}
  {% endfor %}
</table>`;
      } else {
        const items = previewItems(cx, p);
        if (!items.length) return '';
        const rows = items.map((it, i) => cell(stackFor(it), i === items.length - 1, false).replace('__TOP__', i > 0 && rule ? g : 0));
        body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">\n${ind(rows.join('\n'), 2)}\n</table>`;
      }
    }
    return groupRow(cx, p, list, body, gap, false);
  }
  function groupRow(cx, p, list, body, gap, fluid) {
    const row = wrapGroup(cx, p, body, gap, fluid);
    return cx.mode === 'hubl' ? wrapIf(cx, `${list}|length`, row) : row;
  }
  function wrapGroup(cx, p, body, gap, fluid) {
    return fluid ? fluidRow(cx, p, body, gap) : `<tr>\n  <td${tdAttr(cx, p)} style="padding:0 0 ${gap}px 0;">\n${ind(body, 4)}\n  </td>\n</tr>`;
  }

  /** The module's markup alone, for the preview. The styles come from build(), which the page already holds. */
  function render(d, sys, opts) {
    const cx = makeCx(d, sys, opts || {});
    return renderWith(cx).html;
  }
  function renderWith(cx) {
    const { d, sys } = cx;
    const pt = space(sys, d.pad.top), pb = space(sys, d.pad.bottom), ps = space(sys, d.pad.side);
    const bg = col(cx, 'bg');
    const themeClass = cx.mode === 'hubl' && cx.choice ? `hm-t-{{ hm_theme }}` : `hm-t-${cx.theme}`;
    const inner = renderStack(cx, d.parts, { item: null }, contentWidth(d, sys));
    const html = `<table role="presentation" class="${cx.root} ${themeClass} hm-rbg-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="width:100%;background-color:${bg};">
  <tr>
    <td class="hm-pad" style="padding:${pt}px ${ps}px ${pb}px ${ps}px;">
${ind(inner, 6)}
    </td>
  </tr>
</table>`;
    return { html, cx };
  }

  /** The top of module.html: who made it, and the theme variables. */
  function header(cx) {
    const { d, sys } = cx;
    const lines = [`{# ${d.name.replace(/#}/g, '# }')} · made in HUB-MOD (Scugnizzi tools). Change the design there and export again;`, `   edits made here are lost the next time it is uploaded. #}`];
    if (cx.choice) {
      const first = d.themes[0];
      const set = t => {
        const pl = palette(sys, t);
        const out = [`{% set c_bg = ${hublStr(pl.bg)} %}{% set c_text = ${hublStr(pl.text)} %}{% set c_accent = ${hublStr(pl.accent)} %}`];
        if (cx.used.buttonsThemed) {
          const b = pl.button;
          out.push(`{% set b_fill = ${hublStr(b.fill)} %}{% set b_ink = ${hublStr(b.ink)} %}{% set b_border = ${hublStr(b.border)} %}{% set b_borderWidth = ${b.borderWidth} %}{% set b_radius = ${b.radius} %}{% set b_size = ${b.size} %}{% set b_padY = ${b.padY} %}{% set b_padX = ${b.padX} %}`);
        }
        return out.join('\n');
      };
      lines.push(`{% set hm_theme = module.theme_choice or ${hublStr(first)} %}`);
      lines.push(set(first));
      for (const t of d.themes.slice(1)) lines.push(`{% if hm_theme == ${hublStr(t)} %}\n${ind(set(t), 2)}\n{% endif %}`);
    }
    return lines.join('\n');
  }

  // -----------------------------------------------------------------------------------------------------------
  // Styles. An email module has no module.css: HubSpot refuses CSS and JavaScript on email modules, and its own
  // CLI deletes both files when a module is made for email. So everything that matters is inline, and the rest
  // rides in module.html in two <style> blocks, both scoped to the module's own class:
  //
  //   inline  <style data-hse-inline-css="true">: the rich text scale. It is the only way to style markup the
  //           team writes, and HubSpot inlines this block at send and drops it (a community report, unverified
  //           here). Plain selectors only; an inliner cannot place a media query or a pseudo-class.
  //   sheet   <style>: phone sizes and the dark layers. Apple Mail, iOS Mail and Outlook.com read it. Gmail strips
  //           a <style> in the body, which is why nothing structural depends on it: columns stack without it.
  //
  // HubSpot's editor flags style tags in the body with a warning. The email still saves and sends.
  // -----------------------------------------------------------------------------------------------------------

  function buildStyles(d, sys, cx) {
    const R = `.${cx.root}`;
    const inline = [], sheet = [];
    // Rich text, on the scale that worked (learnings 2.13). !important on margins and leading because HubSpot's
    // own inline styles arrive on every paragraph the team writes (learnings 1.9, 1.14, 3.5).
    const rt = sys.richText, body = sys.text.body;
    for (const p of cx.used.rich) {
      const sel = `${R} .hm-rt-${sid(p)}`;
      const t = sys.text[p.style] || body;
      inline.push(`${sel} p { margin:0 0 ${t.marginBottom}px 0 !important; line-height:${t.lineHeight}% !important; }`);
      for (const h of ['h1', 'h2', 'h3', 'h4']) { const s = sys.text[h]; inline.push(`${sel} ${h} { margin:0 0 ${s.marginBottom}px 0 !important; font-size:${s.size}px !important; line-height:${s.lineHeight}% !important; font-weight:${s.weight}; }`); }
      inline.push(`${sel} ul, ${sel} ol { margin:0 0 ${t.marginBottom}px ${rt.listIndent}px !important; padding:0 !important; line-height:${rt.listLineHeight}% !important; }`);
      inline.push(`${sel} li { margin:0 0 ${rt.listGap}px 0 !important; }`);
      inline.push(`${sel} blockquote { margin:0 0 ${t.marginBottom}px 0 !important; padding:4px 0 4px ${rt.quoteInset}px; border-left:${rt.quoteBar}px solid ${sys.hex(rt.quoteColor)}; ${rt.quoteItalic ? 'font-style:italic; ' : ''}}`);
      inline.push(`${sel} hr { border:0; border-top:${rt.ruleWidth}px solid ${sys.hex(rt.ruleColor)}; margin:0 0 ${t.marginBottom}px 0; }`);
      // Link colour: per theme when it follows the theme, so a navy module's links stay legible.
      if (p.linkColor === 'text' || p.linkColor === 'accent') for (const th of d.themes) inline.push(`${R}.hm-t-${th} .hm-rt-${sid(p)} a { color:${palette(sys, th)[p.linkColor]} !important; text-decoration:underline; }`);
      else inline.push(`${sel} a { color:${sys.hex(p.linkColor)} !important; text-decoration:underline; }`);
      sheet.push(`${sel} > :last-child { margin-bottom:0 !important; }`);
    }
    sheet.push(`${R} a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; font-size:inherit !important; font-family:inherit !important; font-weight:inherit !important; line-height:inherit !important; }`);

    // Phones (learnings 2.3): sizes only. Stacking does not wait for this block.
    const m = [];
    for (const s of cx.used.styles) { const t = sys.text[s]; if (t && t.mobileSize && t.mobileSize !== t.size) m.push(`${R} .hm-s-${s} { font-size:${t.mobileSize}px !important; }`); }
    if (cx.used.phoneFull) m.push(`${R} .hm-phone-full { width:100% !important; max-width:100% !important; height:auto !important; }`);
    if (cx.used.btnFull) m.push(`${R} .hm-btn-phone-full { width:100% !important; }`);
    for (const p of cx.used.spacers) m.push(`${R} .hm-sp-${sid(p)} { height:${p.phoneHeight | 0}px !important; line-height:${p.phoneHeight | 0}px !important; }`);
    if (m.length) sheet.push(`@media only screen and (max-width:${sys.mobileBreakpoint}px) {`, ...m.map(x => `  ${x}`), '}');

    // Dark mode, layers 2 and 3 (learnings 2.5, 2.6): re-assert every colour the module uses, so a client that
    // restyles for dark leaves the brand alone. Layer 1, the color-scheme meta, belongs to the email's head, which
    // in a drag-and-drop email is HubSpot's.
    const dark = [], ogsc = [], ogsb = [];
    for (const th of d.themes) {
      const pl = palette(sys, th);
      const T = `${R}.hm-t-${th}`;
      dark.push(`${T}, ${T} .hm-rbg-bg { background-color:${pl.bg} !important; }`);
      ogsb.push(`[data-ogsb] ${T} { background-color:${pl.bg} !important; }`);
      for (const role of ['text', 'accent']) {
        if (!cx.used.roles.has(role)) continue;
        dark.push(`${T} .hm-rc-${role} { color:${pl[role]} !important; }`, `${T} .hm-rbg-${role} { background-color:${pl[role]} !important; }`, `${T} .hm-rbd-${role} { border-color:${pl[role]} !important; }`);
        ogsc.push(`[data-ogsc] ${T} .hm-rc-${role} { color:${pl[role]} !important; }`);
        ogsb.push(`[data-ogsb] ${T} .hm-rbg-${role} { background-color:${pl[role]} !important; }`);
      }
      if (cx.used.buttonsThemed) {
        const b = pl.button;
        dark.push(`${T} .hm-btn-themed { background-color:${b.fill} !important; border-color:${b.border} !important; }`, `${T} .hm-btn-themed .hm-btn-a { color:${b.ink} !important; }`);
        ogsb.push(`[data-ogsb] ${T} .hm-btn-themed { background-color:${b.fill} !important; }`);
        ogsc.push(`[data-ogsc] ${T} .hm-btn-themed .hm-btn-a { color:${b.ink} !important; }`);
      }
    }
    for (const tok of cx.used.tokens) {
      const hx = sys.hex(tok);
      dark.push(`${R} .hm-c-${tok} { color:${hx} !important; }`, `${R} .hm-bg-${tok} { background-color:${hx} !important; }`);
      ogsc.push(`[data-ogsc] ${R} .hm-c-${tok} { color:${hx} !important; }`);
      ogsb.push(`[data-ogsb] ${R} .hm-bg-${tok} { background-color:${hx} !important; }`);
    }
    for (const v of cx.used.buttonVariants) {
      const b = sys.buttons[v]; if (!b) continue;
      dark.push(`${R} .hm-btn-${v} { background-color:${b.fill} !important; border-color:${b.border} !important; }`, `${R} .hm-btn-${v} .hm-btn-a { color:${b.ink} !important; }`);
      ogsb.push(`[data-ogsb] ${R} .hm-btn-${v} { background-color:${b.fill} !important; }`);
      ogsc.push(`[data-ogsc] ${R} .hm-btn-${v} .hm-btn-a { color:${b.ink} !important; }`);
    }
    sheet.push('@media (prefers-color-scheme: dark) {', ...dark.map(x => `  ${x}`), '}', ...ogsc, ...ogsb);
    return { inline: inline.join('\n'), sheet: sheet.join('\n') };
  }

  /** The body of the dark media block, for the preview's dark override. */
  function darkRules(css) {
    const MEDIA = '@media (prefers-color-scheme: dark)';
    const start = css.indexOf(MEDIA); if (start < 0) return '';
    const open = css.indexOf('{', start + MEDIA.length); if (open < 0) return '';
    let depth = 0;
    for (let i = open; i < css.length; i++) { if (css[i] === '{') depth++; else if (css[i] === '}') { depth--; if (depth === 0) return css.slice(open + 1, i).trim(); } }
    return '';
  }

  // -----------------------------------------------------------------------------------------------------------
  // fields.json and meta.json
  // -----------------------------------------------------------------------------------------------------------

  // What a link field lets the team pick. An email address comes back bare, so module.html adds mailto: itself.
  const LINK_TYPES = ['EXTERNAL', 'CONTENT', 'FILE', 'EMAIL_ADDRESS'];
  function linkDefault(href) {
    const mail = /^mailto:/i.test(href || '');
    return { url: { content_id: null, type: mail ? 'EMAIL_ADDRESS' : 'EXTERNAL', href: mail ? href.replace(/^mailto:/i, '') : (href || '') }, open_in_new_tab: false, no_follow: false };
  }
  // The width goes in for the editor's sake; module.html never reads it back (learnings 1.6a).
  function imageDefault(v, w) { return { src: v.src || '', alt: v.alt || '', width: w, height: null, size_type: 'auto', loading: 'disabled' }; }

  function base(p, name, label, type, help) {
    const f = { name, label, type, required: !!p.required, locked: false };
    if (help) f.help_text = help;
    return f;
  }
  /** The field objects for one part, given the value its default should hold. */
  function partFields(d, sys, p, v, widths) {
    const out = [];
    const help = p.help || '';
    switch (p.type) {
      case 'eyebrow': case 'heading': case 'text':
        out.push(Object.assign(base(p, p.name, p.label, 'text', help), { validation_regex: '', allow_new_line: false, show_emoji_picker: false, default: words(v) }));
        if (hasLink(p)) out.push(Object.assign(base({ required: false }, `${p.name}_link`, `${p.label} link`, 'link', 'Where the words go when clicked. Leave empty for plain words.'), { supported_types: LINK_TYPES, show_advanced_rel_options: false, default: linkDefault(v.href) }));
        break;
      case 'richtext':
        out.push(Object.assign(base(p, p.name, p.label, 'richtext', help), { default: cleanRich(v) })); break;
      case 'image': {
        const w = Math.min(p.width | 0, widths[p.id] || contentWidth(d, sys));
        out.push(Object.assign(base(p, p.name, p.label, 'image', help), { inline_help_text: `Shown ${w}px wide.`, responsive: false, resizable: false, show_loading: false, default: imageDefault(v, w) }));
        if (p.link) out.push(Object.assign(base({ required: false }, `${p.name}_link`, `${p.label} link`, 'link', 'Where the picture goes when it is clicked. Leave empty for no link.'), { supported_types: LINK_TYPES, show_advanced_rel_options: false, default: linkDefault(v.href) }));
        break;
      }
      case 'button':
        out.push(Object.assign(base(p, p.name, `${p.label} text`, 'text', help), { validation_regex: '', allow_new_line: false, show_emoji_picker: false, default: v.value }));
        out.push(Object.assign(base({ required: !!p.required }, `${p.name}_link`, `${p.label} link`, 'link', ''), { supported_types: LINK_TYPES, show_advanced_rel_options: false, default: linkDefault(v.href) }));
        break;
    }
    return out;
  }
  function buildFields(d, sys) {
    const widths = slotWidths(d, sys);
    const fields = [];
    if (d.themes.length > 1) {
      fields.push({ name: 'theme_choice', label: 'Theme', type: 'choice', required: true, locked: false, display: 'select', multiple: false, reordering_enabled: false,
        help_text: 'The Switchyards colours this block wears.', choices: d.themes.map(t => [t, sys.themes[t].label]), default: d.themes[0] });
    }
    const visit = (parts) => {
      for (const p of parts) {
        if (p.type === 'columns') { for (const c of p.cols) visit(c.parts); continue; }
        if (p.type === 'repeat') { fields.push(groupField(d, sys, p, widths)); continue; }
        if (!isEditable(p)) continue;
        if (p.toggle) fields.push({ name: `show_${p.name}`, label: `Show ${p.label.toLowerCase()}`, type: 'boolean', required: false, locked: false, display: 'toggle', default: true });
        fields.push(...partFields(d, sys, p, partDefault(p), widths));
      }
    };
    visit(d.parts);
    return fields;
  }
  function groupField(d, sys, p, widths) {
    const kids = []; walk(p.parts, q => { if (isEditable(q)) kids.push(q); });
    const children = kids.flatMap(k => partFields(d, sys, Object.assign({}, k, { toggle: false }), partDefault(k), widths));
    const sortKid = kids.find(k => k.id === p.sortField) || kids.find(k => ['heading', 'text', 'eyebrow'].includes(k.type));
    const def = p.items.map(it => {
      const o = {};
      for (const k of kids) {
        const v = itemValue(p, it, k);
        for (const f of partFields(d, sys, Object.assign({}, k, { toggle: false }), v, widths)) o[f.name] = f.default;
      }
      return o;
    });
    const g = { name: p.name, label: p.label, type: 'group', required: false, locked: false, expanded: false,
      occurrence: { min: p.min | 0, max: p.max | 0, default: p.items.length }, children, default: def };
    if (sortKid) g.occurrence.sorting_label_field = `${p.name}.${sortKid.name}`;
    return g;
  }

  function buildMeta(d) {
    // The key set `hs cms module create` writes for an email module. content_types replaced host_template_types in
    // January 2024; no icon, because a standalone module has no file to point it at.
    return {
      label: d.name,
      css_assets: [], external_js: [], global: false,
      help_text: d.description || '',
      content_types: ['EMAIL'],
      js_assets: [], other_assets: [], smart_type: 'NOT_SMART', tags: [],
      is_available_for_new_content: true,
    };
  }

  // -----------------------------------------------------------------------------------------------------------
  // build(): the whole folder, plus the checklist for building it by hand.
  // -----------------------------------------------------------------------------------------------------------

  const UI_TYPE = { text: 'Text', richtext: 'Rich text', image: 'Image', link: 'Link', boolean: 'Boolean', choice: 'Choice', group: 'Group (repeater)' };

  /** The whole folder: module.html, fields.json, meta.json. No module.css and no module.js: see buildStyles. */
  function build(d, sys) {
    const cx = makeCx(d, sys, { mode: 'hubl' });
    const { html: markup } = renderWith(cx);
    const styles = buildStyles(d, sys, cx);
    const use = Object.assign({ rich: true, sheet: true }, d.css || {});
    const blocks = [];
    if (use.rich && styles.inline) blocks.push(`<style data-hse-inline-css="true">\n${styles.inline}\n</style>`);
    if (use.sheet && styles.sheet) blocks.push(`<style>\n${styles.sheet}\n</style>`);
    const html = `${header(cx)}\n${blocks.join('\n')}${blocks.length ? '\n' : ''}${markup}\n`;
    const fields = buildFields(d, sys);
    const meta = buildMeta(d);
    const files = [
      { path: 'module.html', text: html, note: 'Markup, HubL and the two style blocks' },
      { path: 'fields.json', text: `${JSON.stringify(fields, null, 2)}\n`, note: 'What the team edits' },
      { path: 'meta.json', text: `${JSON.stringify(meta, null, 2)}\n`, note: 'Its name, and where it may be used: email' },
    ];
    // The preview applies the same two blocks: the inline one as HubSpot's inliner would, the sheet as a client that
    // keeps <style> would. Turned off in the design, they are off in the preview too.
    return { files, fields, meta, html, markup, styles: { inline: use.rich ? styles.inline : '', sheet: use.sheet ? styles.sheet : '' }, steps: steps(d, sys, fields) };
  }

  function fieldSettings(f) {
    const s = [];
    if (f.required) s.push('Required');
    if (f.type === 'text' || f.type === 'richtext') s.push(f.default ? `Default: “${excerpt(f.default, 48)}”` : 'Default: empty');
    if (f.type === 'image') s.push(f.default.src ? `Default: ${excerpt(f.default.src, 40)}` : 'Default: no image', f.help_text ? f.help_text : '');
    if (f.type === 'link') s.push(f.default.url.href ? `Default: ${f.default.url.href}` : 'Default: empty');
    if (f.type === 'boolean') s.push('Display: toggle', 'Default: on');
    if (f.type === 'choice') s.push(`Options: ${f.choices.map(c => `${c[1]} (${c[0]})`).join(', ')}`, `Default: ${f.default}`);
    if (f.type === 'group') s.push(`Repeater: on`, `Min ${f.occurrence.min}, max ${f.occurrence.max}, starts with ${f.occurrence.default}`);
    if (f.help_text && f.type !== 'image') s.push(`Help: ${f.help_text}`);
    return s.filter(Boolean);
  }
  function steps(d, sys, fields) {
    const flat = [];
    for (const f of fields) {
      flat.push({ path: f.name, label: f.label, name: f.name, uiType: UI_TYPE[f.type] || f.type, settings: fieldSettings(f), child: false });
      if (f.type === 'group') for (const c of f.children) flat.push({ path: `${f.name}.${c.name}`, label: c.label, name: c.name, uiType: UI_TYPE[c.type] || c.type, settings: fieldSettings(c), child: true });
    }
    const folder = `${d.slug}.module`;
    const dest = `Switchyards email modules/${folder}`;
    return {
      fields: flat,
      folder, dest,
      // CLI 8 moved every CMS command under `hs cms`; plain `hs upload` now only asks "Did you mean hs cms upload?".
      once: [
        { cmd: 'npm install -g @hubspot/cli@latest', note: 'Once per machine. Needs Node 20 or later.' },
        { cmd: 'hs account auth', note: 'Once. It asks for a personal access key: in HubSpot, Development › Keys › Personal access key. Your user needs the Design tools permission.' },
      ],
      cli: [
        { cmd: `cd ~/Downloads && unzip -o ${folder}.zip`, note: 'Wherever the zip landed. The CLI uploads a folder, not a zip.' },
        { cmd: `hs cms lint ${folder}`, note: 'Optional: HubSpot checks the HubL before anything goes up.' },
        { cmd: `hs cms upload ${folder} "${dest}"`, note: 'Goes live straight away. Add -m draft to upload it unpublished.' },
      ],
      cliNotes: [
        'Uploading again replaces the files in place. Fields whose names stayed the same keep what the team typed into them.',
        'Never add --clean to a module that emails already use: it deletes the folder first.',
        `On CLI 7 the command is still hs upload ${folder} "${dest}".`,
      ],
      manual: [
        'Needs Marketing Hub Professional or Enterprise. Without it, Emails is not offered.',
        'In HubSpot: <b>Content › Design Manager</b>. <b>File › New file</b>, choose <b>Module</b>, <b>Next</b>.',
        `Under <i>Where would you like to use this module</i>, tick <b>Emails</b> and nothing else. Keep it a <b>Local module</b>. Name it <code>${escHtml(d.slug)}</code>, then <b>Create</b>.`,
        'The editor says CSS and JavaScript are unavailable for email modules. That is expected: everything is in module.html.',
      ],
      code: [
        'Open the <b>HTML + HubL</b> pane, select everything in it, and paste <a href="#" data-goto="module.html">module.html</a> over it.',
        'HubSpot may warn about style tags in the body. Expected: the email still saves and sends, and only Gmail ignores them.',
        `In the inspector, set the label to <b>${escHtml(d.name)}</b> so the team finds it by that name. <b>Publish changes</b>.`,
        'In a drag-and-drop email: the left sidebar\'s <b>+ Add</b> panel lists custom modules (older layouts: <b>More › Custom modules</b>). Search the name, drag it in, fill the fields.',
      ],
    };
  }

  // -----------------------------------------------------------------------------------------------------------
  // Checks. Anything that would make HubSpot refuse the upload, or hand the team a broken block, is an error and
  // blocks the download (learnings 3.36). Anything that would only look wrong is a warning.
  // -----------------------------------------------------------------------------------------------------------

  function luminance(hex) {
    const n = hex.replace('#', ''); const v = n.length === 3 ? n.split('').map(c => c + c).join('') : n.slice(0, 6);
    const [r, g, b] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }

  function check(d, sys, built) {
    const out = [];
    const err = (msg, partId) => out.push({ level: 'error', msg, partId: partId || null });
    const warn = (msg, partId) => out.push({ level: 'warning', msg, partId: partId || null });
    if (!String(d.name || '').trim()) err('The module needs a name: it is what the team picks it by.');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(d.slug || '')) err('The folder name can hold lower-case letters, digits and hyphens, and starts with a letter or digit.');
    if (!d.parts.length) err('The module is empty. Add a part.');

    // Names: valid, unique within their scope, not HubSpot's.
    const scopes = new Map();
    const note = (scopeKey, name, partId) => { if (!scopes.has(scopeKey)) scopes.set(scopeKey, new Map()); const m = scopes.get(scopeKey); if (m.has(name)) err(`Two fields are called “${name}”. Rename one; HubSpot keeps one value per name.`, partId); else m.set(name, partId); };
    if (d.themes.length > 1) note('', 'theme_choice', null);
    walk(d.parts, q => {
      if (!(isEditable(q) || q.type === 'repeat')) return;
      const scope = q.type === 'repeat' ? null : scopeOf(d, q);
      const key = scope ? scope.id : '';
      if (!/^[a-z][a-z0-9_]*$/.test(q.name || '')) err(`“${q.label || q.name}” has a HubL name HubSpot will not take: lower case, digits and underscores, starting with a letter.`, q.id);
      if (RESERVED.has(q.name)) err(`“${q.name}” is a name HubL already uses. Pick another.`, q.id);
      for (const n of namesOf(q, !!scope)) note(key, n, q.id);
      if (!String(q.label || '').trim()) warn('A field without a label shows the team its HubL name. Give it one.', q.id);
    });

    const widths = slotWidths(d, sys);
    walk(d.parts, (q, owner) => {
      if (q.type === 'repeat') {
        const kids = []; walk(q.parts, k => { if (isEditable(k)) kids.push(k); });
        if (!q.parts.length) err(`“${q.label}” has nothing in it.`, q.id);
        else if (!kids.length) err(`Nothing in “${q.label}” is editable, so every ${q.itemLabel || 'item'} would be identical.`, q.id);
        if (q.min > q.max) err(`“${q.label}”: the minimum is above the maximum.`, q.id);
        if (q.items.length < q.min || q.items.length > q.max) err(`“${q.label}” starts with ${q.items.length}; it has to be between ${q.min} and ${q.max}.`, q.id);
      }
      if (q.type === 'columns' && q.cols.some(c => !c.parts.length)) warn('A column is empty. It still takes its share of the width.', q.id);
      if (q.type === 'image') {
        const vals = [partDefault(q)];
        const rep = scopeOf(d, q); if (rep) for (const it of rep.items) vals.push(itemValue(rep, it, q));
        for (const v of vals) {
          if (v.src && !/^https:\/\//i.test(v.src)) err(`An image address has to be a hosted https:// link (HubSpot Files is the place), not ${excerpt(v.src, 30)}.`, q.id);
          if (v.src && !String(v.alt || '').trim()) warn('An image without alt text says nothing when pictures are off, which is how Outlook opens by default.', q.id);
          if (q.link && v.href && !/^(https?:\/\/|mailto:|tel:)/i.test(v.href)) err(`The image link “${excerpt(v.href, 30)}” is not a web, mail or phone link.`, q.id);
        }
        if ((q.width | 0) > (widths[q.id] || 0)) warn(`The image is set to ${q.width}px and its slot is ${widths[q.id]}px. It ships at ${widths[q.id]}px.`, q.id);
        if (!isEditable(q) && !q.src) err('A fixed image needs its picture: the team cannot add one.', q.id);
      }
      if (q.type === 'button' || (hasLink(q) && q.type !== 'image')) {
        const vals = [partDefault(q)]; const rep = scopeOf(d, q); if (rep) for (const it of rep.items) vals.push(itemValue(rep, it, q));
        const what = q.type === 'button' ? 'button' : 'text';
        for (const v of vals) if (v.href && !/^(https?:\/\/|mailto:|tel:)/i.test(v.href)) err(`The ${what} link “${excerpt(v.href, 30)}” is not a web, mail or phone link.`, q.id);
        if (!isEditable(q) && !partDefault(q).href) err(`A fixed ${what} link needs its address: the team cannot set one.`, q.id);
        if (q.type === 'button' && String(q.value || '').length > 28) warn('A button label over 28 characters wraps on phones and reads as broken.', q.id);
      }
      if (isEditable(q) && q.required && !String(q.type === 'image' ? q.src : q.value || '').trim() && q.type !== 'button') warn(`“${q.label}” is required and starts empty, so every new email opens with an error to fix.`, q.id);
      if (q.toggle && scopeOf(d, q)) warn('“Team can switch it off” does nothing inside a repeating group; the team removes the item instead.', q.id);
      // Contrast, for every theme the part can wear (WCAG: 4.5 for body, 3 for large or bold headings).
      if (['eyebrow', 'heading', 'text', 'richtext'].includes(q.type)) {
        for (const th of d.themes) {
          const pl = palette(sys, th);
          const fg = q.color === 'text' || q.color === 'accent' ? pl[q.color] : sys.hex(q.color);
          const t = sys.text[q.style] || sys.text.body;
          const large = t.size >= 24 || (t.weight === 'bold' && t.size >= 18.66);
          const need = large ? 3 : 4.5, c = contrast(fg, pl.bg);
          if (c < need) warn(`${title(q)} on the ${sys.themes[th].label} theme is ${c.toFixed(1)}:1; it needs ${need}:1 to read.`, q.id);
        }
      }
    });
    if (built) {
      const size = new TextEncoder().encode(built.html).length;
      if (size > 30000) warn(`module.html is ${Math.round(size / 1024)}KB. Gmail clips the whole email at about 102KB (learnings 2.12).`);
    }
    if (d.exported && Array.isArray(d.exported.names)) {
      const now = new Set(fieldNames(d));
      const gone = d.exported.names.filter(n => !now.has(n));
      if (gone.length) warn(`Renamed or removed since the last export: ${gone.join(', ')}. Emails already using this module lose what the team typed there.`);
    }
    return out;
  }

  // -----------------------------------------------------------------------------------------------------------
  // Starters: real Switchyards modules, so the tool is useful in the first minute (learnings 3.8).
  // -----------------------------------------------------------------------------------------------------------

  function P(type, props) { return Object.assign(makePart(type), props || {}); }
  function rep(props, parts, items) { const r = Object.assign(makePart('repeat'), props); r.parts = parts; r.items = items(parts); return r; }

  const STARTERS = [
    { id: 'intro', name: 'Section intro', blurb: 'Eyebrow, heading, a paragraph and a button', make: () => newDoc('Section intro', [
      P('eyebrow', { value: 'This month', label: 'Eyebrow', name: 'eyebrow' }),
      P('heading', { value: 'Work near home, with people you like', label: 'Heading', name: 'heading', style: 'h1', gap: 16, optional: false, required: true }),
      P('richtext', { value: '<p>Switchyards is a network of neighborhood work clubs. Fast wifi, good coffee, a quiet room when you need one, and neighbors when you do not.</p>', label: 'Body', name: 'body', gap: 20 }),
      P('button', { value: 'Book a tour', href: 'https://switchyards.com', label: 'Button', name: 'button' }),
    ], { description: 'Opens a section: eyebrow, heading, paragraph, button.' }) },
    { id: 'events', name: 'Event list', blurb: 'A list of events the team adds to, each with its own link', make: () => newDoc('Event list', [
      P('eyebrow', { value: 'At the clubs', label: 'Eyebrow', name: 'eyebrow' }),
      P('heading', { value: 'Coming up', label: 'Heading', name: 'heading', style: 'h2', gap: 20 }),
      rep({ label: 'Events', name: 'events', nameAuto: false, itemLabel: 'Event', min: 1, max: 8, layout: 'list', rule: true, gap: 16, gapBelow: 24 }, [
        (() => { const c = P('columns', { gap: 16, gapBelow: 0, stack: false }); c.cols = [
          { w: 25, parts: [P('text', { value: 'NOV 20', label: 'Date', name: 'date', style: 'h4', color: 'accent', optional: false, required: true, gap: 0 })] },
          { w: 75, parts: [
            P('heading', { value: 'Members’ supper club', label: 'Event name', name: 'title', style: 'h3', gap: 4, optional: false, required: true, link: true, href: 'https://switchyards.com/events' }),
            P('text', { value: '6:30 pm · Midtown club', label: 'Time and place', name: 'where', style: 'small', gap: 0 }),
          ] },
        ]; return c; })(),
      ], parts => { const cols = parts[0].cols; const [date] = cols[0].parts; const [name, where] = cols[1].parts;
        return [
          { [date.id]: 'NOV 20', [name.id]: { value: 'Members’ supper club', href: 'https://switchyards.com/events' }, [where.id]: '6:30 pm · Midtown club' },
          { [date.id]: 'DEC 04', [name.id]: { value: 'Portfolio review night', href: 'https://switchyards.com/events' }, [where.id]: '6 pm · Inman Park club' },
          { [date.id]: 'DEC 11', [name.id]: { value: 'Holiday open house', href: 'https://switchyards.com/events' }, [where.id]: 'All day · every club' },
        ]; }),
      P('button', { value: 'See every event', href: 'https://switchyards.com/events', label: 'Button', name: 'button' }),
    ], { description: 'Events listed one under another; the team adds and removes them.' }) },
    { id: 'spotlight', name: 'Club spotlight', blurb: 'A picture beside a short story; stacks on phones', make: () => { const c = P('columns', { gap: 24, valign: 'middle', gapBelow: 0 }); c.cols = [
        { w: 40, parts: [P('image', { width: 214, alt: 'Inside the club', label: 'Photo', name: 'photo', phoneFull: true, gap: 0, optional: false })] },
        { w: 60, parts: [
          P('eyebrow', { value: 'Club spotlight', label: 'Eyebrow', name: 'eyebrow' }),
          P('heading', { value: 'Inman Park', label: 'Club name', name: 'club', style: 'h2', gap: 8 }),
          P('richtext', { value: '<p>Brick, big windows and a back porch. Forty desks, two phone rooms, and the best light in town after four.</p>', label: 'Story', name: 'story', gap: 16 }),
          P('button', { value: 'Visit Inman Park', href: 'https://switchyards.com', label: 'Button', name: 'button' }),
        ] },
      ]; return newDoc('Club spotlight', [c], { description: 'Picture left, words right. Stacks on phones.', themes: ['cream', 'offwhite', 'navy'] }); } },
    { id: 'stats', name: 'Stat row', blurb: 'Big numbers with labels, three to a row', make: () => newDoc('Stat row', [
      P('heading', { value: 'The year in numbers', label: 'Heading', name: 'heading', style: 'h3', gap: 16, align: 'center' }),
      rep({ label: 'Stats', name: 'stats', nameAuto: false, itemLabel: 'Stat', min: 1, max: 9, layout: 'grid', perRow: 3, gap: 16, gapBelow: 0 }, [
        P('heading', { value: '12', label: 'Number', name: 'number', style: 'h1', color: 'accent', gap: 4, align: 'center', optional: false, required: true }),
        P('text', { value: 'clubs open', label: 'What it counts', name: 'caption', style: 'small', gap: 0, align: 'center' }),
      ], parts => [
        { [parts[0].id]: '12', [parts[1].id]: 'clubs open' },
        { [parts[0].id]: '3,400', [parts[1].id]: 'members' },
        { [parts[0].id]: '1.2M', [parts[1].id]: 'cups of coffee' },
      ]),
    ], { description: 'Numbers in a grid of three; stacks on phones.', themes: ['navy', 'cream'] }) },
    { id: 'quote', name: 'Pull quote', blurb: 'A member in their own words', make: () => newDoc('Pull quote', [
      P('divider', { color: 'accent', thickness: 2, length: 15, gap: 16 }),
      P('heading', { value: '“I came for the desk. I stayed for the people at the next one.”', label: 'Quote', name: 'quote', style: 'h2', gap: 12, optional: false, required: true }),
      P('text', { value: 'Dana R., member since 2021', label: 'Who said it', name: 'attribution', style: 'small', gap: 0 }),
    ], { description: 'A quote and who said it.', themes: ['offwhite', 'cream', 'navy'] }) },
    { id: 'blank', name: 'Blank', blurb: 'Nothing in it yet', make: () => newDoc('New module', [], {}) },
  ];

  // -----------------------------------------------------------------------------------------------------------
  // Zip: stored, not compressed, so the format's bones and nothing else. Same writer as Template Studio's
  // model/zip.ts, without its types.
  // -----------------------------------------------------------------------------------------------------------

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(entries, at) {
    at = at || new Date();
    const enc = new TextEncoder();
    const time = (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1);
    const date = ((Math.max(1980, at.getFullYear()) - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
    const locals = [], centrals = []; let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.path), data = e.data || enc.encode(e.text || ''), crc = crc32(data);
      const L = new Uint8Array(30 + name.length + data.length), lv = new DataView(L.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
      lv.setUint16(10, time, true); lv.setUint16(12, date, true); lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true); L.set(name, 30); L.set(data, 30 + name.length); locals.push(L);
      const C = new Uint8Array(46 + name.length), cv = new DataView(C.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true); cv.setUint32(42, offset, true); C.set(name, 46); centrals.push(C);
      offset += L.length;
    }
    const cdSize = centrals.reduce((n, c) => n + c.length, 0);
    const E = new Uint8Array(22), ev = new DataView(E.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    const out = new Uint8Array(offset + cdSize + 22); let o = 0;
    for (const a of locals) { out.set(a, o); o += a.length; }
    for (const a of centrals) { out.set(a, o); o += a.length; }
    out.set(E, o);
    return out;
  }

  function size(text) { const n = new TextEncoder().encode(text).length; return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`; }

  const api = {
    SWITCHYARDS, normalizeSystem, TYPES, STARTERS, SCHEMA,
    uid, makePart, newDoc, migrate, reid, walk, findPath, scopeOf, isEditable, glyph, title, canHold, whyNot,
    fieldNameFrom, slugFrom, syncSlug, uniqueFieldName, claimNames, fieldPath, fieldNames, countFields,
    itemValue, setItemValue, newItem, setColumnCount, hasLink, partDefault,
    contentWidth, slotWidth, slotWidths, render, build, check, darkRules, cleanRich, zip, crc32, size, contrast,
  };
  function setColumnCount(p, n) {
    n = n === 3 ? 3 : 2;
    if (p.cols.length === n) return;
    if (n === 3) { p.cols.push({ w: 34, parts: [] }); p.cols.forEach((c, i) => { c.w = i === 1 ? 34 : 33; }); }
    else { const gone = p.cols.pop(); p.cols[1].parts.push(...gone.parts); p.cols.forEach(c => { c.w = 50; }); }
  }
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HubMod = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
