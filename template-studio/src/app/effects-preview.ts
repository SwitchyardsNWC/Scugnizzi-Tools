// How the canvas shows a page's effects while it is being worked on.
//
// Jared: "for effects that lag the system have a preview/fast mode." A print is made in the browser, pixel by
// pixel, and at the screen's resolution (up to 4×) a Riso or ink bleed page can take a second. So the canvas can
// print a quick draft at the page's own size first, and the sharp one after the work stops.
//
// - Auto: a draft first whenever the last sharp print was slow (or none has been timed yet), then the sharp
//   one once things settle. A light page goes straight to sharp.
// - Fast: drafts only. The canvas never sharpens; export is always full quality.
// - Full: the sharp print every time, as before.
//
// Every distance in the press is in page pixels, so a draft is the same picture, only softer.

export type EffectsPreview = 'auto' | 'fast' | 'full';
export const EFFECTS_PREVIEWS: readonly EffectsPreview[] = ['auto', 'fast', 'full'];

/** A sharp print slower than this, in ms, makes Auto draft first. */
export const SLOW_PRINT_MS = 200;
/** A draft is printed at the page's own size. */
export const DRAFT_SCALE = 1;
/** How long after the last change each print starts, in ms. */
export const DRAFT_DELAY = 50;
export const SHARP_DELAY = 120;
/** After a draft, the sharp print waits for the work to pause this long. */
export const SETTLE_DELAY = 900;

export interface PrintPass {
  scale: number;
  delay: number;
  draft: boolean;
}

/** The scale the screen needs: its pixels at this zoom, between 2× and 4×. */
export const sharpScale = (zoom: number, dpr: number): number => Math.min(4, Math.max(2, Math.ceil(zoom * (dpr || 1))));

/** The prints to make after a change, in order. */
export function printPasses(mode: EffectsPreview, lastSharpMs: number | null, sharp: number): PrintPass[] {
  if (mode === 'full') return [{ scale: sharp, delay: SHARP_DELAY, draft: false }];
  const draft = { scale: DRAFT_SCALE, delay: DRAFT_DELAY, draft: true };
  if (mode === 'fast') return [draft];
  if (lastSharpMs !== null && lastSharpMs <= SLOW_PRINT_MS) return [{ scale: sharp, delay: SHARP_DELAY, draft: false }];
  return [draft, { scale: sharp, delay: SETTLE_DELAY, draft: false }];
}
