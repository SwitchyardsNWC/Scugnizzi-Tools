// Patterns: a section saved to the folder, placed elsewhere as a copy that remembers where it came from.
//
// The files are the workspace's; with no folder open they still exist for the session, so the
// feature can be tried before there is anywhere to keep it.

import { useCallback, useMemo, type Dispatch, type StateUpdater } from 'preact/hooks';

import { CATALOG } from '../model/catalog.ts';
import {
  applyPattern,
  detachPattern,
  instanceOf,
  patternFromSection,
  placePattern,
  pushPattern,
  type Pattern,
} from '../model/patterns.ts';
import { fileSlug, serializePattern } from '../model/serialize.ts';
import type { Workspace } from '../workspace/workspace.ts';
import type { Failed, Notify } from './callbacks.ts';
import type { PatternInfo } from './Inspector.tsx';
import type { PatternCard } from './Palette.tsx';
import type { Editor } from './useEditor.ts';

export function usePatterns({
  editor,
  workspace,
  patterns,
  setPatterns,
  notify,
  failed,
}: {
  editor: Editor;
  workspace: Workspace | null;
  patterns: Pattern[];
  setPatterns: Dispatch<StateUpdater<Pattern[]>>;
  notify: Notify;
  failed: Failed;
}) {
  const writePatternFile = useCallback(
    async (pattern: Pattern) => {
      if (workspace) await workspace.writePattern(pattern, serializePattern(pattern));
      setPatterns((old) => [...old.filter((p) => p.id !== pattern.id), pattern].sort((a, b) => a.name.localeCompare(b.name)));
    },
    [workspace, setPatterns],
  );

  const patternCards = useMemo<PatternCard[]>(
    () =>
      patterns.map((p) => {
        const blocks = p.section.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks));
        const kinds = [...new Set(blocks.map((b) => CATALOG[b.type].name))].join(', ');
        return { id: p.id, name: p.name, summary: `A saved section: ${blocks.length === 1 ? kinds : `${blocks.length} blocks — ${kinds}`}. Version ${p.version}.` };
      }),
    [patterns],
  );

  const placePatternAt = useCallback(
    (id: string, index: number | null) => {
      const pattern = patterns.find((p) => p.id === id);
      if (!pattern) return;
      const next = placePattern(editor.template, pattern, index ?? editor.template.sections.length);
      const created = next.sections.find((s) => !editor.template.sections.some((old) => old.id === s.id));
      // The block when there is one to select, the section when the pattern is a row of columns.
      // A single-column section selected *as* a section shows the block's panel with every value
      // undefined — the dead-panel shape from learnings 3.50, and the third place it has appeared.
      const row = created?.rows[0];
      const first = row && row.columns.length === 1 ? row.columns[0]!.blocks[0] : undefined;
      editor.commit(
        'Place pattern',
        next,
        created
          ? { select: first ? { kind: 'block', sectionId: created.id, blockId: first.id } : { kind: 'section', sectionId: created.id } }
          : {},
      );
    },
    [editor, patterns],
  );

  /** The selected section's standing with the folder's patterns, and the verbs. */
  const patternInfo = useMemo<PatternInfo | undefined>(() => {
    const sel = editor.selection;
    if (sel.kind === 'template') return undefined;
    const section = editor.template.sections.find((s) => s.id === sel.sectionId);
    if (!section) return undefined;
    const state = instanceOf(section, patterns);
    const run = async (label: string, work: () => Promise<void>) => {
      try {
        await work();
      } catch (cause) {
        failed(cause, `Could not write the pattern file for ${label}. Check the folder is still there and writable.`);
      }
    };
    return {
      name: state?.pattern?.name ?? null,
      instance: Boolean(state),
      stale: Boolean(state?.stale),
      missing: Boolean(state?.missing),
      onApply: () => {
        if (!state?.pattern) return;
        const next = applyPattern(editor.template, section.id, state.pattern);
        // The update gives the section's blocks new ids, so the selection has to be re-pointed or
        // the next key acts on a block that no longer exists — which is how shift-arrow once
        // landed on the top bar.
        const row = next.sections.find((s) => s.id === section.id)?.rows[0];
        const first = row && row.columns.length === 1 ? row.columns[0]!.blocks[0] : undefined;
        editor.commit('Apply pattern update', next, {
          select: first ? { kind: 'block', sectionId: section.id, blockId: first.id } : { kind: 'section', sectionId: section.id },
        });
      },
      onDetach: () => editor.commit('Detach from pattern', detachPattern(editor.template, section.id)),
      onPush: () => {
        if (!state?.pattern) return;
        const pushed = pushPattern(editor.template, section.id, state.pattern);
        if (!pushed) return;
        void run(state.pattern.name, async () => {
          await writePatternFile(pushed.pattern);
          editor.commit('Push pattern', pushed.template);
          notify(`${pushed.pattern.name} is now version ${pushed.pattern.version}. Other placements will offer the update.`);
        });
      },
      onSave: (name: string) => {
        const made = patternFromSection(editor.template, section.id, name);
        if (!made) return;
        void run(name, async () => {
          await writePatternFile(made.pattern);
          editor.commit('Save as pattern', made.template);
          notify(
            workspace?.canWrite
              ? `Saved as patterns/${fileSlug(name)}.pattern.json. It is in Blocks now, for any template in the folder.`
              : `${name} is in Blocks for this session. Open a folder to keep patterns with the templates.`,
          );
        });
      },
    };
  }, [editor, patterns, writePatternFile, notify, workspace, failed]);

  const patternOf = useCallback(
    (sectionId: string): 'current' | 'stale' | 'missing' | null => {
      const section = editor.template.sections.find((s) => s.id === sectionId);
      const state = section ? instanceOf(section, patterns) : null;
      if (!state) return null;
      return state.missing ? 'missing' : state.stale ? 'stale' : 'current';
    },
    [editor.template, patterns],
  );

  return { patternCards, placePatternAt, patternInfo, patternOf };
}
