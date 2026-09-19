// The Freeform app's frames, followed live in Template Studio, and the pictures the app keeps.
//
// Its tab writes to this site's storage on every change, and this tab hears it: the frames are read on load, on
// every storage event of the app's, and on focus. Linked blocks follow their frames as they change, a burst of
// changes being one undo step; a block whose frame was deleted keeps the drawing it has. Moved out of App.tsx as
// it was (learnings 3.80).

import { useEffect, useRef, useState, type MutableRef } from 'preact/hooks';

import { followFrame, isCurrent, linkedBlocks, readAppFrames, type AppFrame, type FrameScope } from '../model/freeform-link.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { loadKeptPictures } from './kept-pictures.ts';
import type { Editor } from './useEditor.ts';

/** One string for a set of frames, so two reads that saw the same frames compare equal. */
const framesKey = (frames: AppFrame[]) => frames.map((f) => `${f.key}:${f.hash}:${f.name}`).join('|');
/** The Freeform app's frames, from this site's storage; none when it cannot be read. */
export function readFreeformFrames(scope: FrameScope | null = null, keep: string[] = []): AppFrame[] {
  try {
    return readAppFrames((key) => localStorage.getItem(key), scope, keep);
  } catch {
    return [];
  }
}

export function useAppFrames(editor: Editor, frameScope: FrameScope | null, frameScopeRef: MutableRef<FrameScope | null>): { appFrames: AppFrame[]; kept: AssetFile[] } {
  const [appFrames, setAppFrames] = useState<AppFrame[]>(readFreeformFrames);
  /** Pictures the Freeform app keeps (kept-pictures.ts), so a block linked to its frame shows them. */
  const [kept, setKept] = useState<AssetFile[]>([]);

  // The Freeform app's frames, followed live: its tab writes on every change, and this tab hears it.
  const framesSignature = framesKey(appFrames);
  // Frames this email already follows stay listed whatever project they belong to, so a link is never hidden.
  const followedKeys = useRef<string[]>([]);
  followedKeys.current = linkedBlocks(editor.template).flatMap((b) => (b.source ? [b.source.key] : []));
  useEffect(() => {
    const next = readFreeformFrames(frameScope, followedKeys.current);
    setAppFrames((old) => (framesKey(old) === framesKey(next) ? old : next));
  }, [frameScope]);
  useEffect(() => {
    const read = () => {
      const next = readFreeformFrames(frameScopeRef.current, followedKeys.current);
      setAppFrames((old) => (framesKey(old) === framesKey(next) ? old : next));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith('scuggnizzi.freeform.')) read();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', read);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', read);
    };
  }, []);

  // The pictures the Freeform app keeps, read again whenever a frame changes, since that is when one may have been dropped.
  useEffect(() => {
    let cancelled = false;
    loadKeptPictures()
      .then((list) => {
        if (cancelled) return list.forEach((p) => URL.revokeObjectURL(p.url));
        setKept((old) => {
          old.forEach((p) => URL.revokeObjectURL(p.url));
          return list;
        });
      })
      .catch(() => {
        // No IndexedDB here: a linked frame's pictures show as missing.
      });
    return () => {
      cancelled = true;
    };
  }, [framesSignature]);

  // Linked blocks follow their frames. A burst of changes in the Freeform tab is one undo step here. A block
  // whose frame was deleted keeps the drawing it has.
  useEffect(() => {
    let next = editor.template;
    for (const b of linkedBlocks(next)) {
      const frame = appFrames.find((f) => f.key === b.source?.key);
      if (frame && !isCurrent(b, frame)) next = followFrame(next, b.id, frame);
    }
    if (next !== editor.template) editor.commit('Update from Freeform', next, { coalesce: 'freeform-link' });
  }, [appFrames, editor]);

  return { appFrames, kept };
}
