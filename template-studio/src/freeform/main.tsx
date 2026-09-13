// Freeform, as a tool of its own.
//
// Jared: "as a test for how I want to connect the projects in the future. create freeform as it's
// own mini tool. So I can tweak it further."
//
// Not a copy. This page mounts the same `Surface` and the same model as the block inside Template Studio,
// so a tweak to the canvas lands in both. It keeps several frames (model/frame-store.ts). Each is a
// template holding one freeform block, the shape the model already understands, and they are kept in this
// browser's storage until the shared project folder (docs/projects.md) gives them files.

import { render } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { freeformSvg } from '../compile/freeform.ts';
import { createSection } from '../model/catalog.ts';
import { colorOf, DEFAULT_DESIGN_SYSTEM } from '../model/design-system.ts';
import { designSystemOf } from '../model/edit.ts';
import {
  addFrame,
  copyFrameDoc,
  frameName,
  loadFrames,
  newFrameId,
  openFrame,
  removeFrame,
  renameFrame,
  restoreFrame,
  type FrameIndex,
  type KeyValue,
} from '../model/frame-store.ts';
import { blankTemplate } from '../model/starters.ts';
import type { FreeformBlock, Template } from '../model/types.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { canvasBlob, freeformCanvas } from '../app/picture.ts';
import { keepPicture, loadKeptPictures } from '../app/kept-pictures.ts';
import { readStudioPresence, STUDIO_PRESENCE, STUDIO_REQUEST, type StudioPresence } from '../model/freeform-link.ts';
import { Surface, type SurfaceApi } from '../app/Surface.tsx';
import { useEditor } from '../app/useEditor.ts';
import { FramesMenu } from './FramesMenu.tsx';
import '../app/app.css';
import './freeform.css';

/** This site's storage, or a stand-in for the visit when the browser will not give it. */
function siteStore(): KeyValue {
  try {
    localStorage.setItem('scuggnizzi.freeform.probe', '1');
    localStorage.removeItem('scuggnizzi.freeform.probe');
    return localStorage;
  } catch {
    const map = new Map<string, string>();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
  }
}
const store = siteStore();

/** An empty frame. Its ids start with the frame's own, so no two frames' blocks share one. */
function makeFrame(name: string, id: string): Template {
  const base = blankTemplate();
  let n = 0;
  const section = createSection('freeform', { id: () => `${id}-${(n += 1)}`, taken: new Set() }, DEFAULT_DESIGN_SYSTEM);
  return { ...base, name, hubspotLabel: name, sections: [section] };
}

function blockOf(t: Template): { block: FreeformBlock; sectionId: string } | null {
  for (const s of t.sections)
    for (const r of s.rows)
      for (const c of r.columns)
        for (const b of c.blocks) if (b.type === 'freeform') return { block: b, sectionId: s.id };
  return null;
}

/** A frame's drawing from the store, or an empty one when it cannot be read. */
function frameDoc(key: string, name: string): Template {
  try {
    const raw = store.getItem(key);
    if (raw) {
      const t = JSON.parse(raw) as Template;
      if (blockOf(t)) return t;
    }
  } catch {
    // Unreadable: an empty frame rather than none.
  }
  return makeFrame(name, key.split('.').pop() || newFrameId());
}

/** The frames on the way in, with the one the address names open: Template Studio's "Edit in Freeform" says which. */
function startingFrames(): FrameIndex {
  let index = loadFrames(store, makeFrame);
  const params = new URLSearchParams(window.location.search);
  const wanted = params.get('frame');
  if (wanted) {
    index = openFrame(store, index, wanted);
    params.delete('frame');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  }
  return index;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'frame';

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FreeformTool() {
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const notify = useCallback((message: string, undo?: () => void) => {
    setToast(undo ? { message, undo } : { message });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 3600);
  }, []);
  const [frames, setFrames] = useState<FrameIndex>(startingFrames);
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const [initialDoc] = useState(() => {
    const entry = frames.frames.find((f) => f.key === frames.active) ?? frames.frames[0]!;
    return frameDoc(entry.key, entry.name);
  });
  const editor = useEditor({ initial: initialDoc, workspace: null, notify });
  const found = blockOf(editor.template);
  const [layer, setLayer] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const api = useRef<SurfaceApi | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  // Remount the surface whenever a different drawing is on it, so it fits that page.
  const [session, setSession] = useState(0);

  // The open frame's drawing, saved as it changes. A switch of frame loads the new drawing and names the
  // new frame in the same render, so a drawing is never written under another frame's key.
  useEffect(() => {
    try {
      store.setItem(frames.active, JSON.stringify(editor.template));
    } catch {
      // Storage full or blocked: the canvas still works for this visit.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.template]);

  // The selection is always the frame's one block.
  useEffect(() => {
    if (!found) return;
    const sel = editor.selection;
    if (sel.kind !== 'block' || sel.blockId !== found.block.id) editor.select({ kind: 'block', sectionId: found.sectionId, blockId: found.block.id });
  }, [editor, found]);

  // ⌘Z and ⇧⌘Z come with useEditor, which binds them itself. This page once bound them a second time,
  // and every ⌘Z undid two steps.

  // An open Template Studio, if there is one, for the way there (model/freeform-link.ts).
  const readStudio = () => {
    try {
      return readStudioPresence(localStorage.getItem(STUDIO_PRESENCE));
    } catch {
      return null;
    }
  };
  const [studio, setStudio] = useState<StudioPresence | null>(readStudio);
  useEffect(() => {
    const refresh = () => setStudio(readStudio());
    const onStorage = (event: StorageEvent) => {
      if (event.key === STUDIO_PRESENCE) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, []);

  // The pictures kept from earlier visits, before anything is drawn with them.
  useEffect(() => {
    loadKeptPictures()
      .then((kept) => setAssets((old) => [...kept.filter((k) => !old.some((a) => a.name === k.name)), ...old]))
      .catch(() => {
        // No IndexedDB here (a private window, say): pictures last for this visit only.
      });
  }, []);

  /**
   * Pictures from the computer. The layer stores the file's name, the way a picture from a project
   * folder is stored; the file itself is kept in this browser's IndexedDB under that name, so it is
   * still there after a reload.
   */
  const addFiles = useCallback(
    (files: FileList | File[], at: { x: number; y: number } | null) => {
      for (const file of [...files].filter((f) => f.type.startsWith('image/'))) {
        const asset: AssetFile = { name: file.name, size: file.size, url: URL.createObjectURL(file) };
        setAssets((old) => [...old.filter((a) => a.name !== asset.name), asset]);
        keepPicture(file.name, file).catch(() => notify(`${file.name} is on the canvas, but this browser would not keep it for next time.`));
        api.current?.dropAsset(asset, at);
      }
    },
    [notify],
  );

  if (!found) return null;
  const { block } = found;
  const activeEntry = frames.frames.find((f) => f.key === frames.active) ?? frames.frames[0]!;

  // --- frames ----------------------------------------------------------------------------------------------

  /** Puts another frame's drawing on the canvas. Undo history is the frame's own, so it starts again. */
  const show = (next: FrameIndex, doc: Template) => {
    setFrames(next);
    editor.load(doc, null);
    setLayer(null);
    setSession((n) => n + 1);
  };
  const openKey = (key: string) => {
    if (key === frames.active) return;
    const next = openFrame(store, frames, key);
    const entry = next.frames.find((f) => f.key === key);
    if (entry) show(next, frameDoc(entry.key, entry.name));
  };
  const newFrame = () => {
    const id = newFrameId();
    const name = frameName(frames);
    const doc = makeFrame(name, id);
    show(addFrame(store, frames, name, doc, id), doc);
  };
  const duplicateKey = (key: string) => {
    const entry = frames.frames.find((f) => f.key === key);
    if (!entry) return;
    const id = newFrameId();
    const name = frameName(frames, `${entry.name} copy`.replace(/ copy copy$/, ' copy'));
    const doc = copyFrameDoc(key === frames.active ? editor.template : frameDoc(key, entry.name), id, name);
    show(addFrame(store, frames, name, doc, id), doc);
  };
  const renameKey = (key: string, name: string) => setFrames(renameFrame(store, frames, key, name));
  const removeKey = (key: string) => {
    const { index, removed } = removeFrame(store, frames, key);
    if (!removed) return notify('The last frame stays: there is always one to draw on.');
    if (key === frames.active) {
      const entry = index.frames.find((f) => f.key === index.active)!;
      show(index, frameDoc(entry.key, entry.name));
    } else setFrames(index);
    notify(`Deleted ${removed.entry.name}.`, () => show(restoreFrame(store, framesRef.current, removed), frameDoc(removed.entry.key, removed.entry.name)));
  };

  // --- to Template Studio ----------------------------------------------------------------------------------

  const inEmail = Boolean(studio?.keys.includes(frames.active));

  /** To Template Studio: the open one, by request, or a new one with this frame already in the email. */
  const toStudio = () => {
    let presence: StudioPresence | null = null;
    try {
      presence = readStudioPresence(localStorage.getItem(STUDIO_PRESENCE));
    } catch {
      presence = null;
    }
    if (presence) {
      try {
        localStorage.setItem(STUDIO_REQUEST, JSON.stringify({ action: 'link', key: frames.active, tab: presence.tab, at: Date.now() }));
      } catch {
        return notify('This browser would not pass the frame along. Open Template Studio from the dashboard.');
      }
      // Opened from Template Studio: close this tab, and that one is where you land.
      let opener: Window | null = null;
      try {
        opener = window.opener && !window.opener.closed && String(window.opener.location.pathname).endsWith('/index.html') ? window.opener : null;
      } catch {
        opener = null;
      }
      if (opener) {
        try {
          opener.focus();
        } catch {
          // Focus is the browser's to give.
        }
        window.setTimeout(() => window.close(), 300);
        return;
      }
      return notify(
        presence.keys.includes(frames.active)
          ? `${activeEntry.name} is in ${presence.email}. Switch to the Template Studio tab to see it.`
          : `Sent ${activeEntry.name} to ${presence.email}, above the footer. Switch to the Template Studio tab to see it.`,
      );
    }
    const url = new URL(`index.html?freeform=link&frame=${encodeURIComponent(frames.active)}`, window.location.href).href;
    // Freeform saves as it goes, so opening Template Studio in this same tab loses nothing.
    if (!window.open(url, '_blank')) window.location.href = url;
  };

  // --- export ----------------------------------------------------------------------------------------------

  const ds = designSystemOf(editor.template);
  // What the page sits on. A plain export keeps a transparent page; a print needs paper under it.
  const section = editor.template.sections.find((s) => s.id === found.sectionId);
  const ground = colorOf(ds, block.background) ?? section?.containerColor ?? section?.bandColor ?? '#ffffff';
  const printed = Boolean(block.effects?.length);
  const fileBase = slug(activeEntry.name);
  const failed = (cause: unknown) => notify(cause instanceof Error ? cause.message : 'The picture could not be drawn.');
  const exportPng = async () => {
    try {
      const canvas = await freeformCanvas(block, ds, { assets, scale: 2, ground: printed ? ground : (colorOf(ds, block.background) ?? 'rgba(0,0,0,0)') });
      download(`${fileBase}@2x.png`, await canvasBlob(canvas));
    } catch (cause) {
      failed(cause);
    }
  };
  const exportSvg = async () => {
    if (!printed) return download(`${fileBase}.svg`, new Blob([freeformSvg(block, ds)], { type: 'image/svg+xml' }));
    // A print is pixels, which SVG cannot describe: the printed picture goes inside it as an image.
    try {
      const canvas = await freeformCanvas(block, ds, { assets, scale: 2, ground });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${block.width}" height="${block.height}" viewBox="0 0 ${block.width} ${block.height}"><image href="${canvas.toDataURL('image/png')}" width="${block.width}" height="${block.height}"/></svg>`;
      download(`${fileBase}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
    } catch (cause) {
      failed(cause);
    }
  };

  return (
    <div class="app ff-app">
      <main
        class="ff-stage"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (!e.dataTransfer?.files.length) return;
          e.preventDefault();
          addFiles(e.dataTransfer.files, { x: e.clientX, y: e.clientY });
        }}
      >
        <Surface
          key={`${frames.active}:${session}`}
          editor={editor}
          blockId={block.id}
          assets={assets}
          layer={layer}
          onSelectLayer={setLayer}
          onDone={() => setLayer(null)}
          api={api}
          standalone={{
            left: (
              <>
                <a class="fig-pill fig-back" href="../../index.html" title="Back to Scugnizzi tools">
                  <span aria-hidden="true">←</span> Tools
                </a>
                <FramesMenu
                  frames={frames}
                  ds={ds}
                  assets={assets}
                  activeDoc={editor.template}
                  docOf={(key) => frameDoc(key, frames.frames.find((f) => f.key === key)?.name ?? 'Frame')}
                  linkedKeys={studio?.keys ?? []}
                  onOpen={openKey}
                  onNew={newFrame}
                  onDuplicate={duplicateKey}
                  onRename={renameKey}
                  onRemove={removeKey}
                />
                <button
                  class="fig-pill fig-studio"
                  title={
                    studio
                      ? inEmail
                        ? `Template Studio has ${activeEntry.name} in ${studio.email}. Go to it.`
                        : `Template Studio is open with ${studio.email}. Add ${activeEntry.name} to it, above the footer.`
                      : `Open Template Studio with ${activeEntry.name} in the email, above the footer. It follows the frame from then on.`
                  }
                  onClick={toStudio}
                >
                  <span class={`fig-studio-dot ${studio ? 'live' : ''}`} aria-hidden="true" />
                  {studio ? (inEmail ? `In ${studio.email}` : `Send to ${studio.email}`) : 'Use in Template Studio'}
                  <span aria-hidden="true">↗</span>
                </button>
              </>
            ),
            right: (
              <>
                <button class="fig-pill" title="Add a picture from your computer. Dropping one on the canvas works too." onClick={() => picker.current?.click()}>
                  Image
                </button>
                <button class="fig-pill" title="Download this frame as SVG" onClick={() => void exportSvg()}>
                  SVG
                </button>
                <button class="fig-pill fig-done" title="Download this frame as a PNG at 2×, printed through its effects" onClick={() => void exportPng()}>
                  Export PNG
                </button>
              </>
            ),
          }}
        />
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const input = e.currentTarget;
            if (input.files) addFiles(input.files, null);
            input.value = '';
          }}
        />
        {toast && (
          <div class="ff-toast" role="status">
            {toast.message}
            {toast.undo && (
              <button
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const root = document.getElementById('app');
if (root) render(<FreeformTool />, root);
