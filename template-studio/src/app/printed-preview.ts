// Freeform pages printed through their effects, shown on the email canvas.
//
// Jared: "freeform in template studio does not carry the effect back after hitting done." The email
// preview draws a freeform block from its layers as inline SVG, and an effect is pixels, which SVG cannot
// say. So the printed picture takes the drawing's place, here on the preview string, the same way local
// pictures become blob URLs in local-assets.ts. The export is compiled separately and never passes through
// here: it carries the rendered file, as it always has.
//
// Pure. The drawing is found by producing it again with the compiler's own function and design system, so
// a match is exact or there is none, and nothing about the preview's markup has to be guessed.

import { freeformSvg } from '../compile/freeform.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../model/design-system.ts';
import type { Template } from '../model/types.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The preview with each printed freeform page's drawing swapped for its print. `prints` is by block id. */
export function withPrints(html: string, template: Template, prints: Record<string, { url: string }>): string {
  if (Object.keys(prints).length === 0) return html;
  // What compile draws the preview with when no system is passed in.
  const ds = template.ds ?? DEFAULT_DESIGN_SYSTEM;
  let out = html;
  for (const section of template.sections)
    for (const row of section.rows)
      for (const column of row.columns)
        for (const block of column.blocks) {
          if (block.type !== 'freeform' || !block.effects?.length) continue;
          const print = prints[block.id];
          if (!print) continue;
          // `data-sy-freeform` stays, so the canvas still flies from and back to this spot.
          const img = `<img data-sy-freeform="" src="${esc(print.url)}" width="${block.width}" alt="${esc(block.alt)}" style="display:block; max-width:100%; height:auto">`;
          out = out.split(freeformSvg(block, ds)).join(img);
        }
  return out;
}
