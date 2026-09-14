// A row of columns: its panel when the row itself is selected, and the field a block in it shows.

import { useState } from 'preact/hooks';

import { COLUMN_BLOCKS } from '../../compile/blocks/index.ts';
import { CATALOG } from '../../model/catalog.ts';
import { designSystemOf, RATIOS, resolve, shareSpans } from '../../model/edit.ts';
import type { BlockType } from '../../model/types.ts';
import { nameOf } from '../ColorSlot.tsx';
import type { Editor } from '../useEditor.ts';
import { PatternStrip } from './PatternStrip.tsx';
import type { PatternInfo } from './types.ts';

/** The whole panel for a row of columns, which is a thing you select rather than a block setting. */
export function ColumnsPanel({ editor, patternInfo }: { editor: Editor; patternInfo?: PatternInfo }) {
  const found = resolve(editor.template, editor.selection);
  const row = found.row;
  if (!row) return null;

  const ds = designSystemOf(editor.template);
  return (
    <div class="inspector">
      {patternInfo && <PatternStrip info={patternInfo} />}
      {/* No template root in the trail — the block panel lost its own for the same reason: what is
          true of the whole email lives on the left now, and a crumb that deselects is not a way up. */}
      <nav class="crumbs">
        <b>Columns</b>
      </nav>
      <p class="summary" title="Drop blocks into them from the Blocks tab, or drag one in from elsewhere in the email.">
        {row.columns.length} columns side by side.
      </p>

      <section class="panel open">
        <div class="panel-head static">Layout</div>
        <div class="panel-body">
          <ColumnsField editor={editor} />
        </div>
      </section>

      <section class="panel open">
        <div class="panel-head static" title="A preset moves the band, the container, the text colour and the link colour together.">
          Background
        </div>
        <div class="panel-body">
          <div class="controls">
            <div class="field">
              <label>Background</label>
              {/* The template's own presets, not the shipped ones. This read `DEFAULT_DESIGN_SYSTEM`
                  — the fifth copy of a list that lives elsewhere (learnings 3.48): a preset added in
                  Design never appeared here, and one renamed there broke the picker. */}
              <select
                value={found.section?.theme ?? ''}
                onChange={(e) => editor.set('section.theme', (e.target as HTMLSelectElement).value)}
              >
                {Object.keys(ds.themes).map((key) => (
                  <option key={key} value={key}>
                    {nameOf(key)}
                  </option>
                ))}
                {found.section?.theme && !ds.themes[found.section.theme] && (
                  <option value={found.section.theme}>{found.section.theme} (missing)</option>
                )}
              </select>
            </div>
          </div>
        </div>
      </section>

      <p class="inspector-foot" title="Deleting the columns deletes what is in them. Everything here is one undo step.">
        Deleting the columns deletes what is in them.
      </p>
    </div>
  );
}

/**
 * Count, ratio, phone behaviour, and what is in each column.
 *
 * That order because it is the order the decisions are made in. The ratios are a short list rather
 * than sliders summing to twelve: a designer wants a half, a third or a quarter, and the ones in
 * between are mostly a way to end up with a 5/7 split nobody chose.
 */
export function ColumnsField({ editor }: { editor: Editor }) {
  const found = resolve(editor.template, editor.selection);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const row = found.row;
  const block = found.block;
  const section = found.section;
  if (!row || !section) return null;

  const spans = row.columns.map((c) => c.span);
  const count = row.columns.length;
  const current = spans.join('-');
  const here = block ? row.columns.findIndex((c) => c.blocks.some((b) => b.id === block.id)) : -1;

  return (
    <div class="field wide columnsbox">
      <div class="seg" role="group" aria-label="Number of columns">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            class={`seg-btn ${count === n ? 'on' : ''}`}
            aria-pressed={count === n}
            title={
              n === 1
                ? 'One full-width column, which is what every block starts as.'
                : `${n} columns side by side, stacking on phones unless you say otherwise.`
            }
            onClick={() => editor.setColumns(row.id, RATIOS[n]![0]!)}
          >
            {n}
          </button>
        ))}
      </div>

      {count > 1 && (
        <>
          <label class="sub">Ratio</label>
          {/* Each column's share, typed. The others give or take in proportion so the row still
              adds up; the divider on the canvas does the same by dragging. */}
          <div class="ratio-inputs" title="Each column's share of the row. Change one and the others adjust to keep the total. The divider between columns on the canvas does the same by dragging.">
            {spans.map((s, i) => (
              <span key={row.columns[i]!.id} class="ratio-input">
                <input
                  type="number"
                  min={10}
                  max={100 - 10 * (count - 1)}
                  value={Math.round((s / (spans.reduce((a, b) => a + b, 0) || 1)) * 100)}
                  aria-label={`Column ${i + 1} share`}
                  onChange={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    if (Number.isFinite(v)) editor.resizeColumns(row.id, shareSpans(spans, i, v));
                  }}
                />
                <span>%</span>
              </span>
            ))}
          </div>
          <div class="ratios">
            {(RATIOS[count] ?? []).map((option) => (
              <button
                key={option.join('-')}
                class={`ratio ${option.join('-') === current ? 'on' : ''}`}
                title={option.map((n) => `${Math.round((n / 12) * 100)}%`).join(' · ')}
                onClick={() => editor.setColumns(row.id, option)}
              >
                {option.map((n, i) => (
                  <span key={i} style={{ flexGrow: n }} />
                ))}
              </button>
            ))}
          </div>

          <label class="sub">On phones</label>
          <select
            value={row.mobile}
            title="Side by side is right for two small things — a pair of logos, two short buttons. Anything with a paragraph in it wants to stack."
            onChange={(e) => editor.set('row.mobile', (e.target as HTMLSelectElement).value)}
          >
            <option value="stack">Stack, full width each</option>
            <option value="side-by-side">Stay side by side</option>
          </select>

          <label class="sub">Columns</label>
          <ul class="collist">
            {row.columns.map((column, i) => (
              <li key={column.id} class={here === i ? 'on' : ''}>
                <div class="collist-row">
                  <span class="collist-n">{i + 1}</span>
                  <span class="collist-what">
                    {column.blocks.length === 0
                      ? 'empty'
                      : column.blocks.length === 1
                        ? '1 block'
                        : `${column.blocks.length} blocks`}
                  </span>
                  <label class="toggle mini" title="Drop this column below the phone breakpoint. The others take the full width.">
                    <input
                      type="checkbox"
                      checked={Boolean(column.hideOnPhone)}
                      onChange={(e) =>
                        editor.commit(
                          'Hide on phones',
                          setColumnFlag(editor, column.id, (e.target as HTMLInputElement).checked),
                        )
                      }
                    />
                    <span>Hide on phones</span>
                  </label>
                  <button
                    class="link tiny"
                    aria-expanded={addingTo === column.id}
                    title={`Add a block to column ${i + 1}.`}
                    onClick={() => setAddingTo((v) => (v === column.id ? null : column.id))}
                  >
                    {addingTo === column.id ? 'close' : '+ block'}
                  </button>
                  {block && here !== i && (
                    <button
                      class="link tiny"
                      title={`Move the selected block into column ${i + 1}.`}
                      onClick={() => editor.moveToColumn(block.id, i)}
                    >
                      move here
                    </button>
                  )}
                </div>
                {addingTo === column.id && (
                  <div class="colmenu">
                    {/* Only the blocks that can live in a column. The top bar, the stripes and the
                        legal footer each draw their own full-width band, so they are not offered
                        here and the compiler refuses them too. */}
                    {COLUMN_BLOCKS.map((type: BlockType) => (
                      <button
                        key={type}
                        title={CATALOG[type].summary}
                        onClick={() => {
                          editor.addToColumn(section.id, column.id, type);
                          setAddingTo(null);
                        }}
                      >
                        {CATALOG[type].name}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** A column flag, by column id rather than by selection — the row edits columns it is not in. */
function setColumnFlag(editor: Editor, columnId: string, hideOnPhone: boolean) {
  return {
    ...editor.template,
    sections: editor.template.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) => ({
        ...r,
        columns: r.columns.map((c) => (c.id === columnId ? { ...c, hideOnPhone } : c)),
      })),
    })),
  };
}
