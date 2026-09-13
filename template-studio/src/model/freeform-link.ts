// A freeform block that follows a frame in the Freeform app.
//
// Jared: "I have a freeform frame in the freeform app. It would be cool if I could see and connect this
// freeform block to it." The link runs one way. The Freeform app is where the frame is drawn, and a
// linked block takes its layers, size, background and effects from it whenever it changes. With one place
// to edit, the two can never disagree about which drawing is the real one.
//
// Until the project folder exists, the Freeform app keeps its frame in this site's storage, under the key
// below, as a template holding one freeform block (src/freeform/main.tsx). A link names that key, so when
// frames become files in a project it can name a file instead.

import { createSection } from './catalog.ts';
import { colorOf, DEFAULT_DESIGN_SYSTEM } from './design-system.ts';
import { recipeHash, withFreeform } from './freeform.ts';
import type { Block, FreeformBlock, Template } from './types.ts';

/** Where the Freeform app keeps its frame. The misspelt prefix is every tool's, kept on purpose. */
export const FREEFORM_APP_FRAME = 'scuggnizzi.freeform.v1';

export interface AppFrame {
  key: string;
  name: string;
  /** The frame, as the freeform block the app edits. */
  page: FreeformBlock;
  /** What the frame sits on in the app: its own background, or its section's paper. */
  ground: string;
  /** The recipe hash of the frame as a linked block carries it: a linked block with the same hash is up to date. */
  hash: string;
}

/**
 * The drawing a linked block takes from the frame. A print reads the ground under the page to decide
 * where ink lands, so a frame with effects and no background of its own brings the ground it sits on in
 * the app. Otherwise the same frame would print differently in an email section of another colour. A
 * frame without effects stays transparent, as it is drawn.
 */
function followed(frame: Pick<AppFrame, 'page' | 'ground'>): FreeformBlock {
  const page = frame.page;
  return { ...page, background: page.background ?? (page.effects?.length ? frame.ground : null) };
}

/** The frame the Freeform app is keeping, or null when there is none or it cannot be read. */
export function readAppFrame(raw: string | null, key = FREEFORM_APP_FRAME): AppFrame | null {
  let template: Template | null = null;
  try {
    template = raw ? (JSON.parse(raw) as Template) : null;
  } catch {
    return null;
  }
  const ds = template?.ds ?? DEFAULT_DESIGN_SYSTEM;
  for (const section of template?.sections ?? [])
    for (const row of section.rows ?? [])
      for (const column of row.columns ?? [])
        for (const block of column.blocks ?? []) {
          if (block.type !== 'freeform' || !Array.isArray(block.layers)) continue;
          const ground = colorOf(ds, block.background) ?? section.containerColor ?? section.bandColor ?? '#ffffff';
          return { key, name: template?.name || 'Freeform', page: block, ground, hash: recipeHash(followed({ page: block, ground })) };
        }
  return null;
}

/** Every freeform block in a template that follows a Freeform app frame. */
export function linkedBlocks(template: Template): FreeformBlock[] {
  const out: FreeformBlock[] = [];
  const visit = (b: Block) => {
    if (b.type === 'freeform' && b.source?.app === 'freeform') out.push(b);
  };
  for (const s of template.sections) for (const r of s.rows) for (const c of r.columns) c.blocks.forEach(visit);
  return out;
}

/** The linked block already shows the frame as it is now. */
export const isCurrent = (block: FreeformBlock, frame: AppFrame): boolean => recipeHash(block) === frame.hash;

/**
 * The block made to follow the frame: its drawing replaced by the frame's, and the link recorded. What
 * belongs to the block's place in the email stays — its id, alt text, alignment and rendered picture,
 * which the checks will call stale once the drawing differs.
 */
export function followFrame(template: Template, blockId: string, frame: AppFrame): Template {
  const page = followed(frame);
  return withFreeform(template, blockId, (block) => {
    const { effects: _effects, ...rest } = block;
    void _effects;
    return {
      ...rest,
      width: page.width,
      height: page.height,
      background: page.background,
      layers: page.layers,
      ...(page.effects?.length ? { effects: page.effects } : {}),
      source: { app: 'freeform', key: frame.key },
    };
  });
}

/** Stops following the frame. The drawing stays as it is, to be edited in this block's own canvas again. */
export function unlinkFrame(template: Template, blockId: string): Template {
  return withFreeform(template, blockId, (block) => {
    if (!block.source) return block;
    const { source: _source, ...rest } = block;
    void _source;
    return rest;
  });
}

// --- the other way: from the Freeform app to Template Studio ------------------------------------------------
//
// Jared: "It pulls in the free form frame. but there is no way to go from freeform -> template studio." An
// open Template Studio says so in this site's storage: which tab, which email, whether that email already
// uses the frame. The Freeform app reads it to offer the way there, and asks that tab, by id, to show the
// frame — or to add it, when the email does not use it yet.

export const STUDIO_PRESENCE = 'scuggnizzi.studio.presence';
export const STUDIO_REQUEST = 'scuggnizzi.studio.request';
/**
 * How long an open Template Studio counts as open without saying so again. Generous, because a browser
 * slows a background tab's timers to about once a minute; a closed tab takes its presence with it.
 */
export const PRESENCE_FRESH_MS = 120_000;

export interface StudioPresence {
  tab: string;
  email: string;
  /** Blocks in that email following the Freeform app's frame. */
  linked: number;
  at: number;
}

/** The open Template Studio, or null when none has said so recently. */
export function readStudioPresence(raw: string | null, now = Date.now()): StudioPresence | null {
  try {
    const p = raw ? (JSON.parse(raw) as Partial<StudioPresence>) : null;
    if (!p || typeof p.tab !== 'string' || typeof p.at !== 'number' || now - p.at > PRESENCE_FRESH_MS) return null;
    return { tab: p.tab, email: typeof p.email === 'string' && p.email ? p.email : 'your email', linked: typeof p.linked === 'number' ? p.linked : 0, at: p.at };
  } catch {
    return null;
  }
}

/**
 * The email with a new freeform block following the frame, in a section of its own above the legal
 * footer: where a picture belongs by default, and never under the unsubscribe block. Ids are made from
 * the prefix, which the caller makes unique.
 */
export function addFrameBlock(template: Template, frame: AppFrame, idPrefix: string): { template: Template; sectionId: string; blockId: string } {
  let n = 0;
  const section = createSection('freeform', { id: () => `${idPrefix}${(n += 1)}`, taken: new Set() }, template.ds ?? DEFAULT_DESIGN_SYSTEM);
  const block = section.rows[0]!.columns[0]!.blocks[0]!;
  const footer = template.sections.findIndex((s) => s.rows.some((r) => r.columns.some((c) => c.blocks.some((b) => b.type === 'legal'))));
  const at = footer === -1 ? template.sections.length : footer;
  const placed: Template = { ...template, sections: [...template.sections.slice(0, at), section, ...template.sections.slice(at)] };
  return { template: followFrame(placed, block.id, frame), sectionId: section.id, blockId: block.id };
}
