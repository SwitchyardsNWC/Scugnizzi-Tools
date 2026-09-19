// What is in the project folder, read for the board: emails compiled for their cards with the project's frames
// followed and their pages with effects noted for printing, the frames, the pictures, the documents. One hook,
// `useProjectFiles`, and the shapes it returns. Moved out of Board.tsx as it was (learnings 3.78).

import { useCallback, useRef, useState } from 'preact/hooks';
import type { MutableRef } from 'preact/hooks';
import { compile } from '../compile/compile.ts';
import { DEFAULT_DESIGN_SYSTEM, colorOf, type DesignSystem } from '../model/design-system.ts';
import { recipeHash } from '../model/freeform.ts';
import { materialiseFolderSystem } from '../model/edit.ts';
import { followFrames, linkedBlocks, readAppFrame, type AppFrame } from '../model/freeform-link.ts';
import type { ToolRecipe } from '../model/tool-recipes.ts';
import { docCardId, emailCardId, frameCardId, pictureCardId } from '../model/project.ts';
import type { FreeformBlock, Template } from '../model/types.ts';
import { folderWorkspace, type AssetFile } from '../workspace/workspace.ts';
import { loadKeptPictures } from '../app/kept-pictures.ts';
import { listAssetFolders, listDocuments, listPictures, listRecipes, type DocEntry } from './folder.ts';
import { copyKeptPictures, syncFrames } from './frame-sync.ts';
import { siteStore } from './site-store.ts';
import type { Project } from './useProject.ts';

// --- what is in the folder ------------------------------------------------------------------------------------

export interface EmailItem {
  id: string;
  fileName: string;
  name: string;
  modified: number;
  /** The email as saved, with every block that follows one of the project's frames brought up to that frame. */
  template: Template | null;
  /** The compiled preview, before local pictures are swapped in. */
  html: string;
  /** The frames this email follows, as they were when it was read, so an edit to one of them reads the email again. */
  framesKey: string;
  error?: string;
}

export interface FrameItem {
  id: string;
  key: string;
  name: string;
  savedAt: number;
  fileName: string;
  template: Template;
  frame: AppFrame | null;
}

export interface PictureItem {
  id: string;
  path: string;
  size: number;
  modified: number;
  url: string;
  /** Under `assets/rendered/`: drawn by Template Studio from an email's text. Used by previews, not a card. */
  rendered: boolean;
}

export interface DocItem extends DocEntry {
  id: string;
}

export interface Files {
  emails: EmailItem[];
  frames: FrameItem[];
  pictures: PictureItem[];
  /** Google Docs, Sheets and Slides synced into the folder, and link files (model/docs.ts). */
  docs: DocItem[];
  /** The folders under `assets/`, each a group, whether or not anything is filed in it yet. */
  folders: string[];
  /** What Riso and Ink bleed made, and from what. */
  recipes: ToolRecipe[];
  read: boolean;
  /** How many times the board had changed the folder itself when this was read (see `stale`). */
  epoch: number;
}

/** A freeform page with effects, with what it prints on: the frame's ground, or in an email the paper under the block. */
export interface PrintedPage {
  /** The block in its email; a frame's own page has none. */
  blockId?: string;
  page: FreeformBlock;
  hash: string;
  ground: string;
  ds: DesignSystem;
}

/** One print per recipe on one ground; the count of pictures, since a picture layer draws from them. */
export const printId = (hash: string, ground: string, pictures: number) => `${hash}|${ground}|${pictures}`;

/** The pages with effects in an email, each on the ground Template Studio prints it on (App.tsx). */
export function printedIn(template: Template): PrintedPage[] {
  const ds = template.ds ?? DEFAULT_DESIGN_SYSTEM;
  const out: PrintedPage[] = [];
  for (const s of template.sections)
    for (const r of s.rows)
      for (const c of r.columns)
        for (const b of c.blocks) {
          if (b.type !== 'freeform' || !b.effects?.length) continue;
          const ground = colorOf(ds, b.background) ?? s.containerColor ?? s.bandColor ?? '#ffffff';
          out.push({ blockId: b.id, page: b, hash: recipeHash(b), ground, ds });
        }
  return out;
}

export const NO_FILES: Files = { emails: [], frames: [], pictures: [], docs: [], folders: [], recipes: [], read: false, epoch: 0 };

export function useProjectFiles(project: MutableRef<Project>, notify: (message: string) => void) {
  const [files, setFiles] = useState<Files>(NO_FILES);
  const [kept, setKept] = useState<AssetFile[]>([]);
  const cache = useRef({ emails: new Map<string, EmailItem>(), pictures: new Map<string, PictureItem>(), systems: '' });
  const busy = useRef(false);
  const again = useRef(false);
  /** Goes up whenever the board itself changes the folder, so a read that started before is not trusted. */
  const epoch = useRef(0);
  const keptRef = useRef<AssetFile[] | null>(null);
  const lastFailure = useRef('');

  const refresh = useCallback(async (): Promise<void> => {
    const { dir, info, writable } = project.current;
    if (!dir || !info) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    const started = epoch.current;
    try {
      const ws = folderWorkspace(dir, writable);
      const [list, systems, found, recipes, folders, documents] = await Promise.all([
        ws.list().catch(() => []),
        ws.designSystems().catch(() => ({})),
        listPictures(dir).catch(() => []),
        listRecipes(dir).catch(() => [] as ToolRecipe[]),
        listAssetFolders(dir).catch(() => [] as string[]),
        listDocuments(dir).catch(() => [] as DocEntry[]),
      ]);
      const c = cache.current;

      const pictures = found.map((p) => {
        const old = c.pictures.get(p.path);
        if (old && old.modified === p.modified && old.size === p.size) return old;
        if (old) URL.revokeObjectURL(old.url);
        const item: PictureItem = { id: pictureCardId(p.path), path: p.path, size: p.size, modified: p.modified, url: URL.createObjectURL(p.file), rendered: p.path.startsWith('rendered/') };
        c.pictures.set(p.path, item);
        return item;
      });
      for (const [path, old] of c.pictures) {
        if (found.some((p) => p.path === path)) continue;
        URL.revokeObjectURL(old.url);
        c.pictures.delete(path);
      }

      if (!keptRef.current) {
        keptRef.current = await loadKeptPictures().catch(() => []);
        setKept(keptRef.current);
      }

      // Frames drawn in this browser join the project's files, so the board shows them from the first look. Not
      // into a project made from a type, which starts with its own frames only.
      const synced = await syncFrames(dir, info.id, siteStore(), writable, !info.type);
      if (synced.failed && synced.failed !== lastFailure.current) notify(synced.failed);
      lastFailure.current = synced.failed ?? '';
      if (writable && keptRef.current.length) {
        const copied = await copyKeptPictures(dir, synced.folder, found, keptRef.current);
        if (copied.length) again.current = true;
      }
      const frames: FrameItem[] = synced.folder.map((f) => ({
        id: frameCardId(f.key),
        key: f.key,
        name: f.name,
        savedAt: f.savedAt,
        fileName: f.fileName,
        template: f.template,
        frame: readAppFrame(JSON.stringify(f.template), f.key),
      }));

      const systemsKey = JSON.stringify(systems);
      if (systemsKey !== c.systems) {
        c.emails.clear();
        c.systems = systemsKey;
      }
      // An email that follows a frame shows the frame as it is now, not as it was when the email was last saved in
      // Template Studio; so an email is read again when a frame it follows moves, not only when its own file does.
      // Only the frames it follows: a project with many frames and emails would otherwise re-read every email on
      // every edit to any frame.
      const appFrames = frames.flatMap((f) => (f.frame ? [f.frame] : []));
      const hashOf = new Map(appFrames.map((f) => [f.key, f.hash]));
      const framesKeyOf = (t: Template | null) =>
        t
          ? [...new Set(linkedBlocks(t).flatMap((b) => (b.source ? [b.source.key] : [])))]
              .sort()
              .map((key) => `${key}:${hashOf.get(key) ?? ''}`)
              .join('|')
          : '';
      const emails: EmailItem[] = [];
      for (const file of list) {
        const old = c.emails.get(file.fileName);
        if (old && old.modified === file.modified && old.framesKey === framesKeyOf(old.template)) {
          emails.push(old);
          continue;
        }
        let item: EmailItem;
        try {
          const loaded = await file.load();
          const { template: saved } = materialiseFolderSystem(loaded.template, systems);
          const template = followFrames(saved, appFrames);
          // Annotated, as Studio's preview is: the section marks are what lets a note point at one section (cards.tsx, sectionSpans).
          item = { id: emailCardId(file.fileName), fileName: file.fileName, name: template.name || file.name, modified: file.modified, template, framesKey: framesKeyOf(template), html: compile(template, { mode: 'preview', annotate: true }).html };
        } catch (cause) {
          item = { id: emailCardId(file.fileName), fileName: file.fileName, name: file.name, modified: file.modified, template: null, html: '', framesKey: '', error: cause instanceof Error ? cause.message : `${file.fileName} could not be read.` };
        }
        c.emails.set(file.fileName, item);
        emails.push(item);
      }
      for (const name of [...c.emails.keys()]) if (!list.some((f) => f.fileName === name)) c.emails.delete(name);

      const docs: DocItem[] = documents.map((d) => ({ ...d, id: docCardId(d.path) }));

      // The board moved a file while this read ran, which may have seen both copies or neither: read again rather
      // than lay out what was. Laying it out put a moved picture's old name back on the board.
      if (started !== epoch.current) {
        again.current = true;
        return;
      }
      setFiles({ emails, frames, pictures, docs, folders, recipes, read: true, epoch: started });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'The project folder could not be read.');
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void refresh();
      }
    }
  }, [project, notify]);

  const stale = useCallback(() => {
    epoch.current += 1;
  }, []);
  /** Whether a read has seen every change the board made to the folder: until one has, what it shows is out of date. */
  const current = useCallback((read: Files) => read.epoch === epoch.current, []);

  return { files, kept, refresh, stale, current };
}
