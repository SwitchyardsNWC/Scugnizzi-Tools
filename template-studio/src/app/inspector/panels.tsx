// The whole-pane states: nothing selected, several blocks selected, a group selected as itself, and the footer under a block.

import { CATALOG, GROUP_GROUPS } from '../../model/catalog.ts';
import { resolve } from '../../model/edit.ts';
import type { Lock } from '../../model/types.ts';
import type { Editor } from '../useEditor.ts';
import { GroupPanel } from './GroupPanel.tsx';
import { PatternStrip } from './PatternStrip.tsx';
import type { PatternInfo } from './types.ts';

/**
 * The right pane when nothing is selected.
 *
 * It used to hold the template's settings — its two names, the page background, force light — and
 * that was the last thing in the app contradicting the rule the rest of it now follows: the left
 * rail is what is true of the whole template, the right pane is what is selected. Those settings
 * are global, so they went left. The name is in Files, which is the panel that lists templates;
 * the page is in Design › Page / layout, which is the panel about the page.
 *
 * What is left is an empty state, and an empty state that names the thing to do is worth more than
 * a panel of controls that happened to have nowhere else to live.
 */
export function NothingSelected() {
  return (
    <div class="inspector">
      <p class="summary empty-pane">
        Nothing selected. Click a block on the canvas, or pick one from Layers, and its content and
        spacing appear here.
        <br />
        <br />
        Settings for the whole email are on the left: its name in <b>Files</b>, and its type,
        colour and page in <b>Design</b>.
      </p>
    </div>
  );
}

/**
 * More than one block is selected. There is nothing to edit about a run; what there is to do with
 * one is move it, copy it and delete it, and the keys do those.
 */
export function MultiPanel({ count, onDelete, onGroup }: { count: number; onDelete(): void; onGroup?(): void }) {
  return (
    <div class="inspector">
      <nav class="crumbs">
        <b>{count} blocks</b>
      </nav>
      <p class="summary">
        Selected together. <kbd>⌥↑</kbd> <kbd>⌥↓</kbd> move the run, <kbd>⌘C</kbd> copies it, <kbd>⌫</kbd> deletes it. Shift-click or{' '}
        <kbd>⇧↑</kbd> <kbd>⇧↓</kbd> to change what is in it.
      </p>
      <div class="controls">
        {onGroup && (
          <div class="field wide">
            <button
              class="btn wide"
              title="Put these blocks in one column: one box, one gutter, one band behind them, with the space between them from Design › Between blocks. ⌘G does the same; ⇧⌘G undoes it."
              onClick={onGroup}
            >
              Group into one column
            </button>
          </div>
        )}
        <div class="field wide">
          <button class="btn wide" title="Delete every selected block. It happens straight away and offers Undo." onClick={onDelete}>
            Delete {count} blocks
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A group — one column holding several blocks — selected as itself.
 *
 * What there is to set on it is the column's and the section's: the box around all of the blocks,
 * the space around and between them, the band behind. The panels are the same ones a block shows
 * for those things, because they edit the same nodes; what is different is that here they are
 * plainly the group's, with no block in the trail to suggest otherwise.
 */
export function StackPanel({ editor, patternInfo, onSpacingHot }: { editor: Editor; patternInfo?: PatternInfo; onSpacingHot?(hot: boolean): void }) {
  const found = resolve(editor.template, editor.selection);
  const section = found.section;
  const column = found.column;
  if (!section || !column) return null;
  const kinds = column.blocks.map((b) => CATALOG[b.type].name.toLowerCase());

  return (
    <div class="inspector">
      {patternInfo && <PatternStrip info={patternInfo} />}
      <nav class="crumbs">
        <b>Group</b>
      </nav>
      <p class="summary" title="Drop a block onto the middle of any of them to add to the group; its top or bottom edge for a section of its own.">
        {column.blocks.length} blocks in one column: {kinds.join(', ')}.
      </p>

      {GROUP_GROUPS.map((group) => (
        <GroupPanel key={`${section.id}-${group.name}`} group={group} editor={editor} {...(onSpacingHot ? { onSpacingHot } : {})} />
      ))}

      <div class="controls">
        <div class="field wide">
          <button
            class="btn wide"
            title="One section per block again. The page keeps its look — each piece takes the gap that was under it — and only the structure changes. ⇧⌘G."
            onClick={() => editor.ungroup(section.id)}
          >
            Ungroup
          </button>
        </div>
      </div>
    </div>
  );
}

export function FieldFooter({ editor }: { editor: Editor }) {
  const { template, selection } = editor;
  const found = resolve(template, selection);
  const block = found.block;
  if (!block) return null;

  const locks: Lock[] = [];
  if ('lock' in block) locks.push(block.lock);
  if (block.type === 'button') locks.push(block.link);
  if (block.type === 'legal') locks.push(block.noteLock);
  const open = locks.filter((l) => l.editable);

  return (
    <p class="inspector-foot">
      {open.length === 0
        ? 'Nothing here is editable in HubSpot. The template renders all of it.'
        : `In HubSpot the team sees: ${open.map((l) => l.label).join(', ')}.`}
    </p>
  );
}
