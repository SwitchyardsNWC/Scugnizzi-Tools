// What the board does to the files themselves: putting a picture into a frame or an email, an email
// following a frame, taking a link back out, and copies.
//
// Jared: "if I drag it into a frame or email, add it to that item. like i'm dropping it into the frame.
// make the ability to break a node/link an item." The board draws lines for what is in what; these are
// the edits that make and unmake those lines. Each returns the changed document and the board writes
// it where it lives, so Template Studio and Freeform see the change the way they see any other save.
//
// Pure.

import { createSection } from './catalog.ts';
import { DEFAULT_DESIGN_SYSTEM } from './design-system.ts';
import { allBlocks, removeBlocks } from './edit.ts';
import type { FrameFile } from './frame-file.ts';
import { addImageLayerAt } from './freeform.ts';
import { addFrameBlock, linkedBlocks, unlinkFrame, type AppFrame } from './freeform-link.ts';
import type { Block, FreeformBlock, ImageBlock, Template } from './types.ts';

/** The freeform block a frame file is: the first block of its first section. */
export function frameBlock(template: Template): FreeformBlock | null {
  const block = template.sections[0]?.rows[0]?.columns[0]?.blocks[0];
  return block && block.type === 'freeform' ? block : null;
}

/** Every HubSpot field name a template already uses, so a new block's cannot collide. */
function fieldNames(template: Template): Set<string> {
  const out = new Set<string>();
  for (const block of allBlocks(template)) {
    if ('lock' in block && block.lock?.field) out.add(block.lock.field);
    if (block.type === 'button' && block.link?.field) out.add(block.link.field);
    if (block.type === 'legal' && block.noteLock?.field) out.add(block.noteLock.field);
  }
  return out;
}

/** `photos/hero-shot.png` → `hero shot`, for an image block's alt text until someone writes a better one. */
export const altFor = (src: string): string =>
  (src.split('/').pop() ?? src)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

/** Where a picture goes in an email: a section of its own above the legal footer, never under the unsubscribe block. */
function aboveFooter(template: Template): number {
  const footer = template.sections.findIndex((s) => s.rows.some((r) => r.columns.some((c) => c.blocks.some((b) => b.type === 'legal'))));
  return footer === -1 ? template.sections.length : footer;
}

/** The email with the picture as an image block of its own, above the footer. Ids come from the prefix. */
export function addPictureToEmail(template: Template, src: string, idPrefix: string): Template {
  let n = 0;
  const section = createSection('image', { id: () => `${idPrefix}${(n += 1)}`, taken: fieldNames(template) }, template.ds ?? DEFAULT_DESIGN_SYSTEM);
  const at = aboveFooter(template);
  const withPicture = {
    ...section,
    rows: section.rows.map((r) => ({
      ...r,
      columns: r.columns.map((c) => ({ ...c, blocks: c.blocks.map((b): Block => (b.type === 'image' ? ({ ...b, src, alt: altFor(src) } as ImageBlock) : b)) })),
    })),
  };
  return { ...template, sections: [...template.sections.slice(0, at), withPicture, ...template.sections.slice(at)] };
}

/** The frame with the picture dropped in, fitted to at most half the page and centred. */
export function addPictureToFrame(template: Template, src: string, natural: { width: number; height: number }): Template {
  const block = frameBlock(template);
  return block ? addImageLayerAt(template, block.id, src, natural, null) : template;
}

/** The email following the frame, in a section of its own above the footer. */
export const addFrameToEmail = (template: Template, frame: AppFrame, idPrefix: string): Template => addFrameBlock(template, frame, idPrefix).template;

/**
 * Everything in a template that shows the picture, gone: image blocks with that source, and image layers with it
 * in any freeform block. A section left empty goes with them. `removed` says how many, so a picture that was not
 * there after all changes nothing.
 */
export function removePictureFrom(template: Template, src: string): { template: Template; removed: number } {
  const imageIds = allBlocks(template)
    .filter((b) => b.type === 'image' && b.src === src)
    .map((b) => b.id);
  let removed = imageIds.length;
  let next = imageIds.length ? removeBlocks(template, imageIds) : template;
  next = {
    ...next,
    sections: next.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) => ({
        ...r,
        columns: r.columns.map((c) => ({
          ...c,
          blocks: c.blocks.map((b): Block => {
            if (b.type !== 'freeform') return b;
            const kept = b.layers.filter((l) => !(l.kind === 'image' && l.src === src));
            removed += b.layers.length - kept.length;
            return kept.length === b.layers.length ? b : { ...b, layers: kept };
          }),
        })),
      })),
    })),
  };
  return { template: removed ? next : template, removed };
}

/** The email no longer following the frame: every block that did keeps its drawing and lets go of the link. */
export function unfollowFrame(template: Template, frameKey: string): { template: Template; unlinked: number } {
  const followers = linkedBlocks(template).filter((b) => b.source?.key === frameKey);
  let next = template;
  for (const b of followers) next = unlinkFrame(next, b.id);
  return { template: next, unlinked: followers.length };
}

/** A recipe without one of its sources, so the board draws no line from that picture to what was made. */
export function dropSourceFromRecipe(raw: unknown, source: string): { value: unknown; changed: boolean } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: raw, changed: false };
  const recipe = raw as Record<string, unknown>;
  const before = Array.isArray(recipe['sources']) ? (recipe['sources'] as unknown[]) : null;
  if (!before) return { value: raw, changed: false };
  const sources = before.filter((s) => s !== `assets/${source}`);
  return sources.length === before.length ? { value: raw, changed: false } : { value: { ...recipe, sources }, changed: true };
}

/** A frame copied as a new frame: a key of its own, "Name copy", saved now. */
export function duplicateFrameFile(frame: FrameFile, key: string, now = Date.now(), name = `${frame.name} copy`): FrameFile {
  return { key, name, savedAt: now, template: { ...frame.template, name, hubspotLabel: name } };
}
