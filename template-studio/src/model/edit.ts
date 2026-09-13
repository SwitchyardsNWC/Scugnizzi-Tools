// Editing the document.
//
// Pure: every function takes a template and returns a new one. Nothing mutates, so the app can keep
// previous versions for undo without defensive copying, and every one of these is testable without
// a browser.
//
// The operations are deliberately coarse — "move this section up", not "splice index 3" — because
// the undo stack stores one entry per operation and a designer thinks in whole moves. Fifty steps
// of a five-kilobyte document costs a quarter of a megabyte, which is a trade worth making for an
// undo that cannot desynchronise from the document (acceptance.md §2 wants fifty deep, covering
// everything).

import {
  theme as themeTokens,
  DEFAULT_DESIGN_SYSTEM,
  firstPreset,
  type ColorRef,
  type DesignSystem,
  type ThemeTokens,
} from './design-system.ts';
import { canStack, createBlock, createSection, sectionFor } from './catalog.ts';
import { pictureHash } from './freeform.ts';
import { fieldName, sequentialIds } from './ids.ts';
import type { Block, BlockType, Column, Lock, Row, Section, Template } from './types.ts';

export type Selection =
  | { kind: 'template' }
  | { kind: 'section'; sectionId: string }
  | { kind: 'block'; sectionId: string; blockId: string };

export interface Resolved {
  section?: Section;
  row?: Row;
  column?: Column;
  block?: Block;
}

/**
 * The design system a template compiles against. Absent means the defaults — an older document, or
 * one nobody has tuned — so every reader goes through here rather than touching `template.ds`.
 */
export function designSystemOf(template: Template): DesignSystem {
  return template.ds ?? DEFAULT_DESIGN_SYSTEM;
}

export function resolve(template: Template, selection: Selection): Resolved {
  if (selection.kind === 'template') return {};
  const section = template.sections.find((s) => s.id === selection.sectionId);
  if (!section) return {};
  // The row comes with the section, because selecting "the columns" is selecting a section and the
  // settings for it live on the row inside. A single column comes too: selecting a *group* — one
  // column holding several blocks — is selecting the section, and what there is to set on a group
  // (its padding, its box, the gap) lives on that column.
  if (selection.kind === 'section') {
    const row = section.rows[0];
    const column = row && row.columns.length === 1 ? row.columns[0] : undefined;
    return { section, ...(row ? { row } : {}), ...(column ? { column } : {}) };
  }

  for (const row of section.rows) {
    for (const column of row.columns) {
      const block = column.blocks.find((b) => b.id === selection.blockId);
      if (block) return { section, row, column, block };
    }
  }
  return { section };
}

/** Every HubSpot field name in use, so a new one cannot collide (learnings 1.10). */
export function takenFieldNames(template: Template): Set<string> {
  const taken = new Set<string>();
  for (const block of allBlocks(template)) {
    for (const lock of locksOf(block)) if (lock.field) taken.add(lock.field);
  }
  return taken;
}

export function allBlocks(template: Template): Block[] {
  return template.sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)));
}

export function locksOf(block: Block): Lock[] {
  const out: Lock[] = [];
  if ('lock' in block) out.push(block.lock);
  if (block.type === 'button') out.push(block.link);
  if (block.type === 'legal') out.push(block.noteLock);
  return out;
}

/** One HubSpot field, with enough to find it again and rename its label. */
export interface FieldEntry {
  field: string;
  label: string;
  sectionId: string;
  blockId: string;
  blockType: string;
  /** Where the Lock lives on the block, for `setValue`. */
  path: string;
  editable: boolean;
}

/**
 * Every field the team will meet, in the order HubSpot's Contents panel lists them.
 *
 * That order is the document's own order, because the compiler emits each declaration immediately
 * before the markup that uses it (learnings 1.4) — so walking the tree here and walking the output
 * there produce the same sequence, and this view can be trusted without compiling anything.
 */
export function hubspotFields(template: Template, includeLocked = false): FieldEntry[] {
  const out: FieldEntry[] = [];
  for (const section of template.sections) {
    for (const row of section.rows) {
      for (const column of row.columns) {
        for (const block of column.blocks) {
          const named: Array<[string, Lock]> = [];
          if ('lock' in block) named.push(['block.lock', block.lock]);
          // The button declares its label then its link, and they sit together in the panel.
          if (block.type === 'button') named.push(['block.link', block.link]);
          if (block.type === 'legal') named.push(['block.noteLock', block.noteLock]);

          for (const [path, lock] of named) {
            if (!lock.editable && !includeLocked) continue;
            out.push({
              field: lock.field,
              label: lock.label,
              sectionId: section.id,
              blockId: block.id,
              blockType: block.type,
              path,
              editable: lock.editable,
            });
          }
        }
      }
    }
  }
  return out;
}

/** Block ids with nothing the team can edit — what the editability view dims. */
export function lockedBlockIds(template: Template): string[] {
  const editable = new Set(hubspotFields(template).map((f) => f.blockId));
  return allBlocks(template)
    .map((b) => b.id)
    .filter((id) => !editable.has(id));
}

// --- setting one value ---------------------------------------------------------------------------

/** `block.lock.label` -> ['block', 'lock', 'label'] */
function split(path: string): [string, string[]] {
  const parts = path.split('.');
  return [parts[0]!, parts.slice(1)];
}

function setIn<T>(node: T, keys: string[], value: unknown): T {
  if (keys.length === 0) return value as T;
  const [head, ...rest] = keys;
  const current = (node as Record<string, unknown>)[head!];
  return { ...node, [head!]: setIn(current, rest, value) } as T;
}

function getIn(node: unknown, keys: string[]): unknown {
  return keys.reduce<unknown>((acc, key) => (acc == null ? acc : (acc as Record<string, unknown>)[key]), node);
}

/**
 * Applies one control's value. `path` names which node it lands on, because the interface groups
 * properties by what a designer sees and the document stores them by what they belong to.
 */
export function setValue(
  template: Template,
  selection: Selection,
  path: string,
  value: unknown,
  ds: DesignSystem = DEFAULT_DESIGN_SYSTEM,
): Template {
  const [scope, keys] = split(path);
  const found = resolve(template, selection);
  const system = template.ds ?? ds;

  if (scope === 'template') return setIn(template, keys, value);

  // A design token. Writing one materialises the whole system onto the document the first time,
  // because a partial `ds` would mean every reader needs a merge step and one of them would forget.
  if (scope === 'ds') {
    const next = { ...template, ds: setIn(system, keys, value) };
    // Sections store their colours resolved, not by reference, so moving a colour has to walk the
    // document and move them with it. That is the debt `types.ts` left for step 5: without it,
    // editing the navy preset changes nothing a designer can see, because every section is still
    // carrying the four hexes it resolved at import.
    //
    // Both the palette and the presets trigger it, because a preset names a palette entry rather
    // than repeating its hex — so changing the brand red has to reach every link in the document,
    // not only the buttons that read `colors.red` at compile time.
    return keys[0] === 'colors' || keys[0] === 'themes' ? recolor(next, next.ds!) : next;
  }

  // Changing the preset moves the band, the container, the text and the link together — the whole
  // reason the name is stored alongside the resolved colours.
  if (scope === 'section' && keys[0] === 'theme' && typeof value === 'string') {
    const t = themeTokens(system, value);
    return mapSection(template, found.section?.id, (section) => ({
      ...section,
      theme: value,
      bandColor: t.band,
      containerColor: t.container,
      textColor: t.text,
      linkColor: t.link,
    }));
  }

  if (scope === 'section') return mapSection(template, found.section?.id, (section) => setIn(section, keys, value));

  if (scope === 'column') {
    return mapColumn(template, found.column?.id, (column) => setIn(column, keys, value));
  }

  if (scope === 'row') {
    return mapRow(template, found.row?.id, (row) => setIn(row, keys, value));
  }

  if (scope === 'block') {
    return mapBlock(template, found.block?.id, (block) => {
      const next = setIn(block, keys, value);
      // Unlocking a field for the first time has to mint its HubSpot name, once, and store it.
      // Everything after that — including every rename of the label — leaves the name alone, or the
      // team's existing emails lose whatever they typed (learnings 1.10).
      const lockPath = keys.slice(0, -1);
      if (keys.at(-1) === 'editable' && value === true && lockPath.length) {
        const lock = getIn(next, lockPath) as Lock | undefined;
        if (lock && !lock.field) {
          const taken = takenFieldNames(template);
          return setIn(next, [...lockPath, 'field'], fieldName(lock.label, taken));
        }
      }
      return next;
    });
  }

  return template;
}

export function readValue(template: Template, selection: Selection, path: string): unknown {
  const [scope, keys] = split(path);
  const found = resolve(template, selection);
  const node =
    scope === 'template'
      ? template
      : scope === 'ds'
        ? designSystemOf(template)
        : scope === 'section'
          ? found.section
          : scope === 'row'
            ? found.row
            : scope === 'column'
              ? found.column
              : found.block;
  return node === undefined ? undefined : getIn(node, keys);
}

/**
 * Re-resolves every section that names a preset against the design system.
 *
 * Only sections that name one move. A section imported without a preset keeps what it has, which is
 * the escape hatch: clearing the name detaches it from the system, and nothing a designer does to a
 * token can reach it afterwards.
 */
function recolor(template: Template, ds: DesignSystem): Template {
  return {
    ...template,
    sections: template.sections.map((section) => {
      if (!section.theme || !ds.themes[section.theme]) return section;
      const t = themeTokens(ds, section.theme);
      return { ...section, bandColor: t.band, containerColor: t.container, textColor: t.text, linkColor: t.link };
    }),
  };
}

// --- the palette ------------------------------------------------------------------------------------
//
// A colour is referenced by *name* from three places — background presets, type roles and button
// variants (learnings 3.12) — which is what makes renaming one a real operation rather than a text
// edit. Miss a reference and the thing pointing at it silently resolves to nothing.

/**
 * Every place a colour name is referenced, so the panel can say what deleting one would break.
 *
 * The document counts, not only the design system. Stripes name a palette colour like everything
 * else, and the reason that matters is the bug this was written for: the standard email paints
 * three stripes in the bright red, and while the block held a raw hex the palette reported that
 * colour as used by nothing and offered to delete it.
 */
export function colorUsage(ds: DesignSystem, name: string, template?: Template): string[] {
  const used: string[] = [];
  for (const [key, theme] of Object.entries(ds.themes)) {
    for (const slot of ['band', 'container', 'text', 'link'] as const) {
      if (theme[slot] === name) used.push(`${key} preset · ${slot}`);
    }
  }
  for (const [key, role] of Object.entries(ds.type)) {
    if (role.color === name) used.push(`${key} · colour`);
  }
  for (const [key, button] of Object.entries(ds.buttons)) {
    for (const slot of ['fill', 'ink', 'border'] as const) {
      if (button[slot] === name) used.push(`${key} button · ${slot}`);
    }
  }
  if (template) {
    let stripes = 0;
    let dividers = 0;
    for (const block of allBlocks(template)) {
      if (block.type === 'stripes') stripes += block.stripes.filter((s) => s.color === name).length;
      if (block.type === 'divider' && block.color === name) dividers += 1;
    }
    if (stripes) used.push(stripes === 1 ? '1 stripe' : `${stripes} stripes`);
    if (dividers) used.push(dividers === 1 ? '1 divider' : `${dividers} dividers`);
  }
  return used;
}

/** A name that is safe as an object key and readable in a panel. */
export function colorKey(label: string, taken: Iterable<string>): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'colour';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

export function addColor(template: Template, label: string, value: string): Template {
  const ds = designSystemOf(template);
  const key = colorKey(label, Object.keys(ds.colors));
  return { ...template, ds: { ...ds, colors: { ...ds.colors, [key]: value } } };
}

/**
 * Renames a colour, carrying every reference with it.
 *
 * The rename is the whole operation. A palette entry that changed name while three presets kept
 * pointing at the old one would leave those presets resolving to nothing — and `colorOf` returns
 * null for an unknown name, so the failure is a section that quietly loses its background rather
 * than an error anybody sees.
 */
/**
 * Points every reference to `from` at `to`, across the design system and the document.
 *
 * The one place that knows where a colour can be named. Renaming and replacing are the same walk
 * with a different ending, and keeping them apart is how one of them ends up missing stripes.
 */
function repoint(
  template: Template,
  ds: DesignSystem,
  from: string,
  to: string,
): { template: Template; ds: DesignSystem } {
  const swap = (ref: ColorRef): ColorRef => (ref === from ? to : ref);

  const themes = Object.fromEntries(
    Object.entries(ds.themes).map(([name, t]) => [
      name,
      { ...t, band: swap(t.band), container: swap(t.container), text: swap(t.text), link: swap(t.link) },
    ]),
  );
  const type = Object.fromEntries(
    Object.entries(ds.type).map(([name, t]) => [name, t.color === from ? { ...t, color: to } : t]),
  );
  const buttons = Object.fromEntries(
    Object.entries(ds.buttons).map(([name, b]) => [
      name,
      { ...b, fill: swap(b.fill), ink: swap(b.ink), border: swap(b.border) },
    ]),
  );

  // Stripes and dividers name a colour like everything else, so this has to walk the document as
  // well as the system. Missing one leaves a block pointing at a name nothing defines, which renders
  // as no line at all — a missing rule, not an error.
  const sections = template.sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => ({
      ...row,
      columns: row.columns.map((column) => ({
        ...column,
        blocks: column.blocks.map((block) => {
          if (block.type === 'stripes') {
            return { ...block, stripes: block.stripes.map((s) => (s.color === from ? { ...s, color: to } : s)) };
          }
          if (block.type === 'divider' && block.color === from) return { ...block, color: to };
          return block;
        }),
      })),
    })),
  }));

  return { template: { ...template, sections }, ds: { ...ds, themes, type, buttons } };
}

export function renameColor(template: Template, from: string, to: string): Template {
  const ds = designSystemOf(template);
  if (from === to || !ds.colors[from]) return template;
  const key = colorKey(to, Object.keys(ds.colors).filter((k) => k !== from));

  const moved = repoint(template, ds, from, key);
  // Rebuilt in order rather than spread, so the palette keeps the order somebody arranged it in.
  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(ds.colors)) colors[k === from ? key : k] = v;

  const next: Template = { ...moved.template, ds: { ...moved.ds, colors } };
  return recolor(next, next.ds!);
}

/**
 * Removes a colour, pointing whatever used it at `replacement` first.
 *
 * Deleting a token that things reference *is* a replace — there is no version of it that leaves the
 * references alone and still makes sense. Refusing until nothing used it was the first shape and it
 * was a dead end: in a real palette everything is used, so the button never worked and the panel
 * offered an action it would never perform.
 *
 * `replacement` is only needed when something names the colour.
 */
export function removeColor(template: Template, name: string, replacement?: string): Template {
  const ds = designSystemOf(template);
  if (!ds.colors[name]) return template;

  const used = colorUsage(ds, name, template).length > 0;
  if (used && (!replacement || !ds.colors[replacement] || replacement === name)) return template;

  const moved = replacement ? repoint(template, ds, name, replacement) : { template, ds };
  const colors = { ...moved.ds.colors };
  delete colors[name];

  const next: Template = { ...moved.template, ds: { ...moved.ds, colors } };
  return recolor(next, next.ds!);
}

// --- background presets ------------------------------------------------------------------------------
//
// A preset is named from one place — a Section's `theme` — and that name is what makes "change the
// navy band everywhere" a single edit. Renaming or removing one therefore has to walk the document,
// exactly as a palette colour does.

/** How many sections follow a preset. What the panel needs before offering to remove one. */
export function presetUsage(template: Template, name: string): number {
  return template.sections.filter((s) => s.theme === name).length;
}

/** A name that is safe as an object key and readable in a panel. */
export function presetKey(label: string, taken: Iterable<string>): string {
  return colorKey(label, taken);
}

/** A new preset, copied from one that exists so it starts from something rather than from nothing. */
export function addPreset(template: Template, label: string, copyOf?: string): Template {
  const ds = designSystemOf(template);
  const key = presetKey(label, Object.keys(ds.themes));
  const source = (copyOf && ds.themes[copyOf]) || Object.values(ds.themes)[0];
  if (!source) return template;
  return { ...template, ds: { ...ds, themes: { ...ds.themes, [key]: { ...source } } } };
}

/** Renames a preset, carrying every section that follows it. */
export function renamePreset(template: Template, from: string, to: string): Template {
  const ds = designSystemOf(template);
  if (from === to || !ds.themes[from]) return template;
  const key = presetKey(to, Object.keys(ds.themes).filter((k) => k !== from));

  // Rebuilt in order, so the list keeps the arrangement somebody chose.
  const themes: Record<string, ThemeTokens> = {};
  for (const [k, v] of Object.entries(ds.themes)) themes[k === from ? key : k] = v;

  const sections = template.sections.map((s) => (s.theme === from ? { ...s, theme: key } : s));
  return { ...template, sections, ds: { ...ds, themes } };
}

/**
 * Removes a preset, pointing whatever followed it at `replacement` first.
 *
 * The same shape as removing a colour, and for the same reason: a section whose `theme` names
 * nothing keeps the four colours it last resolved, so it does not break — it silently stops
 * following the system, which is worse than breaking because nothing says so.
 *
 * The last preset cannot go. A template with none has no way to describe a background at all.
 */
export function removePreset(template: Template, name: string, replacement?: string): Template {
  const ds = designSystemOf(template);
  if (!ds.themes[name] || Object.keys(ds.themes).length <= 1) return template;

  const used = presetUsage(template, name) > 0;
  if (used && (!replacement || !ds.themes[replacement] || replacement === name)) return template;

  const themes = { ...ds.themes };
  delete themes[name];

  const sections = replacement
    ? template.sections.map((s) => (s.theme === name ? { ...s, theme: replacement } : s))
    : template.sections;

  const next: Template = { ...template, sections, ds: { ...ds, themes } };
  return recolor(next, next.ds!);
}

/** The palette back to the brand, leaving the type scale and everything else where it is. */
export function resetPalette(template: Template): Template {
  const ds = designSystemOf(template);
  const next: Template = { ...template, ds: { ...ds, colors: { ...DEFAULT_DESIGN_SYSTEM.colors } } };
  return recolor(next, next.ds!);
}

/** Back to the shipped values, and every section that follows a preset comes with it. */
export function resetDesignSystem(template: Template): Template {
  // A template that follows a folder system resets *that* — the shipped values written back to
  // the folder's file — rather than dropping it, which would leave it naming a system it no
  // longer holds and compiling against something the file does not say.
  if (template.designSystem) {
    const fresh = structuredClone(DEFAULT_DESIGN_SYSTEM);
    return recolor({ ...template, ds: fresh }, fresh);
  }
  const cleared: Template = { ...template };
  delete cleared.ds;
  return recolor(cleared, DEFAULT_DESIGN_SYSTEM);
}

// --- the folder's design systems ---------------------------------------------------------------------
//
// One file per system in `design-systems/`, and a template names the one it follows. That is the
// shared layer `types.ts` said was not built: while a template names a system, its `ds` is that
// file materialised on open and written back on every edit, so five templates on one system move
// together. The pure layer needs no other change — everything already reads `template.ds`.

/** Points the template at a folder system and re-resolves every section that names a preset. */
export function followFolderSystem(template: Template, name: string, system: DesignSystem): Template {
  return recolor({ ...template, designSystem: name, ds: system }, system);
}

/** Stops following. The system stays on the template as its own copy, so nothing moves on screen. */
export function detachFromFolderSystem(template: Template): Template {
  const { designSystem, ...rest } = template;
  void designSystem;
  return rest;
}

/**
 * On open: a template naming a folder system gets that system, and its sections follow it.
 *
 * Naming a system the folder does not have is worth a warning rather than a silent fallback: the
 * template keeps whatever `ds` it carries (usually nothing, so the shipped values) and the panel
 * says so, because a synced folder where somebody deleted a system file should not quietly turn
 * every template that used it back into the brand defaults.
 */
export function materialiseFolderSystem(
  template: Template,
  systems: Record<string, DesignSystem>,
): { template: Template; warning?: string } {
  if (!template.designSystem) return { template };
  const system = systems[template.designSystem];
  if (!system) {
    return {
      template,
      warning: `This template follows a design system called "${template.designSystem}" that is not in the folder's design-systems directory, so it is showing the shipped values instead.`,
    };
  }
  return { template: followFolderSystem(template, template.designSystem, system) };
}

// --- fonts ----------------------------------------------------------------------------------------
//
// The stacks a role may name. Seven shipped, and until now that was all there could be: a template
// in a monospace face — the Phase 0 probe's look — needed a stack the list did not have, and the
// panel offered no way to add one. A name rather than a stack on each role (learnings 3.12) is what
// makes adding one safe: the role keeps saying `mono`, and the stack behind it can be tuned once.

/** The type roles that name a font, so the panel can say what removing one would touch. */
export function fontUsage(ds: DesignSystem, key: string): string[] {
  const used = Object.entries(ds.type)
    .filter(([, role]) => role.font === key)
    .map(([name]) => name);
  if (ds.fonts[key] && ds.fontStack === ds.fonts[key]) used.push('the email’s font');
  return used;
}

/** A new stack under a safe key. The stack is stored as typed; the key is derived from the label. */
export function addFont(template: Template, label: string, stack: string): Template {
  const ds = designSystemOf(template);
  const key = colorKey(label, Object.keys(ds.fonts));
  const value = stack.trim();
  if (!value) return template;
  return { ...template, ds: { ...ds, fonts: { ...ds.fonts, [key]: value } } };
}

/**
 * Removes a stack. Refused while a role names it — a role whose font resolves to nothing falls
 * back to the email's default silently, which is a change nobody asked for in a place nobody is
 * looking. Point the roles elsewhere first; the panel says which ones.
 */
export function removeFont(template: Template, key: string): Template {
  const ds = designSystemOf(template);
  if (!ds.fonts[key] || fontUsage(ds, key).length > 0) return template;
  const fonts = { ...ds.fonts };
  delete fonts[key];
  return { ...template, ds: { ...ds, fonts } };
}

// --- a copy of the whole template ---------------------------------------------------------------

/**
 * A copy under a new name, for saving as a second file.
 *
 * Only the identity changes. Block ids are document-local, so they need no renaming; field names
 * are kept on purpose — a copy is a new template in HubSpot, and the team's existing emails are
 * bound to the *original's* fields, which this does not touch. The design system travels with it,
 * because "start from this one" means its type and colours as much as its blocks.
 */
export function duplicateTemplate(template: Template, name: string): Template {
  const id = freshIds(template)();
  return { ...template, id, name, hubspotLabel: name };
}

// --- structural edits -----------------------------------------------------------------------------

function mapSection(template: Template, id: string | undefined, fn: (s: Section) => Section): Template {
  if (!id) return template;
  return { ...template, sections: template.sections.map((s) => (s.id === id ? fn(s) : s)) };
}

function mapColumn(template: Template, id: string | undefined, fn: (c: Column) => Column): Template {
  if (!id) return template;
  return {
    ...template,
    sections: template.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) => ({ ...r, columns: r.columns.map((c) => (c.id === id ? fn(c) : c)) })),
    })),
  };
}

function mapRow(template: Template, id: string | undefined, fn: (r: Row) => Row): Template {
  if (!id) return template;
  return {
    ...template,
    sections: template.sections.map((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? fn(r) : r)) })),
  };
}

function mapBlock(template: Template, id: string | undefined, fn: (b: Block) => Block): Template {
  if (!id) return template;
  return {
    ...template,
    sections: template.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) => ({
        ...r,
        columns: r.columns.map((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? fn(b) : b)) })),
      })),
    })),
  };
}

/** Moves a section one place. Out of range is a no-op rather than an error — the button is disabled. */
export function moveSection(template: Template, sectionId: string, delta: number): Template {
  const from = template.sections.findIndex((s) => s.id === sectionId);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= template.sections.length) return template;
  const sections = [...template.sections];
  const [moved] = sections.splice(from, 1);
  sections.splice(to, 0, moved!);
  return { ...template, sections };
}

/** Moves a section to an absolute position, which is what a drag knows and a nudge does not. */
export function moveSectionTo(template: Template, sectionId: string, toIndex: number): Template {
  const from = template.sections.findIndex((s) => s.id === sectionId);
  if (from === -1) return template;
  const to = Math.max(0, Math.min(template.sections.length - 1, toIndex));
  if (to === from) return template;
  const sections = [...template.sections];
  const [moved] = sections.splice(from, 1);
  sections.splice(to, 0, moved!);
  return { ...template, sections };
}

export function removeSection(template: Template, sectionId: string): Template {
  return { ...template, sections: template.sections.filter((s) => s.id !== sectionId) };
}

/**
 * A copy, directly below. Every id is new, and so is every HubSpot field name — two blocks sharing
 * a field name would collide in the Contents panel, and the duplicate is a new field to the team
 * even though it looks the same to the designer.
 */
export function duplicateSection(template: Template, sectionId: string): Template {
  const index = template.sections.findIndex((s) => s.id === sectionId);
  if (index === -1) return template;
  const nextId = freshIds(template);
  const taken = takenFieldNames(template);

  const clone = structuredClone(template.sections[index]!);
  clone.id = nextId();
  for (const row of clone.rows) {
    row.id = nextId();
    for (const column of row.columns) {
      column.id = nextId();
      for (const block of column.blocks) {
        block.id = nextId();
        for (const lock of locksOf(block)) {
          // Derived from the original's *name*, not its label, so a copy of `button_text` becomes
          // `button_text_2` rather than something reconstructed from "Button text (blank to hide)".
          // Nothing is orphaned either way — a duplicate is a new field — but the team reads these
          // in error messages, and a name that relates to the original is worth the one line.
          if (lock.editable) lock.field = fieldName(lock.field || lock.label, taken);
        }
      }
    }
  }
  const sections = [...template.sections];
  sections.splice(index + 1, 0, clone);
  return { ...template, sections };
}

/**
 * An empty row of columns, as its own section, at an absolute position.
 *
 * Columns are something you *drop*, not something you do to a block you already have. Splitting
 * "the row this block happens to sit in" was the shape before, and Jared called it confusing for
 * the right reason: it asks the designer to know that a block they can see sits inside a row they
 * cannot, and then to edit the invisible one through the visible one. Dropping an empty two-column
 * row and putting things in it is the same structure arrived at the other way round, and every step
 * of it is on screen.
 */
export function addColumnsAt(template: Template, index: number, count = 2): Template {
  const nextId = freshIds(template);
  const spans = RATIOS[count]?.[0] ?? [6, 6];
  // The template's own first preset, not one called `cream` — a name this palette happens to use.
  const ds = designSystemOf(template);
  const preset = firstPreset(ds);
  const t = themeTokens(ds, preset);

  const columns: Column[] = spans.map((span) => ({
    id: nextId(),
    span,
    padTop: 10,
    padBottom: 10,
    align: 'left',
    blocks: [],
  }));

  const section: Section = {
    id: nextId(),
    theme: preset,
    bandColor: t.band,
    containerColor: t.container,
    textColor: t.text,
    linkColor: t.link,
    padTop: 0,
    padBottom: 0,
    rows: [{ id: nextId(), mobile: 'stack', columns }],
  };

  const sections = [...template.sections];
  sections.splice(Math.max(0, Math.min(sections.length, index)), 0, section);
  return { ...template, sections };
}

/**
 * A new block in a full-width section of its own, at an absolute position.
 *
 * What a palette drop on a section's *edge* means. The middle of a block means its column instead
 * — a group, if it was alone — and the two are different things now: a group is one cell, one box,
 * one gap, and a section is a band of its own (learnings 3.59). The canvas draws the difference,
 * so the choice is the designer's rather than a rule's.
 */
export function addSectionAt(template: Template, type: BlockType, index: number): Template {
  const section = createSection(type, { id: freshIds(template), taken: takenFieldNames(template) }, designSystemOf(template));
  const sections = [...template.sections];
  sections.splice(Math.max(0, Math.min(sections.length, index)), 0, section);
  return { ...template, sections };
}

/**
 * Moves a block out to a full-width section of its own, at an absolute position.
 *
 * A block that was already alone in its section keeps that section — and with it the background,
 * the padding and the preset name somebody chose. Rebuilding it would silently reset all three.
 */
export function moveBlockToSection(template: Template, blockId: string, index: number): Template {
  const site = siteOf(template, blockId);
  if (!site) return template;

  const from = template.sections.findIndex((s) => s.id === site.section.id);
  const solo = site.row.columns.length === 1 && site.column.blocks.length === 1;
  if (solo) return moveSectionTo(template, site.section.id, index > from ? index - 1 : index);

  const block = site.column.blocks[site.index]!;
  const nextId = freshIds(template);
  const lifted = mapColumn(template, site.column.id, (column) => ({
    ...column,
    blocks: column.blocks.filter((b) => b.id !== blockId),
  }));

  // The new section inherits the one it came from, so a block dragged out of a navy row does not
  // land on cream and look broken for reasons nobody asked for.
  const carrier: Section = {
    ...site.section,
    id: nextId(),
    rows: [{ id: nextId(), mobile: 'stack', columns: [{ ...site.column, id: nextId(), span: 12, blocks: [block] }] }],
  };
  const sections = [...lifted.sections];
  sections.splice(Math.max(0, Math.min(sections.length, index)), 0, carrier);
  return {
    ...lifted,
    sections: sections.filter(worthKeeping),
  };
}

export function addSection(template: Template, type: BlockType, afterSectionId: string | null): Template {
  const section = createSection(type, { id: freshIds(template), taken: takenFieldNames(template) }, designSystemOf(template));
  const at = afterSectionId ? template.sections.findIndex((s) => s.id === afterSectionId) + 1 : template.sections.length;
  const sections = [...template.sections];
  sections.splice(at, 0, section);
  return { ...template, sections };
}

// --- copies of things that carry field names -------------------------------------------------------

/**
 * A copy of a section with new ids and freshly minted field names.
 *
 * `keep` maps a lock's label to a field name to reuse, when one exists and nothing else in the
 * template holds it. That is how a pattern update keeps the names the team's emails are already
 * bound to (learnings 1.10): a block at the same label keeps its field, and only a genuinely new
 * block gets a new one.
 */
export function cloneSection(
  section: Section,
  nextId: () => string,
  taken: Set<string>,
  keep: Map<string, string> = new Map(),
): Section {
  const clone = structuredClone(section);
  clone.id = nextId();
  for (const row of clone.rows) {
    row.id = nextId();
    for (const column of row.columns) {
      column.id = nextId();
      for (const block of column.blocks) {
        block.id = nextId();
        for (const lock of locksOf(block)) {
          if (!lock.editable) continue;
          const kept = keep.get(lock.label);
          if (kept && !taken.has(kept)) {
            taken.add(kept);
            lock.field = kept;
          } else {
            lock.field = fieldName(lock.field || lock.label, taken);
          }
        }
      }
    }
  }
  return clone;
}

/** A copy of a block with a new id and freshly minted field names. */
export function cloneBlock(block: Block, nextId: () => string, taken: Set<string>): Block {
  const clone = structuredClone(block);
  clone.id = nextId();
  for (const lock of locksOf(clone)) if (lock.editable) lock.field = fieldName(lock.field || lock.label, taken);
  return clone;
}

// --- several blocks at once ------------------------------------------------------------------------

/** Removes any number of blocks in one step, emptying their sections as `removeBlock` would. */
export function removeBlocks(template: Template, ids: string[]): Template {
  const gone = new Set(ids);
  const next = {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) => ({
        ...row,
        columns: row.columns.map((column) => ({ ...column, blocks: column.blocks.filter((b) => !gone.has(b.id)) })),
      })),
    })),
  };
  return { ...next, sections: next.sections.filter(worthKeeping) };
}

/**
 * Moves a run of sections one place, together and in order.
 *
 * The run is whatever sections hold the given blocks; it moves as a block, so three selected
 * sections stay three neighbours. At either end of the document it is a no-op, like `moveSection`.
 */
export function moveSections(template: Template, blockIds: string[], delta: number): Template {
  const wanted = new Set(blockIds);
  const indices = template.sections
    .map((s, i) => (s.rows.some((r) => r.columns.some((c) => c.blocks.some((b) => wanted.has(b.id)))) ? i : -1))
    .filter((i) => i !== -1);
  if (indices.length === 0) return template;
  const first = Math.min(...indices);
  const last = Math.max(...indices);
  const contiguous = last - first + 1 === indices.length;
  if (!contiguous) return template;
  if (delta < 0 && first === 0) return template;
  if (delta > 0 && last === template.sections.length - 1) return template;
  const sections = [...template.sections];
  const run = sections.splice(first, indices.length);
  sections.splice(first + delta, 0, ...run);
  return { ...template, sections };
}

/**
 * Blocks pasted in as full-width sections of their own, at an absolute position, on this
 * template's presets. Each gets new ids and field names, so a paste is a new set of fields to the
 * team even when the words are the same.
 */
export function insertBlocksAt(template: Template, blocks: Block[], index: number): Template {
  const nextId = freshIds(template);
  const taken = takenFieldNames(template);
  const ds = designSystemOf(template);
  const sections = [...template.sections];
  const at = Math.max(0, Math.min(sections.length, index));
  const fresh = blocks.map((block) => sectionFor(cloneBlock(block, nextId, taken), { id: nextId, taken }, ds));
  sections.splice(at, 0, ...fresh);
  return { ...template, sections };
}

/** Blocks pasted into a column, at an index among its blocks. Full-bleed blocks are skipped. */
export function insertBlocksInColumn(template: Template, columnId: string, blocks: Block[], index: number): Template {
  const nextId = freshIds(template);
  const taken = takenFieldNames(template);
  const allowed = blocks.filter((b) => b.type !== 'topbar' && b.type !== 'legal' && b.type !== 'stripes');
  const fresh = allowed.map((b) => cloneBlock(b, nextId, taken));
  return mapColumn(template, columnId, (column) => {
    const next = [...column.blocks];
    next.splice(Math.max(0, Math.min(next.length, index)), 0, ...fresh);
    return { ...column, blocks: next };
  });
}

/** A whole section pasted in — a row of columns, say — with new ids and field names. */
export function pasteSection(template: Template, section: Section, index: number): Template {
  const fresh = cloneSection(section, freshIds(template), takenFieldNames(template));
  delete fresh.pattern;
  const sections = [...template.sections];
  sections.splice(Math.max(0, Math.min(sections.length, index)), 0, fresh);
  return { ...template, sections };
}

// --- columns ---------------------------------------------------------------------------------------

/**
 * The ratios worth offering, per column count.
 *
 * A short list on purpose. Twelfths allow eighty-odd arrangements and a designer wants six of them;
 * the rest are a way to end up with a 5/7 split nobody chose. Anything else is still expressible in
 * the document — this is what the interface offers, not what the model permits.
 */
export const RATIOS: Record<number, number[][]> = {
  1: [[12]],
  2: [
    [6, 6],
    [8, 4],
    [4, 8],
    [9, 3],
    [3, 9],
  ],
  3: [
    [4, 4, 4],
    [6, 3, 3],
    [3, 6, 3],
    [3, 3, 6],
  ],
  4: [[3, 3, 3, 3]],
};

/**
 * Sets a row's columns and their ratios in one operation.
 *
 * Losing content is the failure mode worth designing against: going from three columns to two has
 * to put the third column's blocks somewhere, and the only answer a designer will forgive is "in
 * the last one that is left". They are appended rather than replacing, and undo covers the rest.
 */
export function setRowColumns(template: Template, rowId: string, spans: number[]): Template {
  const nextId = freshIds(template);
  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) => {
        if (row.id !== rowId) return row;
        const first = row.columns[0];
        if (!first) return row;

        const columns: Column[] = spans.map((span, i) => {
          const existing = row.columns[i];
          if (existing) return { ...existing, span };
          // A new column inherits the first one's padding and alignment, so a row does not become
          // ragged the moment it is split.
          return { ...first, id: nextId(), span, blocks: [] };
        });

        // Anything beyond the new count moves into the last surviving column rather than vanishing.
        const orphans = row.columns.slice(spans.length).flatMap((c) => c.blocks);
        const last = columns[columns.length - 1];
        if (orphans.length && last) last.blocks = [...last.blocks, ...orphans];

        return { ...row, columns };
      }),
    })),
  };
}

/** Where a block lives, which is what every block-level operation needs to find first. */
export interface BlockSite {
  section: Section;
  row: Row;
  column: Column;
  index: number;
}

export function siteOf(template: Template, blockId: string): BlockSite | null {
  for (const section of template.sections) {
    for (const row of section.rows) {
      for (const column of row.columns) {
        const index = column.blocks.findIndex((b) => b.id === blockId);
        if (index !== -1) return { section, row, column, index };
      }
    }
  }
  return null;
}

/**
 * Removes one block, wherever it is.
 *
 * `removeSection` was the only delete this app had, which meant a block inside a column could not
 * be deleted at all — the outline offered actions on sections and nothing on the blocks nested
 * under them. Jared hit it immediately.
 *
 * A section left completely empty goes with it. An empty section is not a thing a designer means to
 * keep: it renders as nothing, is invisible on the canvas, and would sit in the outline as a row
 * that cannot be selected or filled.
 */
export function removeBlock(template: Template, blockId: string): Template {
  const next = {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) => ({
        ...row,
        columns: row.columns.map((column) => ({
          ...column,
          blocks: column.blocks.filter((b) => b.id !== blockId),
        })),
      })),
    })),
  };
  return { ...next, sections: next.sections.filter(worthKeeping) };
}

// --- groups: several blocks in one column ------------------------------------------------------------
//
// A column has always held a list of blocks; what changed is that the compiler now draws a column
// holding several as one cell — one box, one gutter, the blocks in rows inside — instead of one
// band per block (learnings 3.59). These are the two operations that make and unmake one.

/** A single column holding more than one block: a group, on the canvas and in the outline. */
export function isStack(section: Section): boolean {
  const row = section.rows[0];
  return Boolean(row && row.columns.length === 1 && row.columns[0]!.blocks.length > 1);
}

/** The section a block is in, when that section is a group; null otherwise. */
export function stackOf(template: Template, blockId: string): Section | null {
  const site = siteOf(template, blockId);
  return site && isStack(site.section) ? site.section : null;
}

/**
 * Merges the sections holding these blocks into one, with every block in one column.
 *
 * Whole sections, in the order they stand, from the first that holds a selected block to the
 * last — selecting one block of a three-block group and a neighbour groups all four, because a
 * group is not a thing that can be half inside another, and a section between two selected ones
 * cannot be skipped without moving it. Every section in the run has to be single-column and every
 * block one that can share a cell — otherwise nothing happens, and the caller says why.
 *
 * The first section is the one that survives, its colours and preset included; the column keeps
 * the first section's sides, box and gap, its own space above, and the last section's space below,
 * so the outer rhythm is the one the run already had. A pattern marker does not survive: the
 * section no longer holds what the pattern holds.
 */
export function groupIntoStack(template: Template, blockIds: string[]): Template | null {
  const wanted = new Set(blockIds);
  const indices = template.sections
    .map((s, i) => (s.rows.some((r) => r.columns.some((c) => c.blocks.some((b) => wanted.has(b.id)))) ? i : -1))
    .filter((i) => i !== -1);
  if (indices.length < 2) return null;
  const run = template.sections.slice(indices[0]!, indices[indices.length - 1]! + 1);
  for (const section of run) {
    const row = section.rows[0];
    if (!row || section.rows.length !== 1 || row.columns.length !== 1) return null;
    if (!row.columns[0]!.blocks.every(canStack)) return null;
  }

  const first = run[0]!;
  const firstColumn = first.rows[0]!.columns[0]!;
  const lastColumn = run[run.length - 1]!.rows[0]!.columns[0]!;
  const blocks = run.flatMap((s) => s.rows[0]!.columns[0]!.blocks);
  const { pattern: _dropped, ...shell } = first;
  void _dropped;
  const merged: Section = {
    ...shell,
    rows: [{ ...first.rows[0]!, columns: [{ ...firstColumn, padBottom: lastColumn.padBottom, blocks }] }],
  };
  const gone = new Set(run.slice(1).map((s) => s.id));
  return {
    ...template,
    sections: template.sections.map((s) => (s.id === first.id ? merged : s)).filter((s) => !gone.has(s.id)),
  };
}

/**
 * The inverse: one section per block, each keeping the section's colours and the column's sides.
 *
 * The vertical rhythm is reproduced rather than copied — the first keeps the space above, the last
 * the space below, and every block but the last carries the gap under it — so the page looks the
 * same the moment after as the moment before, and only the structure has changed. The box goes on
 * every piece, which is what the old renderer drew and is at least visible; deleting three boxes
 * is easier than guessing which of the three was meant.
 */
export function splitStack(template: Template, sectionId: string): Template | null {
  const section = template.sections.find((s) => s.id === sectionId);
  if (!section || !isStack(section)) return null;
  const row = section.rows[0]!;
  const column = row.columns[0]!;
  const nextId = freshIds(template);
  const gap = typeof column.gap === 'number' ? column.gap : designSystemOf(template).blockGap;
  const { pattern: _dropped, ...shell } = section;
  void _dropped;
  const pieces: Section[] = column.blocks.map((block, i, all) => ({
    ...shell,
    id: i === 0 ? section.id : nextId(),
    rows: [
      {
        id: i === 0 ? row.id : nextId(),
        mobile: row.mobile,
        columns: [
          {
            ...column,
            id: i === 0 ? column.id : nextId(),
            padTop: i === 0 ? column.padTop : 0,
            padBottom: i === all.length - 1 ? column.padBottom : gap,
            blocks: [block],
          },
        ],
      },
    ],
  }));
  const at = template.sections.findIndex((s) => s.id === sectionId);
  const sections = [...template.sections];
  sections.splice(at, 1, ...pieces);
  return { ...template, sections };
}

/**
 * Whether a section still has a reason to exist.
 *
 * A single-column section with nothing in it is debris — it renders as nothing and cannot be
 * selected. A *multi-column* one is a layout somebody dropped on purpose, and emptying its last
 * block should leave the columns standing, ready to be filled again.
 */
function worthKeeping(section: Section): boolean {
  return section.rows.some((row) => row.columns.length > 1 || row.columns.some((c) => c.blocks.length > 0));
}

/**
 * A copy of one block, directly after it in the same column.
 *
 * Every id is new and so is every HubSpot field name: two blocks sharing a field name would collide
 * in the Contents panel, and the duplicate is a new field to the team even though it looks the same
 * to the designer (the same reasoning as `duplicateSection`).
 */
/**
 * Replaces a heading or rich text block with a picture of itself.
 *
 * Pure, and deliberately knows nothing about how the picture was made — `app/rasterise.ts` draws
 * it, this decides what the document then says. The compiler is never told that an image was once
 * words; it sees an image block like any other.
 *
 * Three consequences that are the whole reason this is an action somebody takes rather than a
 * setting, and that the editor states out loud when it happens:
 *
 *   1. **It stops being editable in HubSpot.** Nobody can retype a picture, so the lock closes. If
 *      the block had an open field, that field leaves the template and whatever the team had typed
 *      into it in a past send is orphaned (learnings 1.10). The original block is kept whole in
 *      `wasText`, field name included, so going back restores the field rather than minting a new
 *      one — but a send that happened in between is still a send that lost its copy.
 *   2. **Images are off by default in Outlook on Windows and in most corporate mail.** For that
 *      share of the audience the `alt` *is* the block, which is why it carries the real words.
 *   3. **A picture cannot reflow or invert.** It is the same pixels on a 320px phone and in a dark
 *      client, which is the point and also the cost.
 */
export function renderAsImage(
  template: Template,
  blockId: string,
  picture: { src: string; alt: string; width: number },
): Template {
  return mapBlock(template, blockId, (block) => {
    // A freeform block keeps its recipe and takes the picture: the same render path, a different
    // outcome, because its layers are the thing and the picture is what they become.
    if (block.type === 'freeform' || block.type === 'brand') return { ...block, src: picture.src, renderedHash: pictureHash(block) };
    if (block.type !== 'heading' && block.type !== 'richtext') return block;
    return {
      id: block.id,
      type: 'image',
      // Closed, and keeping the name it already had. A locked field is never declared in the
      // output — `textContent` emits the literal and no `widget` — so the name is inert while it
      // sits here, and carrying it means that going back, or unlocking later, reuses the name
      // rather than minting `body_2` for the same paragraph (learnings 1.10).
      lock: { label: block.lock.label, field: block.lock.field, editable: false },
      mode: 'static',
      src: picture.src,
      alt: picture.alt,
      href: '',
      width: picture.width,
      align: block.align,
      optional: false,
      wasText: block,
    };
  });
}

/** Puts the words back, exactly as they were — the field name included. */
export function backToText(template: Template, blockId: string): Template {
  return mapBlock(template, blockId, (block) =>
    block.type === 'image' && block.wasText ? { ...block.wasText, id: block.id } : block,
  );
}

export function duplicateBlock(template: Template, blockId: string): Template {
  const site = siteOf(template, blockId);
  if (!site) return template;
  // A block alone in its section is duplicated *as* its section — a sibling band, the same look
  // it always had. A copy placed beside it in the same column would make the pair a group, with
  // one cell and the gap between (learnings 3.59), which is a different thing from "another one
  // of these" and not what ⌘D on a lone block ever meant.
  if (site.row.columns.length === 1 && site.column.blocks.length === 1) return duplicateSection(template, site.section.id);
  const nextId = freshIds(template);
  const taken = takenFieldNames(template);

  const clone = structuredClone(site.column.blocks[site.index]!);
  clone.id = nextId();
  for (const lock of locksOf(clone)) {
    if (lock.editable) lock.field = fieldName(lock.field || lock.label, taken);
  }

  return mapColumn(template, site.column.id, (column) => {
    const blocks = [...column.blocks];
    blocks.splice(site.index + 1, 0, clone);
    return { ...column, blocks };
  });
}

/**
 * One column's share set by hand, as a percentage of the row; the others give or take in
 * proportion so the row still adds up. Nothing goes below a tenth, and a row of two is the
 * simple case: the other column is what is left.
 */
export function shareSpans(spans: number[], index: number, percent: number): number[] {
  const n = spans.length;
  if (n < 2 || index < 0 || index >= n) return spans;
  const total = spans.reduce((a, b) => a + b, 0) || 1;
  const current = spans.map((s) => (s / total) * 100);
  const floor = 10;
  const want = Math.max(floor, Math.min(100 - floor * (n - 1), percent));
  const restNow = 100 - current[index]!;
  const restNext = 100 - want;
  const next = current.map((c, i) => {
    if (i === index) return want;
    // The others scale to fill what is left; a row where they held nothing splits it evenly.
    return restNow > 0 ? (c / restNow) * restNext : restNext / (n - 1);
  });
  return next.map((v) => Math.round(v));
}

/**
 * A block becomes another kind of block, in place.
 *
 * What carries over is what both kinds have: the words (a heading's text, a button's label, a
 * paragraph's first line, an image's alt), the alignment, and the HubSpot lock — label, field name
 * and whether the team may edit it. Keeping the field name is deliberate (learnings 1.10): the
 * block is the same thing to the team, just set differently. Its *kind* of field may change —
 * text to rich text — which a re-upload handles as a new field of the same name.
 *
 * Only blocks that can share a cell convert; the top bar, the stripes and the footer are what
 * they are.
 */
export function convertBlock(template: Template, blockId: string, type: BlockType): Template {
  const site = siteOf(template, blockId);
  if (!site) return template;
  const old = site.column.blocks[site.index]!;
  if (old.type === type || !canStack(old) || !canStack({ type })) return template;

  const own = new Set(locksOf(old).map((l) => l.field).filter(Boolean));
  const taken = new Set([...takenFieldNames(template)].filter((f) => !own.has(f)));
  const fresh = createBlock(type, { id: () => old.id, taken });

  const words =
    old.type === 'heading' || old.type === 'button' || old.type === 'topbar'
      ? old.text
      : old.type === 'richtext'
        ? plainText(old.html)
        : old.type === 'image' || old.type === 'freeform' || old.type === 'brand'
          ? old.alt
          : '';
  if (fresh.type === 'heading' || fresh.type === 'button' || fresh.type === 'topbar') {
    if (words.trim()) fresh.text = words.trim();
  } else if (fresh.type === 'richtext') {
    if (old.type === 'richtext') fresh.html = old.html;
    else if (words.trim()) fresh.html = `<p>${escapeText(words.trim())}</p>`;
  } else if (fresh.type === 'image' && words.trim()) {
    fresh.alt = words.trim();
  }
  if ('lock' in old && 'lock' in fresh) fresh.lock = { ...old.lock };
  if ('align' in old && 'align' in fresh && old.align) {
    const align = old.align === 'full' ? 'center' : old.align;
    if (fresh.type === 'button') fresh.align = old.align;
    else fresh.align = align;
  }
  return mapBlock(template, blockId, () => fresh);
}

/** The words in a piece of markup, for carrying into a block that has no markup. */
function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|h[1-6]|div|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Moves a block one place within its own column. */
export function moveBlockWithin(template: Template, blockId: string, delta: number): Template {
  const site = siteOf(template, blockId);
  if (!site) return template;
  const to = site.index + delta;
  if (to < 0 || to >= site.column.blocks.length) return template;
  return mapColumn(template, site.column.id, (column) => {
    const blocks = [...column.blocks];
    const [moved] = blocks.splice(site.index, 1);
    blocks.splice(to, 0, moved!);
    return { ...column, blocks };
  });
}

/**
 * Moves a block into a column at a position — what a drag onto the canvas resolves to.
 *
 * The index is taken against the column *after* the block has been lifted out, when both are the
 * same column. Skipping that correction is the classic off-by-one that makes dragging a block one
 * place down do nothing at all.
 */
export function moveBlockInto(template: Template, blockId: string, columnId: string, index: number): Template {
  const site = siteOf(template, blockId);
  if (!site) return template;
  const block = site.column.blocks[site.index]!;
  // A block that draws its own band cannot share a cell. The canvas offers it a section instead;
  // this is the model refusing to be asked.
  if (!canStack(block)) return template;
  const sameColumn = site.column.id === columnId;
  const target = sameColumn && index > site.index ? index - 1 : index;
  if (sameColumn && target === site.index) return template;

  const lifted = mapColumn(template, site.column.id, (column) => ({
    ...column,
    blocks: column.blocks.filter((b) => b.id !== blockId),
  }));
  const placed = mapColumn(lifted, columnId, (column) => {
    const blocks = [...column.blocks];
    blocks.splice(Math.max(0, Math.min(blocks.length, target)), 0, block);
    return { ...column, blocks };
  });
  // A section emptied by the move goes, exactly as it does on a delete.
  return {
    ...placed,
    sections: placed.sections.filter(worthKeeping),
  };
}

/**
 * Adds a block to one column.
 *
 * Separate from `addSection`, which puts a new block in a full-width section of its own. Without
 * this, splitting a row into two columns produces a second column nothing can be put into — which
 * is a layout tool that can make a shape and not fill it.
 */
export function addBlockToColumn(template: Template, columnId: string, type: BlockType, index?: number): Template {
  if (!canStack({ type })) return template;
  const block = createBlock(type, { id: freshIds(template), taken: takenFieldNames(template) });
  return mapColumn(template, columnId, (column) => {
    const blocks = [...column.blocks];
    blocks.splice(index === undefined ? blocks.length : Math.max(0, Math.min(blocks.length, index)), 0, block);
    return { ...column, blocks };
  });
}

/** Moves one block to another column of the row it is already in. */
export function moveBlockToColumn(template: Template, blockId: string, toIndex: number): Template {
  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) => {
        const from = row.columns.findIndex((c) => c.blocks.some((b) => b.id === blockId));
        const to = Math.max(0, Math.min(row.columns.length - 1, toIndex));
        if (from === -1 || from === to) return row;
        const block = row.columns[from]!.blocks.find((b) => b.id === blockId)!;
        return {
          ...row,
          columns: row.columns.map((c, i) => {
            if (i === from) return { ...c, blocks: c.blocks.filter((b) => b.id !== blockId) };
            if (i === to) return { ...c, blocks: [...c.blocks, block] };
            return c;
          }),
        };
      }),
    })),
  };
}

/**
 * An id generator that cannot collide with anything already in the document. Ids only have to be
 * unique inside one template, so a counter past the current high-water mark is enough and keeps
 * them readable in a diff — which matters, because these files live in a synced folder.
 */
export function freshIds(template: Template): () => string {
  const used = new Set<string>();
  for (const section of template.sections) {
    used.add(section.id);
    for (const row of section.rows) {
      used.add(row.id);
      for (const column of row.columns) {
        used.add(column.id);
        for (const block of column.blocks) used.add(block.id);
      }
    }
  }
  const next = sequentialIds(used.size + 1);
  return () => {
    let id = next();
    while (used.has(id)) id = next();
    used.add(id);
    return id;
  };
}
