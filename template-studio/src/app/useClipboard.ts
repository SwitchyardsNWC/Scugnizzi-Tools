// Copy and paste.
//
// Through the clipboard events rather than the keys: the events carry the data, they fire for
// the real shortcut in every browser, and text on the system clipboard travels between tabs —
// which is how a block gets from one template to another when only one is open at a time.

import { useCallback, useEffect } from 'preact/hooks';

import { clipText, parseClip } from '../model/clipboard.ts';
import { allBlocks, insertBlocksAt, insertBlocksInColumn, pasteSection, siteOf } from '../model/edit.ts';
import type { Block } from '../model/types.ts';
import type { Notify } from './callbacks.ts';
import { shared } from './placing.ts';
import type { Editor } from './useEditor.ts';

export function useClipboard({
  editor,
  selectedIds,
  notify,
  surfaceOpen,
}: {
  editor: Editor;
  /** Every selected block, primary first, in document order. */
  selectedIds: string[];
  notify: Notify;
  /** Read by the handlers, which are bound once: the canvas has a clipboard of its own. */
  surfaceOpen: { current: boolean };
}) {
  const onClipboard = useCallback(
    (event: ClipboardEvent, kind: 'copy' | 'paste') => {
      // The canvas has a clipboard of its own (Surface.tsx). Nothing copied or pasted in it may reach the email.
      if (surfaceOpen.current) return;
      const data = event.clipboardData;
      if (!data) return;
      const sel = editor.selection;
      if (kind === 'copy') {
        if (sel.kind === 'template') return;
        const section = editor.template.sections.find((s) => s.id === sel.sectionId);
        if (!section) return;
        if (sel.kind === 'section') {
          data.setData('text/plain', clipText({ kind: 'section', section }));
        } else {
          const blocks = allBlocks(editor.template).filter((b) => selectedIds.includes(b.id));
          if (blocks.length === 0) return;
          data.setData('text/plain', clipText({ kind: 'blocks', blocks }));
        }
        event.preventDefault();
        notify(sel.kind === 'section' ? 'Copied the columns.' : `Copied ${selectedIds.length === 1 ? 'the block' : `${selectedIds.length} blocks`}.`);
        return;
      }
      const clip = parseClip(data.getData('text/plain'));
      if (!clip) return; // ordinary text: whatever has focus can have it
      event.preventDefault();
      const sections = editor.template.sections;
      const site = sel.kind === 'block' ? siteOf(editor.template, sel.blockId) : null;
      const sectionIndex = sel.kind === 'template' ? sections.length - 1 : sections.findIndex((s) => s.id === sel.sectionId);
      if (clip.kind === 'section') {
        editor.commit('Paste', pasteSection(editor.template, clip.section, sectionIndex + 1));
        notify('Pasted the columns.');
        return;
      }
      const blocks: Block[] = clip.blocks;
      if (site && shared(site)) {
        editor.commit('Paste', insertBlocksInColumn(editor.template, site.column.id, blocks, site.index + 1));
      } else {
        editor.commit('Paste', insertBlocksAt(editor.template, blocks, sectionIndex + 1));
      }
      notify(`Pasted ${blocks.length === 1 ? 'the block' : `${blocks.length} blocks`}.`);
    },
    [editor, selectedIds, notify, surfaceOpen],
  );

  // The same handlers for the editor's own document, when focus is on a layer row or the canvas
  // pane rather than inside the frame. Not from a field: a field's copy and paste are its own.
  useEffect(() => {
    const guard = (event: ClipboardEvent, kind: 'copy' | 'paste') => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      onClipboard(event, kind);
    };
    const onCopy = (e: ClipboardEvent) => guard(e, 'copy');
    const onPaste = (e: ClipboardEvent) => guard(e, 'paste');
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [onClipboard]);

  return onClipboard;
}
