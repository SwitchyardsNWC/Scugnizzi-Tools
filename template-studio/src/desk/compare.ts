/**
 * The desk's drift check: does the template HubSpot holds still match the design it was made from, compiled by this
 * build? Pure, so it is tested under Node (tests/desk.test.ts).
 *
 * Two places a design can come from: the comment inside the file (compile/embed.ts), or a .template.json the viewer
 * attaches for a file exported before the design travelled with it. Either way the comparison is of what HubSpot
 * renders: the design comment comes out of both sides, and the export date is the portal file's own, so a template
 * exported last week is not "different" only because today is a different day.
 */

import { compile } from '../compile/compile.ts';
import { readDesign, withoutDesign } from '../compile/embed.ts';
import { completeDesignSystem, type DesignSystem } from '../model/design-system.ts';
import { materialiseFolderSystem } from '../model/edit.ts';
import { packagedName, planPackage } from '../model/export-package.ts';
import { makerOf, sourceFields } from '../model/hubl-source.ts';
import { importV1 } from '../model/import-v1.ts';
import { migrate } from '../model/schema.ts';
import type { Template } from '../model/types.ts';

/** A design ready to compile: the template with its system on it. */
export interface Design {
  template: Template;
  /** The system it compiles with, when it is not the template's own. */
  ds: DesignSystem | undefined;
  /** Where it came from, in the words the page shows. */
  origin: 'inside' | 'attached';
  /** The suite version that wrote it, for a design read from inside a file. */
  by: string | null;
  warnings: string[];
}

/** The design inside a template's source, ready to compile, or why it cannot be. `null` when there is none. */
export function designInside(source: string): { ok: true; design: Design } | { ok: false; reason: string } | null {
  const read = readDesign(source);
  if (!read) return null;
  if (!read.ok) return read;
  try {
    const template = migrate(read.design.template);
    if (!Array.isArray(template.sections)) return { ok: false, reason: 'The design inside has no sections. It has been edited since export.' };
    const ds = read.design.ds ? completeDesignSystem(read.design.ds) : undefined;
    const design: Design = { template: ds ? { ...template, ds } : template, ds, origin: 'inside', by: read.design.by, warnings: [] };
    // A design that parses can still be one the compiler cannot draw (edited in Design Manager): find out here, once,
    // rather than in the page's render.
    compile(design.template, { mode: 'preview', ...(ds ? { ds } : {}) });
    return { ok: true, design };
  } catch (cause) {
    return { ok: false, reason: `The design inside could not be compiled${cause instanceof Error ? `: ${cause.message}` : ''}. It has been edited since export.` };
  }
}

export interface AttachedFile {
  name: string;
  text: string;
}

/**
 * A design from files the viewer picked: one template (*.template.json, or version one's *.design.json) and any
 * number of design systems (*.system.json). A template that follows a folder system takes the attached system of
 * that name, else the one this build ships with that name, else compiles against the defaults with a warning, as
 * the app does when a folder lacks the system (model/edit.ts).
 */
export function designFromFiles(files: AttachedFile[], shipped: Record<string, DesignSystem>): { ok: true; design: Design } | { ok: false; reason: string } {
  const systems: Record<string, DesignSystem> = { ...shipped };
  const attachedSystems = new Set<string>();
  let template: Template | null = null;
  let templateFile = '';
  const warnings: string[] = [];
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(file.text);
    } catch {
      return { ok: false, reason: `${file.name} is not JSON. Attach the .template.json the app saves, and its .system.json if it follows one.` };
    }
    if (file.name.endsWith('.system.json')) {
      const name = file.name.slice(0, -'.system.json'.length);
      systems[name] = completeDesignSystem(raw);
      attachedSystems.add(name);
      continue;
    }
    const r = raw as { blocks?: unknown; sections?: unknown };
    if (template && (Array.isArray(r.blocks) || Array.isArray(r.sections))) {
      return { ok: false, reason: `${templateFile} and ${file.name} are both templates. Attach one template at a time, with its .system.json.` };
    }
    templateFile = file.name;
    try {
      if (Array.isArray(r.blocks) && !r.sections) {
        const imported = importV1(raw as Parameters<typeof importV1>[0]);
        template = imported.template;
        warnings.push(...imported.warnings);
      } else if (Array.isArray(r.sections)) {
        template = migrate(raw);
      } else {
        return { ok: false, reason: `${file.name} is neither a template nor a design system.` };
      }
    } catch (cause) {
      return { ok: false, reason: `${file.name}: ${cause instanceof Error ? cause.message : 'could not be opened.'}` };
    }
  }
  if (!template) return { ok: false, reason: 'No template among the files. Attach its .template.json.' };
  const opened = materialiseFolderSystem(template, systems);
  if (opened.warning) warnings.push(opened.warning);
  const followed = template.designSystem;
  if (followed && systems[followed] && !attachedSystems.has(followed)) {
    // The folder's own copy is what the app compiled with, and the design panel edits it; the desk only has the one it
    // was built with.
    warnings.push(`Compared against the ${followed} system this desk was built with. If the folder’s ${followed}.system.json has been edited since, attach it too.`);
  }
  const ds = template.designSystem && systems[template.designSystem] ? opened.template.ds : undefined;
  return { ok: true, design: { template: opened.template, ds, origin: 'attached', by: null, warnings } };
}

/** The file this build writes for a design, with the design inside and the date the caller gives. */
export function buildFile(design: Design, options: { date: string; by: string; embed?: boolean }): string {
  return compile(design.template, {
    mode: 'hubl',
    date: options.date,
    embedDesign: options.embed ?? true,
    by: options.by,
    ...(design.ds ? { ds: design.ds } : {}),
  }).html;
}

const normalise = (s: string) =>
  withoutDesign(s)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .trim();

export type DiffLine = { k: 'same' | 'add' | 'del'; text: string };

/**
 * A line diff, longest common subsequence. The compiler writes a block a line, so a template is a few hundred lines
 * at most and the table stays small. Past that it gives up gracefully and reports the files as different.
 */
export function lineDiff(a: string, b: string, limit = 2500): DiffLine[] | null {
  const xs = a.split('\n');
  const ys = b.split('\n');
  // The lines both share at the start and the end need no table, so a long file with one edit still diffs.
  let head = 0;
  while (head < xs.length && head < ys.length && xs[head] === ys[head]) head++;
  let tail = 0;
  while (tail < xs.length - head && tail < ys.length - head && xs[xs.length - 1 - tail] === ys[ys.length - 1 - tail]) tail++;
  const middle = lineDiffCore(xs.slice(head, xs.length - tail), ys.slice(head, ys.length - tail), limit);
  if (!middle) return null;
  const same = (lines: string[]) => lines.map((text) => ({ k: 'same' as const, text }));
  return [...same(xs.slice(0, head)), ...middle, ...same(xs.slice(xs.length - tail))];
}

function lineDiffCore(x: string[], y: string[], limit: number): DiffLine[] | null {
  if (x.length > limit || y.length > limit) return null;
  const n = x.length;
  const m = y.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i]![j] = x[i] === y[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ k: 'same', text: x[i]! });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) out.push({ k: 'del', text: x[i++]! });
    else out.push({ k: 'add', text: y[j++]! });
  }
  while (i < n) out.push({ k: 'del', text: x[i++]! });
  while (j < m) out.push({ k: 'add', text: y[j++]! });
  return out;
}

const PACKED = /get_asset_url\(\s*'\.\/images\/([^']+)'\s*\)/g;

/** The picture files a template points at with `get_asset_url('./images/…')`: what its export packed. */
export function packedFiles(source: string): Set<string> {
  return new Set([...source.matchAll(PACKED)].map((m) => m[1]!));
}

/**
 * A freshly compiled file packed the way HubSpot's copy was: the pictures it shipped beside the template pointed at
 * their copies, any it left as names left as names. Export packs only what the folder had (App.tsx), so this follows
 * the portal's copy rather than packing everything.
 */
export function packLike(fresh: string, portal: string): string {
  const shipped = packedFiles(portal);
  if (!shipped.size) return fresh;
  return planPackage(fresh, (src) => shipped.has(packagedName(src))).html;
}

export interface Comparison {
  same: boolean;
  /** Lines in HubSpot's copy that this build would not write, and lines it would write that HubSpot's lacks. */
  removed: number;
  added: number;
  diff: DiffLine[] | null;
  /** The date compiled with: the portal file's own, when it gave one. */
  date: string;
  /** Whether the closest match came from the packed export (pictures pointing at HubSpot-hosted copies). */
  packed: boolean;
}

/**
 * HubSpot's copy against this build's, for the design given. The app ships two variants of the same file: Export
 * points local pictures at packed copies (`get_asset_url`), Copy leaves them as they are. Both are tried and the
 * closer one reported, so neither route reads as drift.
 */
export function compareWithBuild(portal: string, design: Design, fallbackDate: string): Comparison {
  const date = makerOf(portal).date ?? fallbackDate;
  const fresh = compile(design.template, { mode: 'hubl', date, ...(design.ds ? { ds: design.ds } : {}) }).html;
  const target = normalise(portal);
  const unpacked = normalise(fresh);
  const packed = normalise(packLike(fresh, portal));
  const candidates = packed === unpacked ? [{ packed: false, text: unpacked }] : [{ packed: false, text: unpacked }, { packed: true, text: packed }];
  let best: Comparison | null = null;
  for (const c of candidates) {
    if (c.text === target) return { same: true, removed: 0, added: 0, diff: [], date, packed: c.packed };
    const diff = lineDiff(target, c.text);
    const removed = diff ? diff.filter((d) => d.k === 'del').length : NaN;
    const added = diff ? diff.filter((d) => d.k === 'add').length : NaN;
    if (!best || !(removed + added >= best.removed + best.added)) best = { same: false, removed, added, diff, date, packed: c.packed };
  }
  return best!;
}

/** The diff with long runs of unchanged lines folded, for display. */
export function foldDiff(diff: DiffLine[], context = 2): Array<DiffLine | { k: 'gap'; count: number }> {
  const out: Array<DiffLine | { k: 'gap'; count: number }> = [];
  const keep = diff.map((d, i) => d.k !== 'same' || diff.slice(Math.max(0, i - context), i + context + 1).some((n) => n.k !== 'same'));
  let skipped = 0;
  diff.forEach((d, i) => {
    if (keep[i]) {
      if (skipped) out.push({ k: 'gap', count: skipped });
      skipped = 0;
      out.push(d);
    } else skipped++;
  });
  if (skipped) out.push({ k: 'gap', count: skipped });
  return out;
}

/**
 * Fields HubSpot's copy declares that a replacement does not, and the other way round. Replacing a template keeps an
 * email's content only for the field names both share; a name that goes takes what the team typed into it with it
 * (learnings 1.10). So the desk names them before it offers the file.
 */
export function fieldChanges(portal: string, replacement: string): { lost: string[]; changed: string[]; added: string[] } {
  const before = sourceFields(portal);
  const after = sourceFields(replacement);
  const named = (list: typeof before, name: string) => list.find((f) => f.name === name);
  return {
    lost: before.filter((f) => !named(after, f.name)).map((f) => f.name),
    // Same name, different kind of field: what HubSpot stored under it no longer fits (a picture's src under a module's img).
    changed: before
      .filter((f) => {
        const g = named(after, f.name);
        return g !== undefined && (g.tag !== f.tag || (g.path ?? '') !== (f.path ?? ''));
      })
      .map((f) => f.name),
    added: after.filter((f) => !named(before, f.name)).map((f) => f.name),
  };
}

export type ShownRow = { k: 'gap'; count: number } | { k: 'same' | 'add' | 'del'; text: string };

/**
 * The folded diff as the page shows it: each changed line cut to a window around where it first differs from its
 * partner on the other side, because the compiler writes a block a line and an edit past the first few hundred
 * characters would otherwise show as two rows that read the same.
 */
export function shownRows(diff: DiffLine[], width = 600): ShownRow[] {
  const folded = foldDiff(diff);
  const out: ShownRow[] = [];
  for (let i = 0; i < folded.length; ) {
    const row = folded[i]!;
    if (row.k === 'gap' || row.k === 'same') {
      out.push(row.k === 'same' ? { k: 'same', text: cut(row.text, 0, width) } : row);
      i++;
      continue;
    }
    // One hunk: the run of changed lines, the j-th removed line paired with the j-th added one.
    const hunk: DiffLine[] = [];
    while (i < folded.length && (folded[i]!.k === 'add' || folded[i]!.k === 'del')) hunk.push(folded[i++] as DiffLine);
    const dels = hunk.filter((d) => d.k === 'del');
    const adds = hunk.filter((d) => d.k === 'add');
    for (const d of hunk) {
      const mine = d.k === 'del' ? dels : adds;
      const theirs = d.k === 'del' ? adds : dels;
      const partner = theirs[mine.indexOf(d)]?.text ?? '';
      out.push({ k: d.k, text: cut(d.text, commonPrefix(d.text, partner), width) });
    }
  }
  return out;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function cut(text: string, at: number, width: number): string {
  if (text.length <= width) return text;
  const start = Math.max(0, Math.min(at - Math.floor(width / 3), text.length - width));
  const end = start + width;
  return `${start > 0 ? '… ' : ''}${text.slice(start, end)}${end < text.length ? ' …' : ''}`;
}
