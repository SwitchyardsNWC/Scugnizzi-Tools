// The board's notes for the email open in Template Studio.
//
// Jared: "make the way to view them in the template studio." Notes are the board's, in the project's board.json
// (model/project.ts, BoardNote); this reads that file from the open folder and keeps the notes left on this email,
// looked at again on focus and every few seconds, the way the board itself watches the folder.

import { useEffect, useState } from 'preact/hooks';

import { BOARD_FILE, emailCardId, readBoard, type BoardNote } from '../model/project.ts';
import { readText } from '../project/folder.ts';
import type { Workspace } from '../workspace/workspace.ts';

export function useBoardNotes(workspace: Workspace | null, fileName: string | null): BoardNote[] {
  const [notes, setNotes] = useState<BoardNote[]>([]);
  const dir = workspace?.kind === 'folder' ? workspace.handle : undefined;
  useEffect(() => {
    if (!dir || !fileName) {
      setNotes([]);
      return;
    }
    const id = emailCardId(fileName);
    let cancelled = false;
    let lastText: string | null = null;
    const read = async () => {
      const found = await readText(dir, BOARD_FILE).catch(() => null);
      if (cancelled) return;
      const text = found?.text ?? '';
      if (text === lastText) return;
      lastText = text;
      const mine = readBoard(text || null).notes.filter((n) => n.on === id);
      // Top to bottom as they sit on the board, the newest first among equals.
      mine.sort((a, b) => a.y - b.y || b.at - a.at);
      setNotes(mine);
    };
    void read();
    const onFocus = () => void read();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void read();
    }, 5000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [dir, fileName]);
  return notes;
}
