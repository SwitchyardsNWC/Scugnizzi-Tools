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
import { planPackage } from '../model/export-package.ts';
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
    const ds = read.design.ds ? completeDesignSystem(read.design.ds) : undefined;
    return { ok: true, design: { template: ds ? { ...template, ds } : template, ds, origin: 'inside', by: read.design.by, warnings: [] } };
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : 'The design inside could not be opened.' };
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
  let template: Template | null = null;
  const warnings: string[] = [];
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(file.text);
    } catch {
      return { ok: false, reason: `${file.name} is not JSON. Attach the .template.json the app saves, and its .system.json if it follows one.` };
    }
    if (file.name.endsWith('.system.json')) {
      systems[file.name.slice(0, -'.system.json'.length)] = completeDesignSystem(raw);
      continue;
    }
    const r = raw as { blocks?: unknown; sections?: unknown };
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
  const x = a.split('\n');
  const y = b.split('\n');
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
  const packed = normalise(planPackage(fresh).html);
  const candidates = packed === unpacked ? [{ packed: false, text: unpacked }] : [{ packed: false, text: unpacked }, { packed: true, text: packed }];
  let best: Comparison | null = null;
  for (const c of candidates) {
    if (c.text === target) return { same: true, removed: 0, added: 0, diff: [], date, packed: c.packed };
    const diff = lineDiff(target, c.text);
    const removed = diff ? diff.filter((d) => d.k === 'del').length : target.split('\n').length;
    const added = diff ? diff.filter((d) => d.k === 'add').length : c.text.split('\n').length;
    if (!best || removed + added < best.removed + best.added) best = { same: false, removed, added, diff, date, packed: c.packed };
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
export function fieldChanges(portal: string, replacement: string): { lost: string[]; added: string[] } {
  const before = sourceFields(portal).map((f) => f.name);
  const after = sourceFields(replacement).map((f) => f.name);
  return { lost: before.filter((n) => !after.includes(n)), added: after.filter((n) => !before.includes(n)) };
}
