// The drag and drop area: the one region the marketing team lays out itself.
//
// Everywhere else in a template the designer owns the layout and the team fills in fields. Inside
// this block HubSpot's own editor takes over, and the team adds, removes and rearranges modules.
// What the designer authors here is the *default* content — where the team starts.
//
// Why this block is the one place `byMode` earns its keep a second time (ir.ts, the `mode` node):
// the two renderings are not the same markup with different values, they are different things. The
// file gets `{% dnd_area %}` and its nested tags, which HubSpot expands at send into markup we have
// never seen. The canvas cannot render that, because the modules are HubSpot's and their output is
// only knowable from a send. So the preview draws the *structure* — the sections, the columns and
// one labelled tile per module — and says plainly that the team controls it. An approximation that
// admits it is an approximation beats one that pretends to be the email and is wrong.
//
// Note what the hubl branch does not carry: colours. A `dnd_module` is rendered by HubSpot with
// HubSpot's styling, so there is nothing here for the registry to collect and nothing the
// dark-mode layers could re-assert (learnings 2.6). That is a real limitation of the feature, not
// an oversight — it is recorded in learnings §1.16 and warned about in the inspector.

import { el, frag, raw, byMode, type IRNode } from '../ir.ts';
import { section } from '../layout.ts';
import type { BuildContext } from '../context.ts';
import { colorOf, fontDecl } from '../../model/design-system.ts';
import { moduleName } from '../../model/modules.ts';
import type { DndAreaBlock, DndColumn, DndSection, Section } from '../../model/types.ts';
import { esc, hublAttr } from '../escape.ts';

// --- the file ----------------------------------------------------------------------------------

/**
 * The HubL. Raw rather than built from elements, because every one of these is a tag rather than
 * markup: there is no element tree here for the serializer to walk, and pretending otherwise would
 * put `{% %}` into attribute positions where lint would have to learn to ignore it.
 *
 * `dnd_row` is deliberately absent. It exists for web pages and HubSpot does not support it in
 * email, so the nesting is area, section, column, module, and a test asserts the string never
 * appears in any output.
 */
function hublFor(block: DndAreaBlock): IRNode {
  const lines: string[] = [];
  // The first argument is the area's identifier, not its label. The two are deliberately separate:
  // the label is microcopy the designer may reword at any time, the name is what HubSpot stores the
  // team's arrangement against and must never move under them (learnings 1.10).
  lines.push(`{% dnd_area "${hublAttr(block.name || 'email_body')}", label="${hublAttr(block.label || 'Email body')}" %}`);

  for (const sec of block.sections) {
    lines.push(`  {% dnd_section ${sectionParams(sec)} %}`);
    for (const col of sec.columns) {
      lines.push(`    {% dnd_column width=${clampWidth(col.width)} %}`);
      for (const mod of col.modules) {
        const params = [`path="${hublAttr(mod.path)}"`];
        if (mod.label.trim()) params.push(`label="${hublAttr(mod.label)}"`);
        for (const [key, value] of mod.params) params.push(`${key}=${value}`);
        lines.push(`      {% dnd_module ${params.join(', ')} %}`);
        lines.push('      {% end_dnd_module %}');
      }
      lines.push('    {% end_dnd_column %}');
    }
    lines.push('  {% end_dnd_section %}');
  }

  lines.push('{% end_dnd_area %}');
  return raw(lines.join('\n'));
}

function sectionParams(sec: DndSection): string {
  const params: string[] = [];
  // Padding is a dict of strings in HubSpot's tags, and the unit is px unless one is given.
  const pad: string[] = [];
  if (sec.padTop) pad.push(`'top':'${sec.padTop}'`);
  if (sec.padBottom) pad.push(`'bottom':'${sec.padBottom}'`);
  if (pad.length) params.push(`padding={${pad.join(', ')}}`);
  // Only one background parameter is allowed per tag, so this is a colour or nothing.
  if (sec.background) params.push(`background_color="${hublAttr(sec.background)}"`);
  // The area sits inside our container, which is already centred and already the right width.
  params.push('full_width=False');
  return params.join(', ');
}

const clampWidth = (width: number): number => Math.max(1, Math.min(12, Math.round(width) || 12));

// --- the canvas --------------------------------------------------------------------------------

/**
 * The preview. Structure only, drawn in the section's own colours so it still reads as part of the
 * email rather than as a hole in it.
 */
function previewFor(block: DndAreaBlock, sec: Section, ctx: BuildContext): IRNode {
  const ds = ctx.ds;
  const ink = sec.textColor;
  const rule = colorOf(ds, ds.richText.ruleColor) ?? ink;

  const header = el(
    'div',
    {
      style:
        `${fontish(ctx)} font-size:11px; letter-spacing:0.08em; text-transform:uppercase; ` +
        `font-weight:bold; color:${ink}; opacity:0.7; padding:0 0 8px 0`,
    },
    [raw(esc(block.label || 'Email body')), raw(' &middot; the team lays this out')],
  );

  const body = block.sections.length
    ? frag(block.sections.map((s) => previewSection(s, ink, rule, ctx)))
    : el(
        'div',
        {
          style: `${fontish(ctx)} font-size:13px; color:${ink}; opacity:0.6; padding:18px; text-align:center; border:1px dashed ${rule}`,
        },
        raw('Empty area. The team starts from nothing.'),
      );

  return el(
    'div',
    { style: `padding:16px 20px; border:2px dashed ${rule}` },
    [header, body],
  );
}

function previewSection(sec: DndSection, ink: string, rule: string, ctx: BuildContext): IRNode {
  const cells = sec.columns.length ? sec.columns : [{ id: '', width: 12, modules: [] } as DndColumn];
  const total = cells.reduce((sum, c) => sum + clampWidth(c.width), 0) || 12;

  return el(
    'table',
    {
      role: 'presentation',
      width: '100%',
      cellpadding: '0',
      cellspacing: '0',
      style: `width:100%; border-collapse:collapse; margin:0 0 8px 0${sec.background ? `; background-color:${sec.background}` : ''}`,
    },
    [
      el('tbody', null, [
        el(
          'tr',
          null,
          cells.map((col) => {
            const pct = Math.round((clampWidth(col.width) / total) * 10000) / 100;
            return el(
              'td',
              {
                valign: 'top',
                width: `${pct}%`,
                style: `width:${pct}%; vertical-align:top; padding:${sec.padTop || 0}px 4px ${sec.padBottom || 0}px 4px`,
              },
              col.modules.length
                ? frag(col.modules.map((m) => moduleTile(m.path, m.label, ink, rule, ctx)))
                : moduleTile('', 'Empty column', ink, rule, ctx),
            );
          }),
        ),
      ]),
    ],
  );
}

function moduleTile(path: string, label: string, ink: string, rule: string, ctx: BuildContext): IRNode {
  const title = path ? moduleName(path) : label;
  const sub = path ? label || path : '';
  return el(
    'div',
    {
      style:
        `${fontish(ctx)} border:1px solid ${rule}; padding:10px 12px; margin:0 0 6px 0; ` +
        `color:${ink}; font-size:13px; line-height:1.3`,
    },
    [
      el('div', { style: 'font-weight:bold' }, raw(esc(title))),
      sub ? el('div', { style: 'opacity:0.6; font-size:11px' }, raw(esc(sub))) : frag([]),
    ],
  );
}

/** The document font, as every inline style in this project writes it. */
const fontish = (ctx: BuildContext): string => fontDecl(ctx.ds);

// --- the block ---------------------------------------------------------------------------------

export function renderDndArea(block: DndAreaBlock, sec: Section, ctx: BuildContext): IRNode {
  const inner = byMode(previewFor(block, sec, ctx), hublFor(block));
  return section(inner, {
    ds: ctx.ds,
    band: sec.bandColor,
    container: sec.containerColor,
    padTop: sec.padTop,
    padBottom: sec.padBottom,
  });
}
