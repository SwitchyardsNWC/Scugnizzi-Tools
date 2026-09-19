// Freeform pages with effects, printed for the email canvas.
//
// Every page with effects is printed once its recipe settles. Jared: "freeform in template studio does not
// carry the effect back after hitting done" — the canvas printed it, the email drew it plain. Moved out of
// App.tsx as it was (learnings 3.78); the canvas shows a print in the drawing's place through printed-preview.ts.

import { useEffect, useRef, useState } from 'preact/hooks';

import { colorOf } from '../model/design-system.ts';
import { designSystemOf } from '../model/edit.ts';
import { recipeHash } from '../model/freeform.ts';
import type { FreeformBlock, Template } from '../model/types.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { canvasBlob, freeformCanvas } from './picture.ts';

export type Prints = Record<string, { key: string; url: string }>;

/** The prints of `shownTemplate`'s pages with effects, by block id, drawn with the folder's pictures. */
export function usePrints(shownTemplate: Template, allAssets: AssetFile[]): Prints {
  const [prints, setPrints] = useState<Prints>({});
  const printsRef = useRef<Prints>({});
  useEffect(() => {
    const ds = designSystemOf(shownTemplate);
    const names = allAssets.map((a) => a.name).join('|');
    const wanted: Array<{ block: FreeformBlock; ground: string; key: string }> = [];
    for (const s of shownTemplate.sections)
      for (const r of s.rows)
        for (const c of r.columns)
          for (const b of c.blocks) {
            if (b.type !== 'freeform' || !b.effects?.length) continue;
            const ground = colorOf(ds, b.background) ?? s.containerColor ?? s.bandColor ?? '#ffffff';
            wanted.push({ block: b, ground, key: `${recipeHash(b)}|${ground}|${names}` });
          }
    if (wanted.length === 0 && Object.keys(printsRef.current).length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const next: Prints = {};
      const made: string[] = [];
      for (const w of wanted) {
        const old = printsRef.current[w.block.id];
        if (old?.key === w.key) {
          next[w.block.id] = old;
          continue;
        }
        try {
          const blob = await canvasBlob(await freeformCanvas(w.block, ds, { assets: allAssets, scale: 2, ground: w.ground }));
          const url = URL.createObjectURL(blob);
          made.push(url);
          next[w.block.id] = { key: w.key, url };
        } catch {
          // The page stays drawn plain.
        }
        if (cancelled) break;
      }
      if (cancelled) return made.forEach((url) => URL.revokeObjectURL(url));
      for (const [id, p] of Object.entries(printsRef.current)) if (next[id]?.url !== p.url) URL.revokeObjectURL(p.url);
      printsRef.current = next;
      setPrints(next);
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [shownTemplate, allAssets]);
  return prints;
}
