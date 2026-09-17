// The compiler entry point.
//
// Pure and DOM-free, so it runs under Node and under test (acceptance.md §1). The shape is:
//
//     document -> IR tree -> colour pass -> serialize (preview | hubl) -> document shell
//
// The colour pass sits between building and serializing on purpose: by then the tree is complete,
// so the registry sees every colour exactly once and the dark-mode layers are a pure function of
// what the design actually used rather than of what someone remembered to register (learnings 2.6).

import { collectColors, className, emptyRegistry, register, type Registry } from './colors.ts';
import { createContext } from './context.ts';
import { annotation, emailDocument as shell, forceLightHead, headCss } from './head.ts';
import { el, frag, raw, text, type IRNode } from './ir.ts';
import { blockParts, COLUMN_BLOCKS, renderBlock } from './blocks/index.ts';
import { cell, columnsRow, COLUMN_PHONE_CSS, section as sectionOf, type ColumnCell } from './layout.ts';
import { boxOf, gapOf, padClass, paddingOf, type BuildContext } from './context.ts';
import type { Block, Column, Row, Section } from '../model/types.ts';
import { hasDndArea } from '../model/dnd.ts';
import { defaultBranch, serialize, type Branch, type Mode } from './serialize.ts';
import { esc } from './escape.ts';
import { DEFAULT_DESIGN_SYSTEM, type DesignSystem } from '../model/design-system.ts';
import type { Template } from '../model/types.ts';

export interface CompileOptions {
  mode: Mode;
  /**
   * Overrides the design system the template carries. Only tests and the token preview pass it;
   * ordinary compilation reads `template.ds`, falling back to the defaults for any document that
   * has never opened the design panel.
   */
  ds?: DesignSystem;
  /** Which branches the preview takes. Ignored in `hubl` mode, where every branch is emitted. */
  branch?: Branch;
  /** Stamped into the generated-by comment. Passed in so output is reproducible under test. */
  date?: string;

  /**
   * Tag each block's markup with `data-sy-block="<id>"`, so clicking the canvas can find its way
   * back to a block in the document.
   *
   * Editor-only and opt-in: the exported template is the product, and it should carry nothing that
   * exists for the tool's convenience. A test asserts the attribute never appears without this
   * flag, and the same goes for the empty-column slots.
   */
  annotate?: boolean;
}

export interface CompileResult {
  html: string;
  /** The tree, after the colour pass. The linter and the branch enumerator both want this. */
  tree: IRNode;
  registry: Registry;
  /** Bytes of the emitted document. Gmail clips at ~102KB (learnings 2.12). */
  bytes: number;
  branch: Branch;
}

export function compile(template: Template, options: CompileOptions): CompileResult {
  const ds = options.ds ?? template.ds ?? DEFAULT_DESIGN_SYSTEM;
  const ctx = createContext(ds, template.preview);
  const pageBackground = template.pageBackground || ds.pageBackground;

  // Row by row, because a row is what decides whether its blocks each get a full-width band of
  // their own or share one. A single-column row holding one block is every template written before
  // columns existed, and takes exactly the path it always did — which is what keeps the golden file
  // honest. A single column holding *several* is a stack: one band, one padded cell, one box, with
  // the blocks in rows inside it (learnings 3.59).
  const annotate = options.annotate ?? false;
  const rendered_blocks = template.sections.flatMap((section) =>
    section.rows.flatMap((row) => {
      if (row.columns.length > 1) return [renderColumns(row, section, ctx, annotate)];
      const column = row.columns[0];
      if (!column) return [];
      return runsOf(column.blocks).map((run) => {
        if (run.length > 1) {
          const stack = stackOf(run, column, section, ctx, annotate);
          const band = sectionOf(stack.cell, { ds: ctx.ds, band: section.bandColor, container: section.containerColor });
          return frag([...stack.declarations, band]);
        }
        const block = run[0]!;
        const node = renderBlock(block, section, column, ctx);
        return annotate ? tag(node, block.id, section.id, !COLUMN_BLOCKS.includes(block.type)) : node;
      });
    }),
  );
  // A blank line between blocks, so the exported file is readable if anyone opens it.
  const body = frag(rendered_blocks.flatMap((node, i) => (i === 0 ? [node] : [raw('\n\n'), node])));

  // The page background is registered first so it leads the generated rules, and because it is
  // applied by the shell rather than by any node in the tree — it would otherwise be missed.
  const registry = emptyRegistry();
  register(registry, 'bg', pageBackground);
  collectColors(body, registry);

  const branch = options.branch ?? defaultBranch(body);
  const rendered = serialize(body, { mode: options.mode, branch });

  // Only the exported file gets HubSpot's drag-and-drop stylesheet tag: in a preview the HubL has
  // already been substituted away, and a literal `{{ dnd_area_stylesheet }}` in the canvas head
  // would be text nobody asked for.
  const dndArea = options.mode === 'hubl' && hasDndArea(template);

  const head =
    (template.forceLight ? forceLightHead(registry, pageBackground, ds) : '') +
    headCss({ ds, pageBackground, mobile: ctx.mobile, inlineCss: ctx.inlineCss, dndArea });

  const html =
    shell({
      ds,
      // HubSpot substitutes the email's own subject line; the preview shows the template name.
      title: options.mode === 'hubl' ? '{{ subject }}' : esc(template.name),
      pageBackground,
      bodyClass: className('bg', pageBackground),
      head,
      body: rendered,
    });

  const withAnnotation =
    options.mode === 'hubl'
      ? annotation(template.hubspotLabel || template.name || 'Email template', options.date ?? today()) + html
      : html;

  return {
    html: withAnnotation,
    tree: body,
    registry,
    // TextEncoder rather than Buffer: the compiler runs in the editor as well as under Node, and
    // `Buffer` is a Node global. Both give UTF-8 byte length, which is what Gmail counts.
    bytes: new TextEncoder().encode(withAnnotation).length,
    branch,
  };
}

/**
 * A row of columns: one section, one table, one `<td>` per column.
 *
 * Every field declaration is hoisted to the front of the row. That is forced rather than chosen —
 * a declaration inside a table cell is a declaration inside the conditional that collapses an empty
 * block (learnings 1.5), and would stop registering the moment someone cleared the field. Hoisted,
 * they still appear in document order, so the Contents panel reads left to right and then down,
 * which is the order the email is read in (learnings 1.4).
 */
function renderColumns(row: Row, sec: Section, ctx: BuildContext, annotate: boolean): IRNode {
  ctx.once('columns', () => ctx.mobile.push(...COLUMN_PHONE_CSS));

  const declarations: IRNode[] = [];
  const cells: ColumnCell[] = [];

  for (const column of row.columns) {
    const inner: IRNode[] = [];
    // A full-bleed block in a column renders nothing rather than half a navy band. The editor
    // does not offer them there; this is the compiler refusing to be asked.
    const blocks = column.blocks.filter((b) => COLUMN_BLOCKS.includes(b.type));
    if (blocks.length > 1) {
      // Several blocks in one column share one cell — the same stack a single column draws.
      const stack = stackOf(blocks, column, sec, ctx, annotate);
      declarations.push(...stack.declarations);
      inner.push(stack.cell);
    } else {
      for (const block of blocks) {
        const parts = blockParts(block, sec, column, ctx);
        if (!parts) continue;
        declarations.push(parts.declaration);
        const markup = parts.collapse(parts.markup);
        inner.push(annotate ? tag(markup, block.id, sec.id) : markup);
      }
    }
    // An empty column has no height and nothing to aim at, so on the canvas it draws itself as a
    // slot. Editor-only by construction: `annotate` is set by the preview and by nothing else, and
    // a test asserts an exported template never contains this.
    if (annotate && inner.length === 0) inner.push(emptySlot());

    cells.push({
      span: column.span,
      ...(column.hideOnPhone ? { hideOnPhone: true } : {}),
      // The canvas needs somewhere to drop a block into an empty column, and an empty column has no
      // block to aim at. Editor-only, under the same opt-in flag as `data-sy-block`.
      ...(annotate ? { id: column.id, sectionId: sec.id } : {}),
      inner: frag(inner),
    });
  }

  const body = sectionOf(columnsRow(cells, { ds: ctx.ds, stack: row.mobile !== 'side-by-side' }), {
    ds: ctx.ds,
    band: sec.bandColor,
    container: sec.containerColor,
    padTop: sec.padTop,
    padBottom: sec.padBottom,
  });

  return frag([...declarations, body]);
}

/**
 * A column's blocks, cut into the runs that render together.
 *
 * Blocks that can share a cell form one run; a block that draws its own band — the top bar, the
 * stripes, the footer — is a run of its own, and so is a lone block between two of them. A run of
 * one takes the single-block path; a run of more is a stack. A document written before stacks
 * existed, with a top bar and its stripes in one column, still renders each in its own band.
 */
function runsOf(blocks: Block[]): Block[][] {
  const runs: Block[][] = [];
  for (const block of blocks) {
    const stackable = COLUMN_BLOCKS.includes(block.type);
    const last = runs[runs.length - 1];
    if (stackable && last && COLUMN_BLOCKS.includes(last[0]!.type)) last.push(block);
    else runs.push([block]);
  }
  return runs;
}

/**
 * Several blocks in one column, as one cell.
 *
 * The cell carries what the column decides once — the gutter, the box, the phone class — and each
 * block sits in a row of its own inside it with the gap below. That is the whole reason a column can
 * hold more than one block: a card is a box around *all* of them, and the first version drew one box
 * per block because every block rendered its own padded cell (learnings 3.59).
 *
 * The gap goes below rather than above so the first row starts flush with the cell's own padding,
 * and is left out on either side of a Spacer, which is then exactly the space it says it is. A row
 * that collapses takes its gap with it; the row before keeps its own, which is the one thing HubL
 * cannot know at compile time and the reason a stack ends on the block that matters.
 */
function stackOf(
  blocks: Block[],
  column: Column,
  sec: Section,
  ctx: BuildContext,
  annotate: boolean,
): { declarations: IRNode[]; cell: IRNode } {
  const gap = gapOf(column, ctx.ds);
  const declarations: IRNode[] = [];
  const rows: IRNode[] = [];
  blocks.forEach((block, i) => {
    const parts = blockParts(block, sec, column, ctx);
    if (!parts) return;
    declarations.push(parts.declaration);
    const next = blocks[i + 1];
    const spaced = gap > 0 && next !== undefined && block.type !== 'spacer' && next.type !== 'spacer';
    const markup = parts.collapse(parts.row(spaced ? `0 0 ${gap}px` : '0'));
    rows.push(annotate ? tag(markup, block.id, sec.id) : markup);
  });

  const side = padClass(column, ctx);
  const outer = cell(frag(rows), {
    ds: ctx.ds,
    padding: paddingOf(column, ctx.ds),
    color: sec.textColor,
    linkColor: sec.linkColor,
    ...(side ? { className: side } : {}),
    box: boxOf(column, ctx.ds),
  });
  // The canvas needs the stack's own edge, to drop into the column's padding rather than onto a
  // block. Editor-only, under the same flag as everything else the canvas needs.
  return {
    declarations,
    cell: annotate && outer.k === 'el' ? { ...outer, attrs: { ...outer.attrs, 'data-sy-column': column.id, 'data-sy-section': sec.id } } : outer,
  };
}

/** What an empty column looks like while you are building one. Never in an exported template. */
function emptySlot(): IRNode {
  return el(
    'div',
    {
      'data-sy-slot': '',
      style:
        'min-height:64px; display:flex; align-items:center; justify-content:center; ' +
        'border:1px dashed #9aa0a6; border-radius:4px; color:#9aa0a6; font-size:12px',
    },
    text('Drop a block here'),
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Marks the outermost element of a block's markup so the canvas can map a click back to it.
 *
 * Outermost rather than every element: a click lands on whatever is under the pointer, and
 * `closest()` walks up from there, so one marker per block is both sufficient and the only way the
 * lookup stays unambiguous. A block that renders nothing (a stripe with both thicknesses at zero)
 * gets no marker and is simply not clickable, which is correct — there is nothing on screen.
 */
function tag(node: IRNode, blockId: string, sectionId: string, band = false): IRNode {
  // `data-sy-band` marks a block that draws its own full-width band and cannot share a cell, so
  // the canvas offers a section either side of it and never the inside.
  const attrs = { 'data-sy-block': blockId, 'data-sy-section': sectionId, ...(band ? { 'data-sy-band': '' } : {}) };
  const mark = (n: IRNode): IRNode | null => {
    if (n.k === 'el') return { ...n, attrs: { ...n.attrs, ...attrs } };
    if (n.k === 'frag' || n.k === 'if') {
      const children = n.children ?? [];
      // The first child that can actually *take* the mark, not merely the first that looks like a
      // container. A block's declaration is an empty fragment whenever its content is locked, and
      // stopping at that one left every locked block unclickable on the canvas.
      for (let i = 0; i < children.length; i += 1) {
        const marked = mark(children[i]!);
        if (marked) return { ...n, children: children.map((child, j) => (j === i ? marked : child)) };
      }
      return null;
    }
    return null;
  };
  return mark(node) ?? node;
}
