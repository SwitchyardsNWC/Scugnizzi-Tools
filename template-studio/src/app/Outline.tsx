import { useEffect, useRef, useState } from 'preact/hooks';

import { CATALOG } from '../model/catalog.ts';
import type { Block, Section } from '../model/types.ts';
import type { Editor } from './useEditor.ts';
import { capture, release } from './pointer.ts';
import { revealInList } from './reveal.ts';
import { BLOCK_ICONS, ColumnsIcon, GroupIcon, TemplateIcon } from './icons.tsx';

// The layer tree.
//
// Jared: "I find the layers panel hard to read / understand the structure of." Three things were
// wrong and they compounded:
//
//   1. **Every row led with its type in words** — `TOP BAR`, `LEGAL FOOTER` — in a mono column
//      beside the name. Two columns of text at similar weight, so a row had to be *read* before it
//      could be recognised, and a column of them had no silhouette. Those words moved to the hover
//      and a glyph took their place.
//   2. **Depth was invisible.** A block inside a column of a two-column row looked like a block in
//      a section looked like a section. Nested lists have a rail down the left now, and a column
//      states its share of the width where it can be scanned.
//   3. **Everything was one colour.** Structure (a row of columns) and content (a heading) read
//      identically. Structure is quieter and wider-tracked now; content carries the weight, because
//      content is what somebody is looking for.
//
// The tree still shows sections rather than the whole Section → Row → Column → Block chain: most
// sections hold one block, and rendering all four levels would be three rows of ceremony per block.
// The chain appears exactly when it means something.

export interface OutlineProps {
  editor: Editor;
  /** What a section's pattern marker says against the folder, for the chip on its row. */
  patternOf?(sectionId: string): 'current' | 'stale' | 'missing' | null;
  /** Blocks selected alongside the primary one, which the tree marks the same way. */
  also?: string[];
}

/** Below this, the pointer has not moved enough to mean a drag, so it is still a click. */
const DRAG_THRESHOLD = 4;

export function Outline({ editor, patternOf, also = [] }: OutlineProps) {
  const { template, selection } = editor;
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  const selectedBlock = selection.kind === 'block' ? selection.blockId : null;
  const selectedSection = selection.kind === 'section' ? selection.sectionId : null;

  // Selecting on the canvas has to move the tree, or half of every selection lands off screen and
  // this panel becomes somewhere to go hunting. Not while dragging: a scroll under a drag changes
  // what is beneath the pointer, which is the one moment the view must hold still.
  useEffect(() => {
    if (drag) return;
    revealInList(list.current);
  }, [selectedBlock, selectedSection, drag]);

  /**
   * Which gap the pointer is over.
   *
   * Measured against the live rectangles rather than tracked as an offset, so it stays correct when
   * the list scrolls mid-drag — which it does, because the list is taller than the pane.
   */
  const gapAt = (clientY: number): number => {
    const rows = [...(list.current?.querySelectorAll('.outline-item') ?? [])];
    for (let i = 0; i < rows.length; i += 1) {
      const box = rows[i]!.getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return i;
    }
    return rows.length;
  };

  return (
    <div class="outline">
      <button
        class={`row row-template ${selection.kind === 'template' ? 'on' : ''}`}
        onClick={() => editor.select({ kind: 'template' })}
        title="Settings for the whole template: its name, the page background, dark-mode handling."
      >
        <TemplateIcon />
        <span class="row-name">{template.name}</span>
        <span class="row-meta">{template.sections.length}</span>
      </button>

      <div class={`outline-list ${drag ? 'dragging' : ''}`} ref={list}>
        {template.sections.map((section, index) => (
          <SectionItem
            key={section.id}
            section={section}
            index={index}
            last={index === template.sections.length - 1}
            editor={editor}
            selectedBlock={selectedBlock}
            selectedSection={selectedSection}
            also={also}
            patternState={patternOf?.(section.id) ?? null}
            dropBefore={drag !== null && drag.over === index}
            onDragStart={(id) => setDrag({ id, over: index })}
            onDragMove={(clientY) => setDrag((d) => (d ? { ...d, over: gapAt(clientY) } : d))}
            onDragEnd={() => {
              if (drag) {
                const from = template.sections.findIndex((s) => s.id === drag.id);
                // Removing the row first shifts every gap after it down by one.
                editor.moveTo(drag.id, drag.over > from ? drag.over - 1 : drag.over);
              }
              setDrag(null);
            }}
          />
        ))}
        {drag && drag.over === template.sections.length && <div class="drop-gap" />}
        {template.sections.length === 0 && (
          <p class="empty">Nothing here yet. Drag a block in from the Blocks tab.</p>
        )}
      </div>
    </div>
  );
}

// --- one section ---------------------------------------------------------------------------------

function SectionItem({
  section,
  index,
  last,
  editor,
  selectedBlock,
  selectedSection,
  also,
  patternState,
  dropBefore,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  section: Section;
  index: number;
  last: boolean;
  editor: Editor;
  selectedBlock: string | null;
  selectedSection: string | null;
  also: string[];
  patternState: 'current' | 'stale' | 'missing' | null;
  dropBefore: boolean;
  onDragStart(id: string): void;
  onDragMove(clientY: number): void;
  onDragEnd(): void;
}) {
  const row = section.rows[0];
  const columns = row?.columns ?? [];
  const blocks = columns.flatMap((c) => c.blocks);
  const origin = useRef<{ y: number; dragging: boolean } | null>(null);

  const split = columns.length > 1;
  // An empty row of columns still shows: somebody dropped it on purpose and has to be able to find
  // it again. An empty single-column section is debris and never exists for long.
  if (!row || (blocks.length === 0 && !split)) return null;

  const lead = blocks[0];
  const solo = !split && blocks.length === 1;
  // A group — one column holding several blocks — is structure too: its row is the group, and the
  // blocks are listed under it. It used to render as its first block with the rest nested beneath,
  // which reads as "one block with children" and is not what a group is (learnings 3.16, 3.59).
  const grouped = !split && blocks.length > 1;
  const structural = split || grouped || !lead;
  const picked = (id: string) => selectedBlock === id || also.includes(id);
  const on = structural ? selectedSection === section.id : Boolean(lead && picked(lead.id));

  // Pointer-based, not the HTML5 drag API (learnings 3.2). A threshold keeps the row clickable:
  // below it this is a selection, above it a move, and the two never have to be told apart by the
  // user. Pointer capture means the drag survives leaving the row and the list scrolling.
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    origin.current = { y: event.clientY, dragging: false };
    capture(event.currentTarget as HTMLElement, event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const from = origin.current;
    if (!from) return;
    if (!from.dragging) {
      if (Math.abs(event.clientY - from.y) < DRAG_THRESHOLD) return;
      from.dragging = true;
      onDragStart(section.id);
    }
    onDragMove(event.clientY);
  };

  const onPointerUp = (event: PointerEvent) => {
    const from = origin.current;
    release(event.currentTarget as HTMLElement, event.pointerId);
    origin.current = null;
    if (from?.dragging) onDragEnd();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') {
      editor.move(section.id, -1);
      event.preventDefault();
    } else if (event.key === 'ArrowDown') {
      editor.move(section.id, 1);
      event.preventDefault();
    }
  };

  const Icon = grouped ? GroupIcon : structural ? ColumnsIcon : BLOCK_ICONS[lead!.type];

  return (
    <div class="outline-item">
      {dropBefore && <div class="drop-gap" />}
      <div class="row-line">
        <button
          class={`row ${structural ? 'row-structural' : ''} ${on ? 'on' : ''}`}
          onClick={() =>
            // Columns are selected as themselves. Their settings belong to the row, not to whichever
            // block happens to be first inside it.
            structural
              ? editor.select({ kind: 'section', sectionId: section.id })
              : editor.select({ kind: 'block', sectionId: section.id, blockId: lead!.id })
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
          title={
            grouped
              ? `A group: ${blocks.length} blocks in one column, sharing its spacing and box.  ·  Drag to reorder, or Alt+↑ / Alt+↓.`
              : structural
                ? `A row of ${columns.length} columns.  ·  Drag to reorder, or Alt+↑ / Alt+↓.`
                : `${CATALOG[lead!.type].name} — ${CATALOG[lead!.type].summary}  ·  Drag to reorder, or Alt+↑ / Alt+↓.`
          }
        >
          <Icon />
          <span class="row-name">{grouped ? 'Group' : structural ? `${columns.length} columns` : nameOf(lead!)}</span>
          {grouped && <span class="row-meta">{blocks.length}</span>}
          {/* Placed from a folder pattern. The chip says which state it is in, and "update" is the
              one worth noticing: the pattern moved on and this copy has not. */}
          {patternState === 'stale' && (
            <span class="chip-mini stale" title="The pattern this was placed from has a newer version. Select it to apply the update or detach.">
              update
            </span>
          )}
          {patternState === 'current' && <span class="chip-mini" title="Placed from a folder pattern, and up to date.">pattern</span>}
          {patternState === 'missing' && (
            <span class="chip-mini" title="Placed from a pattern the folder no longer has. It keeps its content; updates cannot arrive.">
              orphan
            </span>
          )}
          {!structural && editableCount(lead!) > 0 && (
            <span class="row-open" title="The team can edit this in HubSpot." aria-label="Editable in HubSpot" />
          )}
        </button>

        <Actions
          canUp={index > 0}
          canDown={!last}
          onUp={() => editor.move(section.id, -1)}
          onDown={() => editor.move(section.id, 1)}
          onDuplicate={() => editor.duplicate(section.id)}
          onDelete={() => (solo && lead ? editor.removeOne(lead.id) : editor.remove(section.id))}
          deleteTitle={solo ? 'Delete this block.' : grouped ? 'Delete the group and everything in it.' : 'Delete the columns and everything in them.'}
        />
      </div>

      {/* Everything under a section that is more than one block: the rest of its column, or the
          columns themselves. The rail down the left is what makes the depth legible — without it a
          nested block and a top-level one are the same row at a different indent, which reads as
          an accident. */}
      {!solo && (
        <ul class="sub-blocks">
          {columns.map((column, ci) => (
            <li key={column.id}>
              {split && (
                <div class="col-head">
                  <span class="col-tag">Col {ci + 1}</span>
                  <span class="col-share">{Math.round((column.span / (row.columns.reduce((a, c) => a + c.span, 0) || 1)) * 100)}%</span>
                  {column.hideOnPhone && (
                    <span class="chip-mini" title="Dropped below the phone breakpoint">
                      no phone
                    </span>
                  )}
                </div>
              )}
              <ul class="sub-blocks flat">
                {column.blocks.map((block, bi) => {
                  const BlockIcon = BLOCK_ICONS[block.type];
                  return (
                    <li key={block.id}>
                      <div class="row-line">
                        <button
                          class={`row ${picked(block.id) ? 'on' : ''}`}
                          onClick={() => editor.select({ kind: 'block', sectionId: section.id, blockId: block.id })}
                          title={`${CATALOG[block.type].name} — ${CATALOG[block.type].summary}`}
                        >
                          <BlockIcon />
                          <span class="row-name">{nameOf(block)}</span>
                          {editableCount(block) > 0 && (
                            <span class="row-open" title="The team can edit this in HubSpot." aria-label="Editable in HubSpot" />
                          )}
                        </button>
                        <Actions
                          canUp={bi > 0}
                          canDown={bi < column.blocks.length - 1}
                          onUp={() => editor.nudge(block.id, -1)}
                          onDown={() => editor.nudge(block.id, 1)}
                          onDuplicate={() => editor.duplicateOne(block.id)}
                          onDelete={() => editor.removeOne(block.id)}
                          deleteTitle="Delete this block."
                        />
                      </div>
                    </li>
                  );
                })}
                {column.blocks.length === 0 && <li class="col-empty">empty</li>}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The same four actions everywhere, so there is nowhere they are missing. */
function Actions({
  canUp,
  canDown,
  onUp,
  onDown,
  onDuplicate,
  onDelete,
  deleteTitle,
}: {
  canUp: boolean;
  canDown: boolean;
  onUp(): void;
  onDown(): void;
  onDuplicate(): void;
  onDelete(): void;
  deleteTitle: string;
}) {
  return (
    <div class="row-actions">
      <button disabled={!canUp} title="Move up" aria-label="Move up" onClick={onUp}>
        ↑
      </button>
      <button disabled={!canDown} title="Move down" aria-label="Move down" onClick={onDown}>
        ↓
      </button>
      <button title="Duplicate" aria-label="Duplicate" onClick={onDuplicate}>
        ⧉
      </button>
      <button class="danger" title={`${deleteTitle} It happens straight away and offers Undo.`} aria-label="Delete" onClick={onDelete}>
        ✕
      </button>
    </div>
  );
}

/** What a block calls itself in the tree. Falls back to its type when it has nothing to say. */
function nameOf(block: Block): string {
  const label = CATALOG[block.type].outline(block);
  return label === CATALOG[block.type].name ? CATALOG[block.type].name : label;
}

function editableCount(block: Block): number {
  let n = 0;
  if ('lock' in block && block.lock.editable) n += 1;
  if (block.type === 'button' && block.link.editable) n += 1;
  if (block.type === 'legal' && block.noteLock.editable) n += 1;
  return n;
}
