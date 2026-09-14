// The freeform block's layers, in the panel.

import { useState } from 'preact/hooks';

import { canvasTypeOf } from '../../model/design-system.ts';
import { designSystemOf, resolve } from '../../model/edit.ts';
import {
  addLayer,
  groupOfKey,
  groupRuns,
  membersOf,
  paintGroup,
  removeGroup,
  removeLayer,
  reorderLayer,
  ungroupLayers,
  updateLayer,
  updateMembers,
  type LayerKind,
} from '../../model/freeform.ts';
import { MARKS } from '../../model/marks.ts';
import type { FreeformLayer } from '../../model/types.ts';
import { PresetSlot } from '../ColorSlot.tsx';
import type { Editor } from '../useEditor.ts';
import type { FreeformUi } from './types.ts';

/** The kinds a layer can be added as, in the order the buttons show them. */
const LAYER_KINDS: Array<{ kind: LayerKind; label: string; help: string }> = [
  { kind: 'text', label: 'Text', help: 'Words in a type role from the design system. Wraps at its width.' },
  { kind: 'image', label: 'Image', help: 'A picture from the folder’s assets — a file name from Assets — or a hosted URL.' },
  { kind: 'rect', label: 'Rectangle', help: 'A box: fill, outline, corner radius.' },
  { kind: 'ellipse', label: 'Ellipse', help: 'A circle when its width and height match.' },
  { kind: 'line', label: 'Line', help: 'From one point to another.' },
  { kind: 'sticky', label: 'Note', help: 'A sticky note with words on it.' },
  { kind: 'mark', label: 'Stamp', help: 'A brand mark, in any colour.' },
];

const LAYER_NAMES: Record<FreeformLayer['kind'], string> = { text: 'Text', image: 'Image', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', path: 'Stroke', sticky: 'Note', mark: 'Stamp' };

/** A compact number: label on the left, the field on the right, for a layer's geometry. */
function Num({ label, value, onChange, min, max }: { label: string; value: number; onChange(v: number): void; min?: number; max?: number }) {
  return (
    <label class="layer-num" title={label}>
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

/**
 * The freeform block in the panel.
 *
 * On the email it is a way in and a line of facts. The layers are the canvas's business, and a list
 * of them beside the email was detail about a place you were not in (learnings 3.68). Inside the
 * canvas it is the whole stack, with drawings gathered into groups and the picked layer's numbers.
 */
export function LayersField({ editor, freeform }: { editor: Editor; freeform?: FreeformUi }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const block = resolve(editor.template, editor.selection).block;
  if (!block || block.type !== 'freeform') return null;
  const ds = designSystemOf(editor.template);

  if (!freeform?.open) {
    const n = block.layers.length;
    const app = freeform?.app;
    const linked = Boolean(app?.linkedKey);
    return (
      <div class="field wide canvas-entry">
        {linked ? (
          <button class="btn wide canvas-open" title="This block follows the frame in the Freeform app. Edit it there and the email updates." onClick={() => app?.onOpen()}>
            Edit in Freeform ↗
          </button>
        ) : (
          <button
            class="btn wide canvas-open"
            title="Zoom into the canvas to draw, drop pictures in, stamp and type. Double-clicking the block does the same."
            onClick={() => freeform?.onEnter?.(block.id)}
          >
            Open canvas
          </button>
        )}
        <span class="canvas-facts">
          {n} {n === 1 ? 'layer' : 'layers'} · {block.width} × {block.height}
          {block.effects?.length ? ' · Riso print' : ''}
        </span>

        {app && (
          <div class="canvas-link">
            <div class="canvas-link-head">
              <b>Freeform frames</b>
              {linked && (
                <span class={`canvas-link-badge ${app.missing || !app.current ? 'stale' : ''}`}>{app.missing ? 'Frame deleted' : app.current ? 'Linked · up to date' : 'Linked · updating'}</span>
              )}
            </div>
            {app.frames.length === 0 ? (
              <p class="hint">Nothing in the Freeform app yet. Draw a frame there and it shows up here to link.</p>
            ) : (
              <>
                <p class="hint">
                  {!linked
                    ? 'Pick a frame. This block takes its drawing and follows it from then on.'
                    : app.missing
                      ? 'The frame this block followed is gone from the Freeform app. The drawing stays: pick another frame, or unlink.'
                      : 'The highlighted frame is the one this block follows. Pick another to follow it instead.'}
                </p>
                <div class="canvas-frames">
                  {app.frames.map((f) => {
                    const on = f.key === app.linkedKey;
                    return (
                      <button
                        key={f.key}
                        class={`canvas-frame ${on ? 'on' : ''}`}
                        title={on ? `${f.name}: this block follows it. Opens it in the Freeform app.` : `Follow ${f.name}. It replaces this block's drawing; Undo brings the old one back.`}
                        onClick={() => (on ? app.onOpen(f.key) : app.onLink(f.key))}
                      >
                        <span class="canvas-frame-thumb">{on && app.print ? <img src={app.print} alt="" /> : <span dangerouslySetInnerHTML={{ __html: f.thumb }} />}</span>
                        <span class="canvas-frame-name">{f.name}</span>
                        <span class="canvas-frame-facts">
                          {f.width} × {f.height}
                          {f.printed ? ' · Riso' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {linked && (
              <button class="btn wide" title="Stop following the frame. The drawing stays, to edit in this block's own canvas." onClick={app.onUnlink}>
                Unlink
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const key = freeform.layer;
  const group = groupOfKey(key);
  const members = group ? membersOf(block, group) : [];
  const picked = key && !group ? (block.layers.find((l) => l.id === key) ?? null) : null;
  const coalesce = (id: string) => `layer:${block.id}:${id}`;
  const patch = (fields: Record<string, unknown>) => {
    if (!picked) return;
    editor.commit('Layer', updateLayer(editor.template, block.id, picked.id, fields), { coalesce: coalesce(picked.id) });
  };
  const add = (kind: LayerKind) => {
    const next = addLayer(editor.template, block.id, kind);
    const added = next.sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))).find((b) => b.id === block.id);
    editor.commit('Add layer', next);
    const last = added && added.type === 'freeform' ? added.layers[added.layers.length - 1] : undefined;
    freeform.onSelectLayer(last?.id ?? null);
  };
  const roles = Object.keys(ds.type);
  const looks = canvasTypeOf(ds);
  const nameOfLayer = (l: FreeformLayer) =>
    l.kind === 'text' || l.kind === 'sticky'
      ? l.text.trim().slice(0, 24) || LAYER_NAMES[l.kind]
      : l.kind === 'mark'
        ? (MARKS.find((m) => m.key === l.mark)?.name ?? 'Stamp')
        : LAYER_NAMES[l.kind];
  const strokeOf = (l: FreeformLayer | undefined) => (l && (l.kind === 'path' || l.kind === 'line') ? l : undefined);
  const firstStroke = strokeOf(members.find((m) => m.kind === 'path' || m.kind === 'line'));

  const row = (l: FreeformLayer, grouped: boolean) => {
    const index = block.layers.findIndex((x) => x.id === l.id);
    return (
      <li key={l.id} class={picked?.id === l.id ? 'on' : ''}>
        <button class="layer-row" title={`${LAYER_NAMES[l.kind]}. Click to pick it; drag it on the canvas.`} onClick={() => freeform.onSelectLayer(picked?.id === l.id ? null : l.id)}>
          <span class="layer-kind">{LAYER_NAMES[l.kind]}</span>
          <span class="layer-name">{nameOfLayer(l)}</span>
        </button>
        <span class="layer-actions">
          {!grouped && (
            <>
              <button disabled={index === block.layers.length - 1} title="Bring forward" aria-label="Bring forward" onClick={() => editor.commit('Reorder layer', reorderLayer(editor.template, block.id, l.id, 1))}>
                ↑
              </button>
              <button disabled={index === 0} title="Send back" aria-label="Send back" onClick={() => editor.commit('Reorder layer', reorderLayer(editor.template, block.id, l.id, -1))}>
                ↓
              </button>
            </>
          )}
          <button
            class="danger"
            title="Remove this layer."
            aria-label="Remove"
            onClick={() => {
              editor.commit('Remove layer', removeLayer(editor.template, block.id, l.id));
              if (picked?.id === l.id) freeform.onSelectLayer(null);
            }}
          >
            ✕
          </button>
        </span>
      </li>
    );
  };

  return (
    <div class="field wide layers">
      <div class="layer-add">
        {LAYER_KINDS.map((k) => (
          <button key={k.kind} class="btn" title={k.help} onClick={() => add(k.kind)}>
            {k.label}
          </button>
        ))}
      </div>

      <ul class="layer-list">
        {[...groupRuns(block.layers)].reverse().map((item) =>
          item.kind === 'layer' ? (
            row(item.layer, false)
          ) : (
            <li key={`group-${item.id}`} class={`layer-group ${group === item.id ? 'on' : ''}`}>
              <div class="layer-group-head">
                <button
                  class="layer-fold"
                  aria-expanded={Boolean(openGroups[item.id])}
                  aria-label={openGroups[item.id] ? 'Fold the drawing' : 'Show its strokes'}
                  onClick={() => setOpenGroups((o) => ({ ...o, [item.id]: !o[item.id] }))}
                >
                  {openGroups[item.id] ? '▾' : '▸'}
                </button>
                <button
                  class="layer-row"
                  title="Strokes drawn in one go, grouped as they were drawn. They move, resize, colour and delete together."
                  onClick={() => freeform.onSelectLayer(group === item.id ? null : `group:${item.id}`)}
                >
                  <span class="layer-kind">Group</span>
                  <span class="layer-name">Drawing · {item.layers.length} strokes</span>
                </button>
                <span class="layer-actions">
                  <button
                    title="Ungroup: every stroke its own layer again."
                    aria-label="Ungroup"
                    onClick={() => {
                      editor.commit('Ungroup drawing', ungroupLayers(editor.template, block.id, item.id));
                      if (group === item.id) freeform.onSelectLayer(null);
                    }}
                  >
                    ⊟
                  </button>
                  <button
                    class="danger"
                    title="Remove the whole drawing."
                    aria-label="Remove drawing"
                    onClick={() => {
                      editor.commit('Remove drawing', removeGroup(editor.template, block.id, item.id));
                      if (group === item.id) freeform.onSelectLayer(null);
                    }}
                  >
                    ✕
                  </button>
                </span>
              </div>
              {openGroups[item.id] && <ul class="layer-list nested">{[...item.layers].reverse().map((l) => row(l, true))}</ul>}
            </li>
          ),
        )}
        {block.layers.length === 0 && <li class="col-empty">nothing on the canvas yet</li>}
      </ul>

      {group && members.length > 0 && (
        <div class="layer-fields">
          <div class="layer-grid">
            <Num
              label="Weight"
              value={firstStroke?.strokeWidth ?? 3}
              min={1}
              max={40}
              onChange={(v) =>
                editor.commit('Drawing weight', updateMembers(editor.template, block.id, group, (l) => (l.kind === 'path' || l.kind === 'line' ? { ...l, strokeWidth: v } : l)), {
                  coalesce: coalesce(`group:${group}`),
                })
              }
            />
          </div>
          <PresetSlot ds={ds} label="Colour" value={firstStroke?.stroke ?? null} onChange={(v) => editor.commit('Drawing colour', paintGroup(editor.template, block.id, group, v))} help="Every stroke in the drawing, together." allowNone noneLabel="Ink" />
        </div>
      )}

      {picked && (
        <div class="layer-fields">
          {(picked.kind === 'text' || picked.kind === 'sticky') && (
            <textarea rows={3} value={picked.text} title="The words. A new line is a new line." onInput={(e) => patch({ text: (e.target as HTMLTextAreaElement).value })} />
          )}
          {picked.kind === 'text' && (
            <>
              <div class="layer-grid">
                <label class="layer-num wide" title="A playful style from Design › Canvas type, or a role from Design › Type.">
                  <span>Style</span>
                  <select
                    value={picked.look ? `look:${picked.look}` : picked.role}
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      patch(v.startsWith('look:') ? { look: v.slice(5) } : { role: v, look: undefined });
                    }}
                  >
                    <optgroup label="Canvas type">
                      {Object.entries(looks).map(([k, style]) => (
                        <option key={k} value={`look:${k}`}>
                          {style.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Email type">
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                <label class="layer-num" title="Where the lines sit inside the layer's width.">
                  <span>Align</span>
                  <select value={picked.align} onChange={(e) => patch({ align: (e.target as HTMLSelectElement).value })}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <Num label="Width" value={picked.width} min={10} onChange={(v) => patch({ width: v })} />
                <Num label="X" value={picked.x} onChange={(v) => patch({ x: v })} />
                <Num label="Y" value={picked.y} onChange={(v) => patch({ y: v })} />
              </div>
              <PresetSlot ds={ds} label="Colour" value={picked.color} onChange={(v) => patch({ color: v })} help="Named from the palette. Left alone it is the style's own colour." allowNone noneLabel="Style" />
            </>
          )}
          {picked.kind === 'sticky' && (
            <div class="layer-grid">
              <Num label="X" value={picked.x} onChange={(v) => patch({ x: v })} />
              <Num label="Y" value={picked.y} onChange={(v) => patch({ y: v })} />
              <Num label="Width" value={picked.width} min={20} onChange={(v) => patch({ width: v })} />
              <Num label="Height" value={picked.height} min={20} onChange={(v) => patch({ height: v })} />
            </div>
          )}
          {picked.kind === 'mark' && (
            <>
              <div class="layer-grid">
                <label class="layer-num wide" title="Which brand mark.">
                  <span>Mark</span>
                  <select value={picked.mark} onChange={(e) => patch({ mark: (e.target as HTMLSelectElement).value })}>
                    {MARKS.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Num label="X" value={picked.x} onChange={(v) => patch({ x: v })} />
                <Num label="Y" value={picked.y} onChange={(v) => patch({ y: v })} />
                <Num label="Width" value={picked.width} min={8} onChange={(v) => patch({ width: v })} />
                <Num label="Height" value={picked.height} min={8} onChange={(v) => patch({ height: v })} />
              </div>
              <PresetSlot ds={ds} label="Colour" value={picked.color} onChange={(v) => patch({ color: v })} help="Named from the palette. Left alone it is the ink." allowNone noneLabel="Ink" />
            </>
          )}
          {picked.kind === 'image' && (
            <>
              <input type="text" value={picked.src} placeholder="hero.jpg, or https://…" title="A file name from Assets, or a hosted URL. A remote picture cannot be drawn into the render; use a file from the folder." onInput={(e) => patch({ src: (e.target as HTMLInputElement).value })} />
              <div class="layer-grid">
                <Num label="X" value={picked.x} onChange={(v) => patch({ x: v })} />
                <Num label="Y" value={picked.y} onChange={(v) => patch({ y: v })} />
                <Num label="Width" value={picked.width} min={1} onChange={(v) => patch({ width: v })} />
                <Num label="Height" value={picked.height} min={1} onChange={(v) => patch({ height: v })} />
                <Num label="Opacity %" value={picked.opacity * 100} min={0} max={100} onChange={(v) => patch({ opacity: Math.max(0, Math.min(100, v)) / 100 })} />
              </div>
            </>
          )}
          {(picked.kind === 'rect' || picked.kind === 'ellipse') && (
            <>
              <div class="layer-grid">
                <Num label="X" value={picked.x} onChange={(v) => patch({ x: v })} />
                <Num label="Y" value={picked.y} onChange={(v) => patch({ y: v })} />
                <Num label="Width" value={picked.width} min={1} onChange={(v) => patch({ width: v })} />
                <Num label="Height" value={picked.height} min={1} onChange={(v) => patch({ height: v })} />
                <Num label="Outline" value={picked.strokeWidth} min={0} max={40} onChange={(v) => patch({ strokeWidth: v })} />
                {picked.kind === 'rect' && <Num label="Radius" value={picked.radius} min={0} max={200} onChange={(v) => patch({ radius: v })} />}
              </div>
              <PresetSlot ds={ds} label="Fill" value={picked.fill} onChange={(v) => patch({ fill: v })} help="Named from the palette." allowNone noneLabel="None" />
              <PresetSlot ds={ds} label="Outline" value={picked.stroke} onChange={(v) => patch({ stroke: v })} help="Named from the palette. A shape with no fill and no outline gets one in the ink colour, so it can be seen." allowNone noneLabel="None" />
            </>
          )}
          {(picked.kind === 'line' || picked.kind === 'path') && (
            <>
              <div class="layer-grid">
                {picked.kind === 'line' && (
                  <>
                    <Num label="X1" value={picked.x1} onChange={(v) => patch({ x1: v })} />
                    <Num label="Y1" value={picked.y1} onChange={(v) => patch({ y1: v })} />
                    <Num label="X2" value={picked.x2} onChange={(v) => patch({ x2: v })} />
                    <Num label="Y2" value={picked.y2} onChange={(v) => patch({ y2: v })} />
                  </>
                )}
                <Num label="Weight" value={picked.strokeWidth} min={1} max={40} onChange={(v) => patch({ strokeWidth: v })} />
              </div>
              <PresetSlot ds={ds} label="Colour" value={picked.stroke} onChange={(v) => patch({ stroke: v })} help="Named from the palette." allowNone noneLabel="Ink" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
