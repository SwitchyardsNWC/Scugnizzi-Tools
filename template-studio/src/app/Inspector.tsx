import { CATALOG } from '../model/catalog.ts';
import { isStack, resolve } from '../model/edit.ts';
import { ColumnsPanel } from './inspector/Columns.tsx';
import { GroupPanel } from './inspector/GroupPanel.tsx';
import { FieldFooter, MultiPanel, NothingSelected, StackPanel } from './inspector/panels.tsx';
import { PatternStrip } from './inspector/PatternStrip.tsx';
import type { FreeformUi, PatternInfo } from './inspector/types.ts';
import type { Editor } from './useEditor.ts';

export type { FreeformAppUi, FreeformUi, PatternInfo } from './inspector/types.ts';

// The inspector, generated from the catalog.
//
// Its job is drill-down: a designer selecting a block sees the one thing they came for — Content —
// and finds Appearance, Spacing, Background and the HubSpot lock underneath it, in that order,
// because that is the order they stop caring. Nothing is hidden behind a menu and nothing is
// flattened into a wall of forty controls.
//
// Every control carries a one-line explanation on hover. Jared asked for that explicitly, and it is
// the difference between a designer guessing what "Optional in HubSpot" means and knowing.

export interface InspectorProps {
  editor: Editor;
  patternInfo?: PatternInfo;
  /** More than one block is selected. The panel is about the run, not about any one of them. */
  multi?: { count: number; onDelete(): void; onGroup?(): void };
  /**
   * The Spacing panel is being worked — the pointer is over it, or a dial in it has focus — so
   * the canvas can draw the numbers being changed. See Preview's `spacing`.
   */
  onSpacingHot?(hot: boolean): void;
  /** The freeform surface's editing state, which the canvas shares: the picked layer, and the pen. */
  freeform?: FreeformUi;
  /**
   * Draws the selected block as a picture of itself. Lives in the app because it needs the canvas
   * — the picture is made from what the preview is actually showing, not from a second guess at
   * what the compiler would emit.
   */
  onRasterise?(blockId: string): void;
  /** Whether one is being drawn right now, so the button can say so. */
  rasterising?: boolean;
}

export function Inspector({ editor, onRasterise, rasterising, patternInfo, multi, onSpacingHot, freeform }: InspectorProps) {
  const { template, selection } = editor;
  const found = resolve(template, selection);

  if (selection.kind === 'template' || !found.section) return <NothingSelected />;
  if (multi && multi.count > 1) return <MultiPanel count={multi.count} onDelete={multi.onDelete} {...(multi.onGroup ? { onGroup: multi.onGroup } : {})} />;

  const row = found.section.rows[0];
  const split = (row?.columns.length ?? 0) > 1;
  const grouped = isStack(found.section);
  // Selecting the columns themselves — from the outline, or by clicking the gap between them —
  // shows the row's own settings. They belong to the row, not to whichever block sits inside it.
  if (split && (selection.kind === 'section' || !found.block)) {
    return <ColumnsPanel editor={editor} {...(patternInfo ? { patternInfo } : {})} />;
  }
  // The same for a group: its box, its spacing and its band are the column's and the section's,
  // and selecting the group is how you reach them without going through one of its blocks.
  if (grouped && (selection.kind === 'section' || !found.block)) {
    return <StackPanel editor={editor} {...(patternInfo ? { patternInfo } : {})} {...(onSpacingHot ? { onSpacingHot } : {})} />;
  }

  const block = found.block ?? row?.columns[0]?.blocks[0];
  if (!block) return <p class="empty pad">This section has no block in it.</p>;
  const spec = CATALOG[block.type];

  return (
    <div class="inspector">
      {patternInfo && <PatternStrip info={patternInfo} />}
      {/* The template used to be the root of this trail, and clicking it was the only way back to
          the settings for the whole email. Those live on the left now — the name in Files, the
          page in Design — so the trail is what it says it is: where this block sits. */}
      <nav class="crumbs">
        {/* The row is in the trail when there is one, so a block inside columns says so and gives
            you a way back up to them. A group likewise. */}
        {(split || grouped) && (
          <>
            <button
              class="link"
              title={grouped ? 'The group this block is in: its box, its spacing, its background.' : 'The row of columns this block is in.'}
              onClick={() => editor.select({ kind: 'section', sectionId: found.section!.id })}
            >
              {grouped ? 'Group' : 'Columns'}
            </button>
            <span aria-hidden="true">›</span>
          </>
        )}
        <b>{spec.name}</b>
      </nav>
      <p class="summary">{spec.summary}</p>

      {/* A freeform block's canvas details show only inside the canvas, and its email settings only outside it. */}
      {spec.groups.filter((group) => !group.when || (group.when === 'canvas') === Boolean(freeform?.open)).map((group) => (
        <GroupPanel
          key={`${block.id}-${group.name}`}
          group={group}
          editor={editor}
          {...(onRasterise ? { onRasterise } : {})}
          {...(rasterising ? { rasterising } : {})}
          {...(onSpacingHot ? { onSpacingHot } : {})}
          {...(freeform ? { freeform } : {})}
        />
      ))}

      <FieldFooter editor={editor} />
    </div>
  );
}
