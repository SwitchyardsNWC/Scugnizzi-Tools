// The board's notes for the email open in Template Studio, and the one thing Studio may do to them: resolve.
//
// Jared: "make the way to view them in the template studio", then "a final state of 'resolved' for the notes. and
// that can be changed in the template studio and canvas." Notes are the board's, in the project's board.json
// (model/project.ts, BoardNote); this reads that file from the open folder and keeps the notes left on this email,
// looked at again on focus and every few seconds, the way the board itself watches the folder. Resolving reads the
// file once more and writes it back with that one note changed, so nothing else on the board is touched.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { BOARD_FILE, boardJson, emailCardId, readBoard, updateNote, type BoardNote } from '../model/project.ts';
import { readText, writeFile } from '../project/folder.ts';
import type { Workspace } from '../workspace/workspace.ts';

export function useBoardNotes(workspace: Workspace | null, fileName: string | null): { notes: BoardNote[]; setResolved(id: string, resolved: boolean): Promise<void> } {
  const [notes, setNotes] = useState<BoardNote[]>([]);
  const dir = workspace?.kind === 'folder' ? workspace.handle : undefined;
  const lastText = useRef<string | null>(null);
  const read = useCallback(async () => {
    if (!dir || !fileName) return;
    const id = emailCardId(fileName);
    const found = await readText(dir, BOARD_FILE).catch(() => null);
    const text = found?.text ?? '';
    if (text === lastText.current) return;
    lastText.current = text;
    const mine = readBoard(text || null).notes.filter((n) => n.on === id);
    // Open ones first, top to bottom as they sit on the board; resolved ones after, the latest resolved first.
    mine.sort((a, b) => (a.resolvedAt ? 1 : 0) - (b.resolvedAt ? 1 : 0) || (a.resolvedAt && b.resolvedAt ? b.resolvedAt - a.resolvedAt : a.y - b.y || b.at - a.at));
    setNotes(mine);
  }, [dir, fileName]);
  useEffect(() => {
    lastText.current = null;
    if (!dir || !fileName) {
      setNotes([]);
      return;
    }
    void read();
    const onFocus = () => void read();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void read();
    }, 5000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [dir, fileName, read]);
  const setResolved = useCallback(
    async (id: string, resolved: boolean) => {
      if (!dir) return;
      const found = await readText(dir, BOARD_FILE).catch(() => null);
      const board = readBoard(found?.text ?? null);
      if (!board.notes.some((n) => n.id === id)) return;
      await writeFile(dir, BOARD_FILE, boardJson(updateNote(board, id, { resolvedAt: resolved ? Date.now() : 0 })));
      lastText.current = null;
      await read();
    },
    [dir, read],
  );
  return { notes, setResolved };
}
