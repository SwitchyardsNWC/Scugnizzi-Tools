import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { brushSampleSvg, canvasTypeSampleSvg } from '../compile/freeform.ts';
import { amountLabel, LAYER_NAMES, layerName, textStyleOf, type CanvasCommand } from '../model/canvas-text.ts';
import { canvasTypeOf, colorOf, type ColorRef, type DesignSystem } from '../model/design-system.ts';
import { BRUSHES, groupKey, groupRuns, STICKY_COLORS } from '../model/freeform.ts';
import { MARKS } from '../model/marks.ts';
import type { Align, FreeformBlock, FreeformLayer } from '../model/types.ts';

// The canvas's own controls, in the canvas's own look: the layers panel docked on its right, the
// mini menu that floats over whatever is picked, and the slash menu under text being typed.
//
// Jared: "give free form it's own layer control ui that matches the canvas. actually it should be
// intuitive controls, example text has same slash commands for styles. plus a mini menu to controls
// spacing/tweak effects." And then: "in template studio you won't need the sidebar, it will be part
// of the freeform canvas, which can now take up that right panel."
//
// Every control here is dumb: it says what changed and Surface commits it, so undo, coalescing and
// the pop-and-poof motions stay in one place.

const icon = (...children: JSX.Element[]) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const KIND_ICONS: Record<FreeformLayer['kind'] | 'group', () => JSX.Element> = {
  text: () => icon(<path key="a" d="M6 6.5h12M12 6.5v12" />),
  sticky: () => icon(<path key="a" d="M5 4.5h14v9.8L14.3 19.5H5z" />, <path key="b" d="M14 19.3v-5h5" />),
  rect: () => icon(<rect key="a" x="4" y="6" width="16" height="12" rx="2.5" />),
  ellipse: () => icon(<ellipse key="a" cx="12" cy="12" rx="8" ry="6" />),
  line: () => icon(<path key="a" d="M5 19L19 5" />),
  path: () => icon(<path key="a" d="M4 16c3-7 5 3 8-3s5 2 8-4" />),
  image: () => icon(<rect key="a" x="4" y="5" width="16" height="14" rx="2" />, <path key="b" d="M4 16l5-5 4 4 2-2 5 5" />),
  mark: () => icon(<circle key="a" cx="12" cy="9" r="4.6" />, <path key="b" d="M9.5 13.2L9 16.5h6l-.5-3.3M6 19.5h12" />),
  group: () => icon(<path key="a" d="M3 15c2.5-6 4.5 2 7-3s4 1.5 6-2" />, <path key="b" d="M8 20c2.5-5 4.5 1.5 7-2.5s3.5 1 6-1.5" />),
};

const ALIGN_ICONS: Record<Align, () => JSX.Element> = {
  left: () => icon(<path key="a" d="M4 6h16M4 10h10M4 14h16M4 18h10" />),
  center: () => icon(<path key="a" d="M4 6h16M7 10h10M4 14h16M7 18h10" />),
  right: () => icon(<path key="a" d="M4 6h16M10 10h10M4 14h16M10 18h10" />),
};
const NEXT_ALIGN: Record<Align, Align> = { left: 'center', center: 'right', right: 'left' };

// --- the layers panel -------------------------------------------------------------------------------

export interface FigLayersProps {
  block: FreeformBlock;
  ds: DesignSystem;
  picked: string | null;
  hover: string | null;
  onPick(key: string | null): void;
  onHover(key: string | null): void;
  /** Double-click on words: type into them. */
  onEdit(layerId: string): void;
  onDuplicate(key: string): void;
  onRemove(key: string): void;
  onUngroup(group: string): void;
  /** Moves an entry of the list to a place counted bottom to top — `moveItem`. */
  onMove(key: string, to: number): void;
  onPage(patch: { width?: number; height?: number; background?: ColorRef }): void;
  onClose(): void;
}

export function FigLayers({ block, ds, picked, hover, onPick, onHover, onEdit, onDuplicate, onRemove, onUngroup, onMove, onPage, onClose }: FigLayersProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dragKey, setDragKey] = useState<string | null>(null);
  /** Where a drag would land, as a gap in the list as shown: 0 is above the first row. */
  const [gap, setGap] = useState<number | null>(null);
  const shown = [...groupRuns(block.layers)].reverse();
  const keyOf = (i: (typeof shown)[number]) => (i.kind === 'group' ? groupKey(i.id) : i.layer.id);
  const n = shown.length;
  const palette = Object.keys(ds.colors).slice(0, 7);

  const drop = () => {
    if (dragKey !== null && gap !== null) {
      const from = shown.findIndex((i) => keyOf(i) === dragKey);
      const at = gap > from ? gap - 1 : gap;
      if (from !== -1 && at !== from) onMove(dragKey, n - 1 - at);
    }
    setDragKey(null);
    setGap(null);
  };

  const row = (l: FreeformLayer, depth: number, index: number | null) => {
    const key = l.id;
    return (
      <li
        key={key}
        class={`fig-layer ${picked === key ? 'on' : ''} ${hover === key ? 'hover' : ''} ${depth ? 'nested' : ''} ${index !== null && gap === index && dragKey ? 'gap-before' : ''} ${index !== null && gap === index + 1 && dragKey && index === n - 1 ? 'gap-after' : ''}`}
        draggable={index !== null}
        onDragStart={(e) => {
          if (index === null) return;
          e.dataTransfer?.setData('text/x-fig-layer', key);
          setDragKey(key);
        }}
        onDragOver={(e) => {
          if (index === null || !dragKey) return;
          e.preventDefault();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setGap(e.clientY < r.top + r.height / 2 ? index : index + 1);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          drop();
        }}
        onDragEnd={() => {
          setDragKey(null);
          setGap(null);
        }}
        onMouseEnter={() => onHover(key)}
        onMouseLeave={() => onHover(null)}
      >
        <button class="fig-layer-main" title={`${LAYER_NAMES[l.kind]}. Drag to reorder.`} onClick={() => onPick(picked === key ? null : key)} onDblClick={() => (l.kind === 'text' || l.kind === 'sticky') && onEdit(l.id)}>
          <span class={`fig-layer-icon k-${l.kind}`}>{KIND_ICONS[l.kind]()}</span>
          <span class="fig-layer-name">{layerName(l)}</span>
        </button>
        <span class="fig-layer-actions">
          <button title="Duplicate  ·  ⌘D" aria-label="Duplicate" onClick={() => onDuplicate(key)}>
            {icon(<rect key="a" x="8" y="8" width="12" height="12" rx="2.5" />, <path key="b" d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />)}
          </button>
          <button class="danger" title="Delete  ·  ⌫" aria-label="Delete" onClick={() => onRemove(key)}>
            {icon(<path key="a" d="M6 6l12 12M18 6L6 18" />)}
          </button>
        </span>
      </li>
    );
  };

  return (
    <div class="fig-chrome fig-panel" onDragOver={(e) => dragKey && e.preventDefault()} onDrop={drop}>
      <div class="fig-panel-head">
        <b>Layers</b>
        <span class="fig-count">{block.layers.length}</span>
        <span class="grow" />
        <button class="fig-icon-btn" title="Hide the layers" aria-label="Hide the layers" onClick={onClose}>
          {icon(<path key="a" d="M9 6l6 6-6 6" />)}
        </button>
      </div>

      <ul class="fig-layers">
        {shown.map((item, index) => {
          if (item.kind === 'layer') return row(item.layer, 0, index);
          const key = groupKey(item.id);
          const expanded = Boolean(open[item.id]);
          return (
            <li key={key} class="fig-group">
              <div
                class={`fig-layer ${picked === key ? 'on' : ''} ${hover === key ? 'hover' : ''} ${gap === index && dragKey ? 'gap-before' : ''} ${gap === index + 1 && dragKey && index === n - 1 ? 'gap-after' : ''}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer?.setData('text/x-fig-layer', key);
                  setDragKey(key);
                }}
                onDragOver={(e) => {
                  if (!dragKey) return;
                  e.preventDefault();
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setGap(e.clientY < r.top + r.height / 2 ? index : index + 1);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  drop();
                }}
                onDragEnd={() => {
                  setDragKey(null);
                  setGap(null);
                }}
                onMouseEnter={() => onHover(key)}
                onMouseLeave={() => onHover(null)}
              >
                <button class={`fig-fold ${expanded ? 'open' : ''}`} aria-expanded={expanded} aria-label={expanded ? 'Fold the drawing' : 'Show its strokes'} onClick={() => setOpen((o) => ({ ...o, [item.id]: !o[item.id] }))}>
                  {icon(<path key="a" d="M9 6l6 6-6 6" />)}
                </button>
                <button class="fig-layer-main" title="A drawing: strokes made in one go. They move, scale, colour and delete together. Alt-click a stroke on the canvas to pick it alone." onClick={() => onPick(picked === key ? null : key)}>
                  <span class="fig-layer-icon k-group">{KIND_ICONS.group()}</span>
                  <span class="fig-layer-name">Drawing</span>
                  <span class="fig-badge">{item.layers.length}</span>
                </button>
                <span class="fig-layer-actions">
                  <button title="Ungroup: every stroke its own layer" aria-label="Ungroup" onClick={() => onUngroup(item.id)}>
                    {icon(<rect key="a" x="3" y="3" width="8" height="8" rx="2" />, <rect key="b" x="13" y="13" width="8" height="8" rx="2" />)}
                  </button>
                  <button class="danger" title="Delete the drawing" aria-label="Delete" onClick={() => onRemove(key)}>
                    {icon(<path key="a" d="M6 6l12 12M18 6L6 18" />)}
                  </button>
                </span>
              </div>
              {expanded && <ul class="fig-layers nested">{[...item.layers].reverse().map((l) => row(l, 1, null))}</ul>}
            </li>
          );
        })}
        {n === 0 && <li class="fig-empty">Nothing here yet. Grab a tool from the dock and make a mess.</li>}
      </ul>

      <div class="fig-page">
        <div class="fig-page-row">
          <b>Page</b>
          <label title="Width of the picture, in pixels">
            W
            <input type="number" min={40} max={700} value={block.width} onChange={(e) => onPage({ width: clamp(Number((e.target as HTMLInputElement).value), 40, 700) })} />
          </label>
          <label title="Height of the picture, in pixels">
            H
            <input type="number" min={20} max={1200} value={block.height} onChange={(e) => onPage({ height: clamp(Number((e.target as HTMLInputElement).value), 20, 1200) })} />
          </label>
        </div>
        <div class="fig-page-row dots" role="group" aria-label="Page background">
          <button class={`fig-dot clear ${block.background === null ? 'on' : ''}`} title="No background: the email shows through" aria-label="No background" onClick={() => onPage({ background: null })} />
          {palette.map((name) => (
            <button key={name} class={`fig-dot ${block.background === name ? 'on' : ''}`} style={{ background: colorOf(ds, name) ?? undefined }} title={`${name} background`} aria-label={`${name} background`} onClick={() => onPage({ background: name })} />
          ))}
        </div>
      </div>
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo);

// --- the mini menu ------------------------------------------------------------------------------------

export interface FigBarProps {
  ds: DesignSystem;
  layers: FreeformLayer[];
  group: string | null;
  /** Screen position: the centre of the selection's top edge (or bottom edge, when `below`). */
  left: number;
  top: number;
  below: boolean;
  /** Changes every picked layer. `coalesce` makes a slider drag one undo step. */
  onChange(label: string, fn: (l: FreeformLayer) => FreeformLayer, coalesce?: string): void;
  onDuplicate(): void;
  onRemove(): void;
  onUngroup(): void;
  onOrder(delta: number): void;
}

type Pop = 'style' | 'colour' | 'fill' | 'outline' | 'tweak' | 'mark' | 'brush' | null;

export function FigBar({ ds, layers, group, left, top, below, onChange, onDuplicate, onRemove, onUngroup, onOrder }: FigBarProps) {
  const [pop, setPop] = useState<Pop>(null);
  const one = group ? undefined : layers[0];
  const id = group ?? one?.id ?? '';
  const palette = Object.keys(ds.colors).slice(0, 8);
  const toggle = (p: Pop) => setPop((cur) => (cur === p ? null : p));
  const set = (label: string, patch: Record<string, unknown>, coalesce?: string) => onChange(label, (l) => ({ ...l, ...patch }) as FreeformLayer, coalesce ? `${coalesce}:${id}` : undefined);
  // Buttons keep focus where it was, but a slider or a field has to take the press or it cannot be dragged.
  const hold = (e: Event) => {
    if ((e.target as HTMLElement | null)?.closest('input, select, textarea')) return;
    e.preventDefault();
  };

  const colourDots = (value: ColorRef, pick: (c: ColorRef) => void, extra: string[] = [], noneLabel = 'Default') => (
    <div class="fig-bar-dots">
      <button class={`fig-dot none ${value === null ? 'on' : ''}`} title={noneLabel} aria-label={noneLabel} onClick={() => pick(null)} />
      {palette.map((name) => (
        <button key={name} class={`fig-dot ${value === name ? 'on' : ''}`} style={{ background: colorOf(ds, name) ?? undefined }} title={name} aria-label={name} onClick={() => pick(name)} />
      ))}
      {extra.length > 0 && <span class="fig-sep" aria-hidden="true" />}
      {extra.map((hex) => (
        <button key={hex} class={`fig-dot ${value === hex ? 'on' : ''}`} style={{ background: hex }} title={hex} aria-label={hex} onClick={() => pick(hex)} />
      ))}
    </div>
  );

  const swatch = (value: ColorRef, fallback: string) => colorOf(ds, value) ?? fallback;
  const stepper = (label: string, value: number, step: number, min: number, max: number, apply: (v: number) => void) => (
    <span class="fig-stepper" title={label}>
      <button aria-label={`Less ${label.toLowerCase()}`} onClick={() => apply(Math.max(min, Math.round(value - step)))}>
        −
      </button>
      <span class="fig-stepper-val">{Math.round(value)}</span>
      <button aria-label={`More ${label.toLowerCase()}`} onClick={() => apply(Math.min(max, Math.round(value + step)))}>
        +
      </button>
    </span>
  );

  const strokes = layers.filter((l): l is Extract<FreeformLayer, { kind: 'path' | 'line' }> => l.kind === 'path' || l.kind === 'line');
  const text = one?.kind === 'text' ? one : undefined;
  const sticky = one?.kind === 'sticky' ? one : undefined;
  const shape = one?.kind === 'rect' || one?.kind === 'ellipse' ? one : undefined;
  const style = text || sticky ? textStyleOf((text ?? sticky)!, ds) : null;
  const looks = canvasTypeOf(ds);
  const firstStroke = strokes[0];
  const brushOf = firstStroke?.kind === 'path' ? (firstStroke.brush ?? 'marker') : null;

  let quick: JSX.Element | null = null;
  let tweaks: JSX.Element | null = null;

  if (text && style) {
    const lookLabel = text.look ? (looks[text.look]?.label ?? 'Style') : 'Plain';
    const amount = amountLabel(style.effect);
    quick = (
      <>
        <button class={`fig-chip ${pop === 'style' ? 'on' : ''}`} title="Text style  ·  or type / while editing" onClick={() => toggle('style')}>
          <span class="fig-chip-sample" dangerouslySetInnerHTML={{ __html: canvasTypeSampleSvg(ds, text.look ?? null, 'Aa') }} />
          {lookLabel}
          <span class="caret">▾</span>
        </button>
        {stepper('Size', style.size, style.size >= 40 ? 4 : 2, 6, 240, (v) => set('Text size', { size: v }, 'size'))}
        <button class="fig-icon-btn" title={`Align ${text.align} · click for ${NEXT_ALIGN[text.align]}`} aria-label="Alignment" onClick={() => set('Align', { align: NEXT_ALIGN[text.align] })}>
          {ALIGN_ICONS[text.align]()}
        </button>
        <button class={`fig-swatch-btn ${pop === 'colour' ? 'on' : ''}`} title="Colour" aria-label="Colour" onClick={() => toggle('colour')}>
          <span style={{ background: swatch(text.color, swatch(style.color, '#1e1c19')) }} />
        </button>
      </>
    );
    tweaks = (
      <>
        <Slide label="Size" unit="px" min={6} max={240} value={style.size} onInput={(v) => set('Text size', { size: v }, 'size')} />
        <Slide label="Letter spacing" unit="px" min={-6} max={30} step={0.5} value={style.letterSpacing} onInput={(v) => set('Letter spacing', { letterSpacing: v }, 'tracking')} />
        <Slide label="Line height" unit="%" min={60} max={220} value={style.lineHeight} onInput={(v) => set('Line height', { lineHeight: v }, 'leading')} />
        {amount && <Slide label={amount} unit="" min={0} max={100} value={style.amount} onInput={(v) => set(amount, { amount: v }, 'amount')} />}
        <button class="fig-reset" onClick={() => set('Reset text', { size: undefined, letterSpacing: undefined, lineHeight: undefined, amount: undefined })}>
          Back to the style
        </button>
      </>
    );
  } else if (sticky && style) {
    quick = (
      <>
        <button class={`fig-swatch-btn square ${pop === 'fill' ? 'on' : ''}`} title="Note colour" aria-label="Note colour" onClick={() => toggle('fill')}>
          <span style={{ background: swatch(sticky.fill, STICKY_COLORS[0]!) }} />
        </button>
        {stepper('Size', style.size, 2, 8, 80, (v) => set('Note text size', { size: v }, 'size'))}
        <button class={`fig-swatch-btn ${pop === 'colour' ? 'on' : ''}`} title="Ink" aria-label="Ink" onClick={() => toggle('colour')}>
          <span style={{ background: swatch(sticky.color, '#2b2620') }} />
        </button>
      </>
    );
  } else if (shape) {
    quick = (
      <>
        <button class={`fig-swatch-btn square ${pop === 'fill' ? 'on' : ''}`} title="Fill" aria-label="Fill" onClick={() => toggle('fill')}>
          <span class={shape.fill ? '' : 'empty'} style={shape.fill ? { background: swatch(shape.fill, 'transparent') } : undefined} />
        </button>
        <button class={`fig-swatch-btn ring ${pop === 'outline' ? 'on' : ''}`} title="Outline" aria-label="Outline" onClick={() => toggle('outline')}>
          <span style={{ borderColor: swatch(shape.stroke, shape.fill ? 'transparent' : '#1e1c19') }} />
        </button>
        {stepper('Outline', shape.strokeWidth, 1, 0, 40, (v) => set('Outline', { strokeWidth: v }, 'stroke'))}
      </>
    );
    tweaks = (
      <>
        <Slide label="Outline" unit="px" min={0} max={40} value={shape.strokeWidth} onInput={(v) => set('Outline', { strokeWidth: v }, 'stroke')} />
        {shape.kind === 'rect' && <Slide label="Corners" unit="px" min={0} max={Math.round(Math.min(shape.width, shape.height) / 2)} value={shape.radius} onInput={(v) => set('Corners', { radius: v }, 'radius')} />}
      </>
    );
  } else if (strokes.length) {
    const first = strokes[0]!;
    quick = (
      <>
        {brushOf && (
          <button class={`fig-chip ${pop === 'brush' ? 'on' : ''}`} title="Pen type" onClick={() => toggle('brush')}>
            <span class="fig-chip-sample" dangerouslySetInnerHTML={{ __html: brushSampleSvg(ds, brushOf, first.stroke) }} />
            {BRUSHES.find((b) => b.brush === brushOf)?.label ?? 'Marker'}
            <span class="caret">▾</span>
          </button>
        )}
        <button class={`fig-swatch-btn ${pop === 'colour' ? 'on' : ''}`} title="Colour" aria-label="Colour" onClick={() => toggle('colour')}>
          <span style={{ background: swatch(first.stroke, '#1e1c19') }} />
        </button>
        {stepper('Weight', first.strokeWidth, 1, 1, 40, (v) => onChange('Weight', (l) => (l.kind === 'path' || l.kind === 'line' ? { ...l, strokeWidth: v } : l), `weight:${id}`))}
      </>
    );
  } else if (one?.kind === 'image') {
    tweaks = <Slide label="Opacity" unit="%" min={0} max={100} value={Math.round(one.opacity * 100)} onInput={(v) => set('Opacity', { opacity: v / 100 }, 'opacity')} />;
  } else if (one?.kind === 'mark') {
    quick = (
      <>
        <button class={`fig-chip ${pop === 'mark' ? 'on' : ''}`} title="Which mark" onClick={() => toggle('mark')}>
          {MARKS.find((m) => m.key === one.mark)?.name ?? 'Stamp'}
          <span class="caret">▾</span>
        </button>
        <button class={`fig-swatch-btn ${pop === 'colour' ? 'on' : ''}`} title="Colour" aria-label="Colour" onClick={() => toggle('colour')}>
          <span style={{ background: swatch(one.color, '#1e1c19') }} />
        </button>
      </>
    );
  }

  const colourOf = (): ColorRef => {
    if (!one) return strokes[0]?.stroke ?? null;
    if (one.kind === 'text' || one.kind === 'sticky' || one.kind === 'mark') return one.color;
    if (one.kind === 'line' || one.kind === 'path') return one.stroke;
    return null;
  };

  return (
    <div class={`fig-chrome fig-bar ${below ? 'below' : ''}`} style={{ left: `${left}px`, top: `${top}px` }} onMouseDown={hold}>
      <div class="fig-bar-row">
        {quick}
        {tweaks && (
          <button class={`fig-icon-btn ${pop === 'tweak' ? 'on' : ''}`} title="Tweak spacing and effects" aria-label="Tweak" onClick={() => toggle('tweak')}>
            {icon(<path key="a" d="M4 7h9M17 7h3M4 17h3M11 17h9" />, <circle key="b" cx="15" cy="7" r="2" />, <circle key="c" cx="9" cy="17" r="2" />)}
          </button>
        )}
        {(quick || tweaks) && <span class="fig-sep" aria-hidden="true" />}
        {group && (
          <button class="fig-icon-btn" title="Ungroup the drawing" aria-label="Ungroup" onClick={onUngroup}>
            {icon(<rect key="a" x="3" y="3" width="8" height="8" rx="2" />, <rect key="b" x="13" y="13" width="8" height="8" rx="2" />)}
          </button>
        )}
        <button class="fig-icon-btn" title="Bring forward" aria-label="Bring forward" onClick={() => onOrder(1)}>
          {icon(<path key="a" d="M12 19V5M6 11l6-6 6 6" />)}
        </button>
        <button class="fig-icon-btn" title="Send backward" aria-label="Send backward" onClick={() => onOrder(-1)}>
          {icon(<path key="a" d="M12 5v14M6 13l6 6 6-6" />)}
        </button>
        <button class="fig-icon-btn" title="Duplicate  ·  ⌘D" aria-label="Duplicate" onClick={onDuplicate}>
          {icon(<rect key="a" x="8" y="8" width="12" height="12" rx="2.5" />, <path key="b" d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />)}
        </button>
        <button class="fig-icon-btn danger" title="Delete  ·  ⌫" aria-label="Delete" onClick={onRemove}>
          {icon(<path key="a" d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />)}
        </button>
      </div>

      {pop && (
        <div class={`fig-bar-pop pop-${pop}`}>
          {pop === 'style' && text && (
            <div class="fig-bar-looks">
              {[null, ...Object.keys(looks)].map((k) => (
                <button key={k ?? 'plain'} class={`fig-look ${(text.look ?? null) === k ? 'on' : ''}`} title={k ? looks[k]!.label : 'Plain'} onClick={() => set('Text style', { look: k ?? undefined, amount: undefined })}>
                  <span dangerouslySetInnerHTML={{ __html: canvasTypeSampleSvg(ds, k, 'Aa') }} />
                </button>
              ))}
            </div>
          )}
          {pop === 'colour' &&
            colourDots(colourOf(), (c) =>
              onChange('Colour', (l) =>
                l.kind === 'text' || l.kind === 'sticky' || l.kind === 'mark' ? ({ ...l, color: c } as FreeformLayer) : l.kind === 'line' || l.kind === 'path' ? { ...l, stroke: c } : l,
              ),
            )}
          {pop === 'fill' && sticky && colourDots(sticky.fill, (c) => set('Note colour', { fill: c ?? STICKY_COLORS[0] }), STICKY_COLORS, 'Yellow')}
          {pop === 'fill' && shape && colourDots(shape.fill, (c) => set('Fill', { fill: c }), STICKY_COLORS, 'No fill')}
          {pop === 'outline' && shape && colourDots(shape.stroke, (c) => set('Outline colour', { stroke: c }), [], 'No outline')}
          {pop === 'mark' && one?.kind === 'mark' && (
            <div class="fig-bar-looks">
              {MARKS.map((m) => (
                <button key={m.key} class={`fig-stamp ${one.mark === m.key ? 'on' : ''}`} title={m.name} onClick={() => set('Stamp', { mark: m.key, height: Math.round(one.width / m.ratio) })}>
                  <svg viewBox={m.viewBox} fill={swatch(one.color, '#1e1c19')} aria-hidden="true" dangerouslySetInnerHTML={{ __html: m.body }} />
                </button>
              ))}
            </div>
          )}
          {pop === 'tweak' && tweaks && <div class="fig-sliders">{tweaks}</div>}
          {pop === 'brush' && (
            <div class="fig-bar-looks">
              {BRUSHES.map((b) => (
                <button
                  key={b.brush}
                  class={`fig-look ${brushOf === b.brush ? 'on' : ''}`}
                  title={`${b.label}. ${b.help}`}
                  onClick={() => onChange('Pen type', (l) => (l.kind === 'path' ? { ...l, brush: b.brush, strokeWidth: b.width } : l))}
                >
                  <span dangerouslySetInnerHTML={{ __html: brushSampleSvg(ds, b.brush, firstStroke?.stroke ?? null) }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Slide({ label, unit, min, max, step = 1, value, onInput }: { label: string; unit: string; min: number; max: number; step?: number; value: number; onInput(v: number): void }) {
  return (
    <label class="fig-slide">
      <span class="fig-slide-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))} />
      <span class="fig-slide-val">
        {Math.round(value * 10) / 10}
        {unit}
      </span>
    </label>
  );
}

// --- the slash menu -----------------------------------------------------------------------------------

export interface FigSlashProps {
  ds: DesignSystem;
  items: CanvasCommand[];
  index: number;
  query: string;
  left: number;
  top: number;
  onPick(item: CanvasCommand): void;
  onHover(index: number): void;
}

const GROUP_GLYPHS: Record<string, string> = { Size: 'Aa', Spacing: 'A↔', Align: '≡' };

export function FigSlash({ ds, items, index, query, left, top, onPick, onHover }: FigSlashProps) {
  let last = '';
  return (
    <div class="fig-slash" style={{ left: `${left}px`, top: `${top}px` }} onMouseDown={(e) => e.preventDefault()} role="listbox">
      {items.length === 0 && <div class="fig-slash-empty">Nothing called “{query}”. Keep typing, or Esc.</div>}
      {items.map((item, i) => {
        const head = item.group !== last;
        last = item.group;
        return (
          <div key={item.id}>
            {head && <div class="fig-slash-group">{item.group}</div>}
            <button
              class={`fig-slash-item ${i === index ? 'on' : ''}`}
              role="option"
              aria-selected={i === index}
              title={item.hint}
              ref={(el) => {
                if (i === index) el?.scrollIntoView({ block: 'nearest' });
              }}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(item)}
            >
              <span class="fig-slash-preview">
                {item.look !== undefined ? (
                  <span class="look" dangerouslySetInnerHTML={{ __html: canvasTypeSampleSvg(ds, item.look, 'Aa') }} />
                ) : item.swatch ? (
                  <span class="swatch" style={{ background: item.swatch }} />
                ) : (
                  <span class="glyph">{GROUP_GLYPHS[item.group] ?? '·'}</span>
                )}
              </span>
              <span class="fig-slash-label">{item.label}</span>
              <span class="fig-slash-hint">{item.hint}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
