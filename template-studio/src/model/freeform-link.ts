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
