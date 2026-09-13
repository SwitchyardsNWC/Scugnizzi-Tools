// Freeform, as a tool of its own.
//
// Jared: "as a test for how I want to connect the projects in the future. create freeform as it's
// own mini tool. So I can tweak it further."
//
// Not a copy. This page mounts the same `Surface`, the same `Inspector` and the same model as the
// block inside Template Studio, so a tweak to the canvas lands in both. The document it edits is a
// template holding one freeform block — the shape the model already understands — kept in this
// browser's storage until the shared project folder (docs/projects.md) gives it a file.

import { render } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { freeformSvg } from '../compile/freeform.ts';
import { createSection } from '../model/catalog.ts';
import { colorOf, DEFAULT_DESIGN_SYSTEM } from '../model/design-system.ts';
import { designSystemOf } from '../model/edit.ts';
import { blankTemplate } from '../model/starters.ts';
import type { FreeformBlock, Template } from '../model/types.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { canvasBlob, freeformCanvas } from '../app/picture.ts';
import { keepPicture, loadKeptPictures } from '../app/kept-pictures.ts';
import { readStudioPresence, STUDIO_PRESENCE, STUDIO_REQUEST, type StudioPresence } from '../model/freeform-link.ts';
import { Surface, type SurfaceApi } from '../app/Surface.tsx';
import { useEditor } from '../app/useEditor.ts';
import '../app/app.css';
import './freeform.css';

/** The same prefix every Scugnizzi tool stores under (kept misspelt on purpose — renaming it loses saved work). */
const STORE = 'scuggnizzi.freeform.v1';

function fresh(): Template {
  const base = blankTemplate();
  let n = 0;
  const section = createSection('freeform', { id: () => `ff${(n += 1)}`, taken: new Set() }, DEFAULT_DESIGN_SYSTEM);
  return { ...base, name: 'Freeform', hubspotLabel: 'Freeform', sections: [section] };
}

function stored(): Template {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const t = JSON.parse(raw) as Template;
      if (blockOf(t)) return t;
    }
  } catch {
    // Unreadable or blocked storage: start clean rather than not at all.
  }
  return fresh();
}

function blockOf(t: Template): { block: FreeformBlock; sectionId: string } | null {
  for (const s of t.sections)
    for (const r of s.rows)
      for (const c of r.columns)
        for (const b of c.blocks) if (b.type === 'freeform') return { block: b, sectionId: s.id };
  return null;
}

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
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 3200);
  }, []);
  const editor = useEditor({ initial: stored(), workspace: null, notify });
  const found = blockOf(editor.template);
  const [layer, setLayer] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const api = useRef<SurfaceApi | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  // Remount the surface on New, so it fits the fresh page.
  const [session, setSession] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(editor.template));
    } catch {
      // Storage full or blocked — the canvas still works for this visit.
    }
  }, [editor.template]);

  // The Inspector follows the selection; here the selection is always the one block.
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
   * still there after a reload. The first version kept it only in memory, and a reload left the layer
   * pointing at nothing.
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

  /** To Template Studio: the open one, by request, or a new one with the frame already in the email. */
  const toStudio = () => {
    let presence: StudioPresence | null = null;
    try {
      presence = readStudioPresence(localStorage.getItem(STUDIO_PRESENCE));
    } catch {
      presence = null;
    }
    if (presence) {
      try {
        localStorage.setItem(STUDIO_REQUEST, JSON.stringify({ action: 'link', key: STORE, tab: presence.tab, at: Date.now() }));
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
      return notify(presence.linked ? `Your frame is in ${presence.email}. Switch to the Template Studio tab to see it.` : `Sent to ${presence.email}, above the footer. Switch to the Template Studio tab to see it.`);
    }
    const url = new URL('index.html?freeform=link', window.location.href).href;
    // Freeform saves as it goes, so opening Template Studio in this same tab loses nothing.
    if (!window.open(url, '_blank')) window.location.href = url;
  };
  const ds = designSystemOf(editor.template);

  // What the page sits on. A plain export keeps a transparent page; a print needs paper under it.
  const section = editor.template.sections.find((s) => s.id === found.sectionId);
  const ground = colorOf(ds, block.background) ?? section?.containerColor ?? section?.bandColor ?? '#ffffff';
  const printed = Boolean(block.effects?.length);
  const failed = (cause: unknown) => notify(cause instanceof Error ? cause.message : 'The picture could not be drawn.');
  const exportPng = async () => {
    try {
      const canvas = await freeformCanvas(block, ds, { assets, scale: 2, ground: printed ? ground : (colorOf(ds, block.background) ?? 'rgba(0,0,0,0)') });
      download('freeform@2x.png', await canvasBlob(canvas));
    } catch (cause) {
      failed(cause);
    }
  };
  const exportSvg = async () => {
    if (!printed) return download('freeform.svg', new Blob([freeformSvg(block, ds)], { type: 'image/svg+xml' }));
    // A print is pixels, which SVG cannot describe: the printed picture goes inside it as an image.
    try {
      const canvas = await freeformCanvas(block, ds, { assets, scale: 2, ground });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${block.width}" height="${block.height}" viewBox="0 0 ${block.width} ${block.height}"><image href="${canvas.toDataURL('image/png')}" width="${block.width}" height="${block.height}"/></svg>`;
      download('freeform.svg', new Blob([svg], { type: 'image/svg+xml' }));
    } catch (cause) {
      failed(cause);
    }
  };
  const startOver = () => {
    const before = editor.template;
    editor.load(fresh(), null);
    setLayer(null);
    setSession((n) => n + 1);
    notify('Started a new canvas.', () => {
      editor.load(before, null);
      setSession((n) => n + 1);
    });
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
          key={session}
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
                <button
                  class="fig-pill fig-studio"
                  title={
                    studio
                      ? studio.linked
                        ? `Template Studio has this frame in ${studio.email}. Go to it.`
                        : `Template Studio is open with ${studio.email}. Add this frame to it, above the footer.`
                      : 'Open Template Studio with this frame in the email, above the footer. It follows the frame from then on.'
                  }
                  onClick={toStudio}
                >
                  <span class={`fig-studio-dot ${studio ? 'live' : ''}`} aria-hidden="true" />
                  {studio ? (studio.linked ? `In ${studio.email}` : `Send to ${studio.email}`) : 'Use in Template Studio'}
                  <span aria-hidden="true">↗</span>
                </button>
              </>
            ),
            right: (
              <>
                <button class="fig-pill" title="Add a picture from your computer. Dropping one on the canvas works too." onClick={() => picker.current?.click()}>
                  Image
                </button>
                <button class="fig-pill" title="Start a fresh canvas. Undo from the message brings this one back." onClick={startOver}>
                  New
                </button>
                <button class="fig-pill" title="Download the canvas as SVG" onClick={() => void exportSvg()}>
                  SVG
                </button>
                <button class="fig-pill fig-done" title="Download the canvas as a PNG at 2×, printed through its effects" onClick={() => void exportPng()}>
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
