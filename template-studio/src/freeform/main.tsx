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

  // Template Studio's app owns undo; on its own the tool has to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  /** Pictures from the computer, as data URLs so they survive a reload and export without a folder. */
  const addFiles = useCallback((files: FileList | File[], at: { x: number; y: number } | null) => {
    for (const file of [...files].filter((f) => f.type.startsWith('image/'))) {
      const reader = new FileReader();
      reader.onload = () => {
        const asset: AssetFile = { name: file.name, size: file.size, url: String(reader.result) };
        setAssets((old) => [...old.filter((a) => a.name !== asset.name), asset]);
        api.current?.dropAsset(asset, at);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  if (!found) return null;
  const { block } = found;
  const ds = designSystemOf(editor.template);

  const svgText = () => freeformSvg(block, ds);
  const exportSvg = () => download('freeform.svg', new Blob([svgText()], { type: 'image/svg+xml' }));
  const exportPng = () => {
    const scale = 2;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = block.width * scale;
      canvas.height = block.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return notify('This browser would not give me a canvas to draw on.');
      const bg = colorOf(ds, block.background);
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? download('freeform@2x.png', blob) : notify('The picture could not be encoded.')), 'image/png');
    };
    image.onerror = () => notify('The canvas could not be drawn into a picture.');
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText())}`;
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
              <a class="fig-pill fig-back" href="../../index.html" title="Back to Scugnizzi tools">
                <span aria-hidden="true">←</span> Tools
              </a>
            ),
            right: (
              <>
                <button class="fig-pill" title="Add a picture from your computer. Dropping one on the canvas works too." onClick={() => picker.current?.click()}>
                  Image
                </button>
                <button class="fig-pill" title="Start a fresh canvas. Undo from the message brings this one back." onClick={startOver}>
                  New
                </button>
                <button class="fig-pill" title="Download the canvas as SVG" onClick={exportSvg}>
                  SVG
                </button>
                <button class="fig-pill fig-done" title="Download the canvas as a PNG at 2×" onClick={exportPng}>
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
