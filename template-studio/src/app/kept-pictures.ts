// Pictures dropped into the Freeform app, kept between visits in this browser's IndexedDB.
//
// IndexedDB rather than the storage the canvas itself lives in: a photograph is megabytes, and that
// storage holds about five of them for the whole site. Keyed by file name, which is what an image layer
// names. The Freeform app writes here; Template Studio reads here too, so a block linked to a Freeform
// frame shows that frame's pictures (model/freeform-link.ts).

import type { AssetFile } from '../workspace/workspace.ts';

const PICTURES = 'scuggnizzi-freeform';

function pictureStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(PICTURES, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('pictures');
    open.onsuccess = () => resolve(open.result.transaction('pictures', mode).objectStore('pictures'));
    open.onerror = () => reject(open.error ?? new Error('IndexedDB would not open.'));
  });
}

export async function keepPicture(name: string, blob: Blob): Promise<void> {
  const store = await pictureStore('readwrite');
  await new Promise<void>((resolve, reject) => {
    const put = store.put(blob, name);
    put.onsuccess = () => resolve();
    put.onerror = () => reject(put.error ?? new Error('The picture could not be kept.'));
  });
}

/** Every kept picture, each as a blob URL the caller owns. */
export async function loadKeptPictures(): Promise<AssetFile[]> {
  const store = await pictureStore('readonly');
  return new Promise((resolve, reject) => {
    const out: AssetFile[] = [];
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const at = cursor.result;
      if (!at) return resolve(out);
      const blob = at.value as Blob;
      out.push({ name: String(at.key), size: blob.size, url: URL.createObjectURL(blob) });
      at.continue();
    };
    cursor.onerror = () => reject(cursor.error ?? new Error('The kept pictures could not be read.'));
  });
}
