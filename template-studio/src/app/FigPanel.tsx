import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { brushSampleSvg, canvasTypeSampleSvg } from '../compile/freeform.ts';
import { LAYER_NAMES, layerName, textStyleOf, type CanvasCommand } from '../model/canvas-text.ts';
import { canvasTypeOf, colorOf, firstPreset, theme, type ColorRef, type DesignSystem } from '../model/design-system.ts';
import { BRUSHES, groupKey, groupRuns, STICKY_COLORS } from '../model/freeform.ts';
import { hasTweaks } from '../model/brand-presets.ts';
import { BRAND_PRESETS } from './features.ts';
import { alignToPage, geometryOf, withGeometry, withOpacity, withRotation, type AlignEdge } from '../model/properties.ts';
import { unitsOf } from '../model/selection.ts';
import { FRAME_SIZES, sizeOf } from '../model/frame-sizes.ts';
import { frameToPicture, imagePlacement, MAX_ZOOM, type ImageLayer } from '../model/image-layer.ts';
import { measureImage, shownImageHref } from './picture-size.ts';
import { selectionOf } from './surface-tools.tsx';
import { MARKS } from '../model/marks.ts';
import { Riso } from '../effects/riso.ts';
import { EFFECT_HELP, EFFECT_KINDS, EFFECT_LABELS, LOOKS, withLayerEffects, misregister, moveStep, newStep, readSavedRisoPresets, RISO_PRESETS, RISO_PROJECT_PRESETS, RISO_SWATCHES, risoStep, withSavedRisoPreset, type SavedRisoPreset } from '../model/effects.ts';
import type { MarkKey, MarkState } from '../model/rich-text.ts';
import type { Align, EffectKind, EffectStep, FreeformBlock, FreeformLayer, RisoInk, RisoStep, TextMarks } from '../model/types.ts';

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

const KIND_ICONS: Record<FreeformLayer['kind'] | 'group' | 'bundle', () => JSX.Element> = {
  text: () => icon(<path key="a" d="M6 6.5h12M12 6.5v12" />),
  sticky: () => icon(<path key="a" d="M5 4.5h14v9.8L14.3 19.5H5z" />, <path key="b" d="M14 19.3v-5h5" />),
  rect: () => icon(<rect key="a" x="4" y="6" width="16" height="12" rx="2.5" />),
  ellipse: () => icon(<ellipse key="a" cx="12" cy="12" rx="8" ry="6" />),
  line: () => icon(<path key="a" d="M5 19L19 5" />),
  path: () => icon(<path key="a" d="M4 16c3-7 5 3 8-3s5 2 8-4" />),
  image: () => icon(<rect key="a" x="4" y="5" width="16" height="14" rx="2" />, <path key="b" d="M4 16l5-5 4 4 2-2 5 5" />),
  mark: () => icon(<circle key="a" cx="12" cy="9" r="4.6" />, <path key="b" d="M9.5 13.2L9 16.5h6l-.5-3.3M6 19.5h12" />),
  bundle: () => icon(<rect key="a" x="3.5" y="3.5" width="17" height="17" rx="2.5" strokeDasharray="3 2.5" />, <rect key="b" x="8" y="8" width="8" height="8" rx="1.5" />),
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
  /** `add`: Shift was held, so the row joins or leaves what is picked. */
  onPick(key: string | null, add?: boolean): void;
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
  /** The page's effects, replaced as a list. `coalesce` makes a slider drag one undo step. */
  onEffects(next: EffectStep[] | undefined, label: string, coalesce?: string): void;
  onOpenRiso(): void;
  /** A line about the effect: where the Riso tab is, or why it could not open. */
  effectNote?: string | null;
  /** The printed picture is being made again after a change. */
  effectBusy?: boolean;
  /** Text layers' measured heights, which their recipes do not hold. */
  heights: Record<string, number>;
  /** Swaps in changed layers from the properties panel. `coalesce` makes a run of edits one undo step. */
  onLayers(label: string, next: FreeformLayer[], coalesce?: string): void;
  /** Several things picked: line them up with each other, space them, make them a group. */
  /** The largest page this canvas allows: an email block's, or a Freeform frame's. */
  pageMax: { width: number; height: number };
  onAlignUnits(edge: AlignEdge): void;
  onDistribute(axis: 'x' | 'y'): void;
  onGroup(): void;
}

export function FigLayers({ block, ds, picked, hover, onPick, onHover, onEdit, onDuplicate, onRemove, onUngroup, onMove, onPage, onClose, onEffects, onOpenRiso, effectNote, effectBusy, heights, onLayers, onAlignUnits, onDistribute, onGroup, pageMax }: FigLayersProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const pickedUnits = unitsOf(picked);
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
        class={`fig-layer ${pickedUnits.includes(key) ? 'on' : ''} ${hover === key ? 'hover' : ''} ${depth ? 'nested' : ''} ${index !== null && gap === index && dragKey ? 'gap-before' : ''} ${index !== null && gap === index + 1 && dragKey && index === n - 1 ? 'gap-after' : ''}`}
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
        <button class="fig-layer-main" title={`${LAYER_NAMES[l.kind]}. Drag to reorder.`} onClick={(e) => onPick(e.shiftKey ? key : picked === key ? null : key, e.shiftKey)} onDblClick={() => (l.kind === 'text' || l.kind === 'sticky') && onEdit(l.id)}>
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
                class={`fig-layer ${pickedUnits.includes(key) ? 'on' : ''} ${hover === key ? 'hover' : ''} ${gap === index && dragKey ? 'gap-before' : ''} ${gap === index + 1 && dragKey && index === n - 1 ? 'gap-after' : ''}`}
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
                <button class="fig-layer-main" title="A group: they move, scale, colour and delete together. Alt-click one on the canvas to pick it alone." onClick={(e) => onPick(e.shiftKey ? key : picked === key ? null : key, e.shiftKey)}>
                  {/* Strokes from one pen session are a drawing; anything grouped by hand is a group. */}
                  <span class="fig-layer-icon k-group">{item.layers.every((l) => l.kind === 'path') ? KIND_ICONS.group() : KIND_ICONS.bundle()}</span>
                  <span class="fig-layer-name">{item.layers.every((l) => l.kind === 'path') ? 'Drawing' : 'Group'}</span>
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

      {picked && selectionOf(block, picked) ? (
        <FigProps block={block} ds={ds} pickedKey={picked} heights={heights} onLayers={onLayers} onAlignUnits={onAlignUnits} onDistribute={onDistribute} onGroup={onGroup} />
      ) : (
      <div class="fig-page">
        <div class="fig-page-row">
          <b>Page</b>
          <label title="Width of the picture, in pixels">
            W
            <input type="number" min={40} max={pageMax.width} value={block.width} onChange={(e) => onPage({ width: clamp(Number((e.target as HTMLInputElement).value), 40, pageMax.width) })} />
          </label>
          <label title="Height of the picture, in pixels">
            H
            <input type="number" min={20} max={pageMax.height} value={block.height} onChange={(e) => onPage({ height: clamp(Number((e.target as HTMLInputElement).value), 20, pageMax.height) })} />
          </label>
        </div>
        <label class="fig-prop wide" title="A standard size. The layers stay where they are.">
          <span class="fig-prop-label">Size</span>
          <select
            value={sizeOf(block.width, block.height)?.key ?? ''}
            onChange={(e) => {
              const s = FRAME_SIZES.find((x) => x.key === (e.target as HTMLSelectElement).value);
              if (s) onPage({ width: s.width, height: s.height });
            }}
          >
            <option value="">Custom</option>
            {FRAME_SIZES.filter((s) => s.width <= pageMax.width && s.height <= pageMax.height).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} · {s.width} × {s.height}
              </option>
            ))}
          </select>
        </label>
        <div class="fig-page-row dots" role="group" aria-label="Page background">
          <button class={`fig-dot clear ${block.background === null ? 'on' : ''}`} title="No background: the email shows through" aria-label="No background" onClick={() => onPage({ background: null })} />
          {palette.map((name) => (
            <button key={name} class={`fig-dot ${block.background === name ? 'on' : ''}`} style={{ background: colorOf(ds, name) ?? undefined }} title={`${name} background`} aria-label={`${name} background`} onClick={() => onPage({ background: name })} />
          ))}
        </div>
      </div>
      )}

      {(() => {
        // The one layer picked has its own stack; nothing picked, or a drawing, is the page's.
        const sel = picked ? selectionOf(block, picked) : null;
        const layer = sel && !sel.many ? sel.layers[0] : undefined;
        return layer ? (
          <FigEffects
            key={`layer:${layer.id}`}
            steps={layer.effects}
            scope={LAYER_NAMES[layer.kind]}
            onSteps={(next, label, coalesce) => onLayers(label, [withLayerEffects(layer, next)], coalesce ? `fx:${layer.id}:${coalesce}` : undefined)}
            note={null}
            busy={Boolean(effectBusy)}
          />
        ) : (
          <FigEffects key="page" steps={block.effects} scope="Page" onSteps={onEffects} onOpenRiso={onOpenRiso} note={effectNote ?? null} busy={Boolean(effectBusy)} />
        );
      })()}
    </div>
  );
}

// --- effects ----------------------------------------------------------------------------------------

/**
 * The presets' screens at half size. They were tuned on 900px photographs; a page of drawn lines and
 * type loses its detail in dots that coarse, and at half size it still reads as a print.
 */
const pageScreens = <T extends EffectStep>(step: T): T =>
  step.effect === 'riso' ? ({ ...step, inks: step.inks.map((k) => ({ ...k, cell: Math.max(2, Math.round(k.cell) / 2) })) } as T) : step;

const PAPERS: Array<[string, string]> = [
  ['Natural', '#f6f2e8'],
  ['White', '#ffffff'],
  ['Kraft', '#e9dcc2'],
  ['Grey', '#dfe6e9'],
];

/** A step's switch and strength, carried over when its settings are replaced by a look. */
const keepBase = (s: EffectStep) => ({ ...(s.off ? { off: true } : {}), ...(s.strength !== undefined ? { strength: s.strength } : {}) });

/** A colour field with its hex beside it, so a colour is never told by its swatch alone. */
function HexField({ label, value, onInput }: { label: string; value: string; onInput(v: string): void }) {
  return (
    <label class="fig-hex" title={`${label}: ${value}`}>
      <span class="fig-slide-label">{label}</span>
      <input type="color" value={value} onInput={(e) => onInput((e.target as HTMLInputElement).value.toLowerCase())} />
      <code>{value.toUpperCase()}</code>
    </label>
  );
}

function Seg<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: readonly T[]; onPick(v: T): void }) {
  return (
    <div class="fig-page-row">
      <span class="fig-slide-label">{label}</span>
      <span class="fig-seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} class={value === o ? 'on' : ''} aria-pressed={value === o} onClick={() => onPick(o)}>
            {o.replace('-', ' ')}
          </button>
        ))}
      </span>
    </div>
  );
}

/** One step's own dials. Riso has its own set. */
function StepDials({ step, set, onOpenRiso }: { step: EffectStep; set(next: EffectStep, label: string, coalesce?: string): void; onOpenRiso?: () => void }) {
  const name = EFFECT_LABELS[step.effect];
  const dial = (label: string, unit: string, min: number, max: number, value: number, patch: (v: number) => Partial<EffectStep>, stepBy = 1) => (
    <Slide label={label} unit={unit} min={min} max={max} step={stepBy} value={value} onInput={(v) => set({ ...step, ...patch(v) } as EffectStep, `${name} ${label.toLowerCase()}`, `fx-${step.effect}-${label}`)} />
  );
  switch (step.effect) {
    case 'riso':
      return <RisoDials step={step} set={set} onOpenRiso={onOpenRiso} />;
    case 'adjust':
      return (
        <div class="fig-sliders fig-step-body">
          {dial('Exposure', ' st', -3, 3, step.exposure ?? 0, (v) => ({ exposure: v }), 0.1)}
          {dial('Brightness', '', -100, 100, step.brightness, (v) => ({ brightness: v }))}
          {dial('Contrast', '', -100, 100, step.contrast, (v) => ({ contrast: v }))}
          {dial('Saturation', '', -100, 100, step.saturation, (v) => ({ saturation: v }))}
          {dial('Vibrance', '', -100, 100, step.vibrance ?? 0, (v) => ({ vibrance: v }))}
          {dial('Warmth', '', -100, 100, step.temperature ?? 0, (v) => ({ temperature: v }))}
          {dial('Tint', '', -100, 100, step.tint ?? 0, (v) => ({ tint: v }))}
        </div>
      );
    case 'duotone':
      return (
        <div class="fig-sliders fig-step-body">
          <HexField label="Shadows" value={step.shadow} onInput={(v) => set({ ...step, shadow: v }, 'Duotone shadows', 'fx-duo-sh')} />
          <HexField label="Highlights" value={step.highlight} onInput={(v) => set({ ...step, highlight: v }, 'Duotone highlights', 'fx-duo-hi')} />
          {dial('Balance', '', -100, 100, step.balance ?? 0, (v) => ({ balance: v }))}
        </div>
      );
    case 'posterize':
      return (
        <div class="fig-sliders fig-step-body">
          {dial('Levels', '', 2, 12, step.levels, (v) => ({ levels: v }))}
          {dial('Gamma', '', 1, 10, step.gamma, (v) => ({ gamma: v }), 0.5)}
          <Seg label="Dither" value={step.dither ?? 'none'} options={['none', 'ordered', 'diffusion'] as const} onPick={(v) => set({ ...step, dither: v }, 'Posterize dither')} />
        </div>
      );
    case 'halftone':
      return (
        <div class="fig-sliders fig-step-body">
          <Seg label="Inks" value={step.mode ?? 'mono'} options={['mono', 'cmyk'] as const} onPick={(v) => set({ ...step, mode: v }, 'Halftone inks')} />
          <Seg label="Dot" value={step.shape} options={['circle', 'square', 'diamond', 'line', 'ellipse'] as const} onPick={(v) => set({ ...step, shape: v }, 'Halftone dot')} />
          {dial('Screen', 'px', 2, 40, step.spacing, (v) => ({ spacing: v }), 0.5)}
          {dial('Angle', '°', 0, 180, step.angle, (v) => ({ angle: v }))}
          {dial('Contrast', '', 1, 10, step.contrast, (v) => ({ contrast: v }), 0.5)}
          {dial('Dot gain', '%', 0, 100, step.gain ?? 0, (v) => ({ gain: v }))}
          {(step.mode ?? 'mono') === 'mono' && <HexField label="Ink" value={step.ink} onInput={(v) => set({ ...step, ink: v }, 'Halftone ink', 'fx-ht-ink')} />}
          <HexField label="Paper" value={step.paper} onInput={(v) => set({ ...step, paper: v }, 'Halftone paper', 'fx-ht-paper')} />
        </div>
      );
    case 'grain':
      return (
        <div class="fig-sliders fig-step-body">
          {dial('Amount', '%', 0, 100, step.amount, (v) => ({ amount: v }))}
          {dial('Size', 'px', 0.5, 4, step.size ?? 1, (v) => ({ size: v }), 0.1)}
          {dial('Mono', '%', 0, 100, step.mono, (v) => ({ mono: v }))}
          <button class="fig-reset" title="A new roll of the same grain" onClick={() => set({ ...step, seed: 1 + Math.floor(Math.random() * 99999) }, 'Reshuffle grain')}>
            Reshuffle
          </button>
        </div>
      );
    case 'texture':
      return (
        <div class="fig-sliders fig-step-body">
          <Seg label="Surface" value={step.kind} options={['paper', 'canvas', 'fibers', 'concrete', 'crosshatch'] as const} onPick={(v) => set({ ...step, kind: v }, 'Texture surface')} />
          <Seg label="Blend" value={step.blend} options={['multiply', 'overlay', 'soft-light', 'hard-light', 'screen'] as const} onPick={(v) => set({ ...step, blend: v }, 'Texture blend')} />
          {dial('Amount', '%', 0, 100, step.amount, (v) => ({ amount: v }))}
          {dial('Scale', '', 5, 100, step.scale, (v) => ({ scale: v }))}
          <button class="fig-reset" title="Another piece of the same surface" onClick={() => set({ ...step, seed: 1 + Math.floor(Math.random() * 99999) }, 'Reshuffle texture')}>
            Reshuffle
          </button>
        </div>
      );
    case 'blur':
      return <div class="fig-sliders fig-step-body">{dial('Radius', 'px', 0, 40, step.radius, (v) => ({ radius: v }), 0.5)}</div>;
    case 'sharpen':
      return (
        <div class="fig-sliders fig-step-body">
          {dial('Amount', '%', 0, 200, step.amount, (v) => ({ amount: v }))}
          {dial('Radius', 'px', 0.3, 5, step.radius, (v) => ({ radius: v }), 0.1)}
          {dial('Threshold', '', 0, 50, step.threshold, (v) => ({ threshold: v }))}
        </div>
      );
    case 'vignette':
      return (
        <div class="fig-sliders fig-step-body">
          {dial('Amount', '%', 0, 100, step.amount, (v) => ({ amount: v }))}
          {dial('Spread', '%', 5, 130, step.spread, (v) => ({ spread: v }))}
          {dial('Feather', '%', 0, 100, step.feather ?? 60, (v) => ({ feather: v }))}
          {dial('Roundness', '%', 0, 100, step.roundness ?? 0, (v) => ({ roundness: v }))}
        </div>
      );
  }
}

const eyeOn = () => icon(<path key="a" d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />, <circle key="b" cx="12" cy="12" r="2.8" />);
const eyeOff = () => icon(<path key="a" d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />, <path key="b" d="M4 20L20 4" />);

/**
 * Effects as a stack, on the page or on the one layer picked. Each step can be switched off, turned down,
 * moved up or down and removed, and opens to its own dials. Looks put a whole stack on at once.
 */
function FigEffects({ steps, scope, onSteps, onOpenRiso, note, busy }: { steps: EffectStep[] | undefined; scope: string; onSteps(next: EffectStep[] | undefined, label: string, coalesce?: string): void; onOpenRiso?: () => void; note: string | null; busy: boolean }) {
  const list = steps ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [looks, setLooks] = useState(false);
  const replace = (i: number, next: EffectStep, label: string, coalesce?: string) => onSteps(list.map((s, j) => (j === i ? next : s)), label, coalesce);
  const add = (kind: EffectKind) => {
    const seed = 1 + Math.floor(Math.random() * 99999);
    const made = kind === 'riso' && scope === 'Page' ? pageScreens(risoStep(0, seed)) : newStep(kind, seed);
    onSteps([...list, made], `Add ${EFFECT_LABELS[kind].toLowerCase()}`);
    setOpen(list.length);
    setAdding(false);
  };
  const looksGrid = (
    <div class="fig-fx-chips" role="group" aria-label="Looks">
      {LOOKS.map((look) => (
        <button
          key={look.name}
          class="fig-fx-chip"
          title={`${look.name}: ${look.desc}. Replaces the effects here.`}
          onClick={() => {
            onSteps(look.steps().map((s) => (s.effect === 'riso' && scope === 'Page' ? pageScreens(s) : s)), `Look · ${look.name}`);
            setOpen(null);
            setLooks(false);
          }}
        >
          {look.name}
        </button>
      ))}
    </div>
  );

  return (
    <div class="fig-effects">
      <div class="fig-page-row">
        <b>Effects</b>
        <span class="fig-fx-scope" title={scope === 'Page' ? 'On the whole page, after every layer is drawn.' : 'On this layer alone, inside its own shape.'}>
          {scope}
        </span>
        <span class="grow" />
        {busy && <span class="fig-fx-busy">Rendering</span>}
        <button class={`fig-text-btn ${looks ? 'on' : ''}`} title="Whole stacks, ready made" aria-expanded={looks} onClick={() => setLooks((v) => !v)}>
          Looks
        </button>
        <button class={`fig-icon-btn ${adding ? 'on' : ''}`} title="Add an effect" aria-label="Add an effect" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
          {icon(<path key="a" d="M12 5v14M5 12h14" />)}
        </button>
      </div>
      {adding && (
        <ul class="fig-fx-menu" role="menu">
          {EFFECT_KINDS.map((k) => (
            <li key={k}>
              <button role="menuitem" title={EFFECT_HELP[k]} onClick={() => add(k)}>
                <b>{EFFECT_LABELS[k]}</b>
                <span>{EFFECT_HELP[k]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {looks && looksGrid}
      {list.length === 0 && !adding && !looks && (
        <p class="fig-fx-hint">
          {scope === 'Page' ? 'Nothing on the page. Add an effect, or pick a look. Pick a layer to give it effects of its own.' : 'Nothing on this layer. Add an effect, or pick a look.'}
        </p>
      )}
      {list.length > 0 && (
        <ol class="fig-fx-stack">
          {list.map((step, i) => {
            const strength = Math.round((step.strength ?? 1) * 100);
            const expanded = open === i;
            return (
              <li key={i} class={`fig-fx-step ${step.off ? 'off' : ''} ${expanded ? 'open' : ''}`}>
                <div class="fig-fx-row">
                  <button class="fig-icon-btn" title={step.off ? 'Off. Click to switch it on.' : 'On. Click to switch it off.'} aria-label={step.off ? `Switch ${EFFECT_LABELS[step.effect]} on` : `Switch ${EFFECT_LABELS[step.effect]} off`} aria-pressed={!step.off} onClick={() => replace(i, step.off ? (({ off: _o, ...rest }) => (void _o, rest as EffectStep))(step) : { ...step, off: true }, step.off ? 'Effect on' : 'Effect off')}>
                    {step.off ? eyeOff() : eyeOn()}
                  </button>
                  <button class="fig-fx-name-btn" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : i)}>
                    <span class="fig-fx-num">{i + 1}</span>
                    {EFFECT_LABELS[step.effect]}
                    <span class="caret">{expanded ? '▾' : '▸'}</span>
                  </button>
                  <span class="fig-fx-strength" title="Strength: how much of this step shows">
                    <input type="range" min={0} max={100} value={strength} aria-label={`${EFFECT_LABELS[step.effect]} strength`} onInput={(e) => replace(i, { ...step, strength: Number((e.target as HTMLInputElement).value) / 100 }, 'Strength', `fx-strength-${i}`)} />
                    <span>{strength}%</span>
                  </span>
                </div>
                {expanded && (
                  <>
                    <StepDials step={step} set={(next, label, coalesce) => replace(i, next, label, coalesce)} onOpenRiso={scope === 'Page' ? onOpenRiso : undefined} />
                    <div class="fig-fx-actions">
                      <button class="fig-chip" disabled={i === 0} title="Run this step earlier" onClick={() => { onSteps(moveStep(list, i, i - 1), 'Move effect up'); setOpen(i - 1); }}>
                        Up
                      </button>
                      <button class="fig-chip" disabled={i === list.length - 1} title="Run this step later" onClick={() => { onSteps(moveStep(list, i, i + 1), 'Move effect down'); setOpen(i + 1); }}>
                        Down
                      </button>
                      <button class="fig-chip danger" title="Take this step off. Everything else stays." onClick={() => { onSteps(list.filter((_, j) => j !== i), 'Remove effect'); setOpen(null); }}>
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {note && <p class="fig-fx-hint">{note}</p>}
    </div>
  );
}

/**
 * A Riso step's settings: the inks, the screen, the few dials worth having on the canvas, the paper, the
 * project's saved looks, and every other dial one click away in the Riso tool itself (page only).
 */
function RisoDials({ step, set, onOpenRiso }: { step: RisoStep; set(next: RisoStep, label: string, coalesce?: string): void; onOpenRiso?: () => void }) {
  const [ink, setInk] = useState<number | null>(null);
  // The project's saved looks, kept current when one is saved in the Riso tab.
  const [saved, setSaved] = useState<SavedRisoPreset[]>(readSaved);
  const [naming, setNaming] = useState<string | null>(null);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === RISO_PROJECT_PRESETS) setSaved(readSaved());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const saveLook = () => {
    if (naming === null) return;
    try {
      localStorage.setItem(RISO_PROJECT_PRESETS, withSavedRisoPreset(localStorage.getItem(RISO_PROJECT_PRESETS), naming, step, `p${Date.now().toString(36)}`));
      setSaved(readSaved());
    } catch {
      // Storage full or blocked: the look stays on the page, just not in the list.
    }
    setNaming(null);
  };
  const first = step.inks[0];
  const screen = first?.screen ?? 'dot';
  const addInk = () => {
    const used = new Set(step.inks.map((k) => k.color));
    const color = ['#ffe800', '#00a95c', '#ff48b0', '#0078bf', '#1d1d1b'].find((c) => !used.has(c)) ?? '#1d1d1b';
    const n = step.inks.length;
    const added: RisoInk = { ...Riso.INK_DEFAULT, color, source: (['lum', 'mids', 'highlights'] as const)[n] ?? 'lum', angle: [15, 75, 45][n] ?? 0, screen, cell: first?.cell ?? Riso.INK_DEFAULT.cell };
    set(misregister({ ...step, inks: [...step.inks, added] }, step.press.misreg), 'Add ink');
    setInk(n);
  };

  return (
    <div class="fig-step-body">
      <div class="fig-page-row">
        {step.inks.map((k, i) => (
          <button key={i} class={`fig-dot ${ink === i ? 'on' : ''}`} style={{ background: k.color }} title={`Ink ${i + 1}: ${Riso.inkName(k.color)}. Click to change it.`} aria-label={`Ink ${i + 1}`} onClick={() => setInk(ink === i ? null : i)} />
        ))}
        {step.inks.length < 3 && (
          <button class="fig-dot fig-dot-add" title="Add an ink (up to three)" aria-label="Add an ink" onClick={addInk}>
            +
          </button>
        )}
        <span class="grow" />
        <span class="fig-seg" role="group" aria-label="Screen">
          {(['dot', 'line', 'grain'] as const).map((s) => (
            <button key={s} class={screen === s ? 'on' : ''} aria-pressed={screen === s} onClick={() => set({ ...step, inks: step.inks.map((k) => ({ ...k, screen: s })) }, 'Screen')}>
              {s}
            </button>
          ))}
        </span>
      </div>

      {ink !== null && step.inks[ink] && (
        <div class="fig-fx-swatches">
          {RISO_SWATCHES.map(([name, hex]) => (
            <button key={hex} class={`fig-dot ${step.inks[ink]!.color === hex ? 'on' : ''}`} style={{ background: hex }} title={name} aria-label={name} onClick={() => set({ ...step, inks: step.inks.map((k, j) => (j === ink ? { ...k, color: hex } : k)) }, 'Ink colour')} />
          ))}
          {step.inks.length > 1 && (
            <button
              class="fig-reset"
              onClick={() => {
                set({ ...step, inks: step.inks.filter((_, j) => j !== ink) }, 'Remove ink');
                setInk(null);
              }}
            >
              Remove this ink
            </button>
          )}
        </div>
      )}

      <div class="fig-sliders">
        {screen !== 'grain' && <Slide label="Screen" unit="px" min={2} max={24} step={0.5} value={first?.cell ?? 6} onInput={(v) => set({ ...step, inks: step.inks.map((k) => ({ ...k, cell: v })) }, 'Screen size', 'fx-cell')} />}
        <Slide label="Misprint" unit="mm" min={0} max={3} step={0.1} value={step.press.misreg} onInput={(v) => set(misregister(step, v), 'Misprint', 'fx-misreg')} />
        <Slide label="Ink soak" unit="%" min={0} max={100} value={Math.round(step.press.soak * 100)} onInput={(v) => set({ ...step, press: { ...step.press, soak: v / 100 } }, 'Ink soak', 'fx-soak')} />
        <Slide label="Paper grain" unit="%" min={0} max={100} value={Math.round(step.press.grain * 100)} onInput={(v) => set({ ...step, press: { ...step.press, grain: v / 100 } }, 'Paper grain', 'fx-grain')} />
      </div>

      <div class="fig-page-row dots" role="group" aria-label="Paper">
        {PAPERS.map(([name, hex]) => (
          <button key={hex} class={`fig-dot ${step.press.paper === hex ? 'on' : ''}`} style={{ background: hex }} title={`${name} paper`} aria-label={`${name} paper`} onClick={() => set({ ...step, press: { ...step.press, paper: hex } }, 'Paper')} />
        ))}
      </div>

      {naming !== null && (
        <form
          class="fig-fx-name"
          onSubmit={(e) => {
            e.preventDefault();
            saveLook();
          }}
        >
          <input
            ref={(el) => el?.focus()}
            value={naming}
            placeholder="Name this look"
            maxLength={40}
            onInput={(e) => setNaming((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setNaming(null);
              e.stopPropagation();
            }}
          />
          <button class="fig-chip primary" type="submit">
            Save
          </button>
        </form>
      )}

      <div class="fig-fx-chips" role="group" aria-label="Looks">
        {RISO_PRESETS.map((p, i) => (
          <button key={p.name} class="fig-fx-chip" title={`${p.name}: ${p.desc}`} onClick={() => set({ ...pageScreens(risoStep(i, step.seed)), ...keepBase(step) }, `Riso · ${p.name}`)}>
            <span class="fig-fx-inks" aria-hidden="true">
              {p.apply.inks.map((k, j) => (
                <i key={j} style={{ background: k.color }} />
              ))}
            </span>
            {p.name}
          </button>
        ))}
        {saved.map((p) => (
          <button key={p.id} class="fig-fx-chip saved" title={`${p.name}: saved in this project`} onClick={() => set({ ...p.step, ...keepBase(step) }, `Riso · ${p.name}`)}>
            <span class="fig-fx-inks" aria-hidden="true">
              {p.step.inks.map((k, j) => (
                <i key={j} style={{ background: k.color }} />
              ))}
            </span>
            {p.name}
          </button>
        ))}
      </div>

      <div class="fig-fx-actions">
        <button
          class="fig-chip"
          title="A new roll: grain, screen noise and misprint"
          onClick={() => set(misregister(step, step.press.misreg, 1 + Math.floor(Math.random() * 99999)), 'Reshuffle')}
        >
          Reshuffle
        </button>
        <button class="fig-chip" title="Save these settings as a look for the project. The Riso tool and every Freeform page offer it." onClick={() => setNaming('')}>
          Save look
        </button>
        {onOpenRiso && (
          <button class="fig-chip primary" title="Open this page in the Riso separator with every dial. Back to Freeform there sends the settings here." onClick={onOpenRiso}>
            Open in Riso ↗
          </button>
        )}
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
  /** Several things picked rather than one: no per-kind controls, and a Group button. */
  multi?: boolean;
  onGroup?(): void;
  /** Saves the picked text's look into the design system's brand presets: into its own, or as a new one. */
  onSavePreset?(mode: 'update' | 'new', label?: string): void;
}

type Pop = 'style' | 'font' | 'colour' | 'fill' | 'outline' | 'tweak' | 'mark' | 'brush' | null;

/** A design system font's key as a name: `georgia` is Georgia. */
const fontName = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export function FigBar({ ds, layers, group, left, top, below, onChange, onDuplicate, onRemove, onUngroup, onOrder, onSavePreset, multi, onGroup }: FigBarProps) {
  const [pop, setPop] = useState<Pop>(null);
  const one = group || multi ? undefined : layers[0];
  const inverted = layers.length > 0 && layers.every((l) => l.invert);
  const id = group ?? (multi ? layers.map((l) => l.id).join(',') : one?.id) ?? '';
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
  const words = text ?? sticky;
  const fontChip =
    words && style ? (
      <button class={`fig-chip ${pop === 'font' ? 'on' : ''}`} title="Font, from the design system  ·  or type /font while editing" onClick={() => toggle('font')}>
        <span class="fig-font-aa" style={{ fontFamily: style.font }}>
          Aa
        </span>
        {words.font ? fontName(words.font) : 'Font'}
        <span class="caret">▾</span>
      </button>
    ) : null;
  const looks = canvasTypeOf(ds);
  const firstStroke = strokes[0];
  const brushOf = firstStroke?.kind === 'path' ? (firstStroke.brush ?? 'marker') : null;

  let quick: JSX.Element | null = null;
  let tweaks: JSX.Element | null = null;

  if (text && style) {
    const lookLabel = text.look ? (looks[text.look]?.label ?? 'Preset') : 'Plain';
    const preset = text.look ? looks[text.look] : undefined;
    const tweaked = hasTweaks(text);
    quick = (
      <>
        {BRAND_PRESETS && (
          <button class={`fig-chip ${pop === 'style' ? 'on' : ''}`} title="Brand preset  ·  or type / while editing" onClick={() => toggle('style')}>
            <span class="fig-chip-sample" dangerouslySetInnerHTML={{ __html: canvasTypeSampleSvg(ds, text.look ?? null, 'Aa') }} />
            {lookLabel}
            <span class="caret">▾</span>
          </button>
        )}
        {fontChip}
        {stepper('Size', style.size, style.size >= 40 ? 4 : 2, 6, 240, (v) => set('Text size', { size: v }, 'size'))}
        <button class={`fig-icon-btn ${style.weight === 'bold' ? 'on' : ''}`} title="Bold" aria-label="Bold" aria-pressed={style.weight === 'bold'} onClick={() => set('Bold', { weight: style.weight === 'bold' ? 'normal' : 'bold' })}>
          <span class="fmt-glyph">B</span>
        </button>
        <button class={`fig-icon-btn ${style.italic ? 'on' : ''}`} title="Italic" aria-label="Italic" aria-pressed={style.italic} onClick={() => set('Italic', { italic: !style.italic })}>
          <span class="fmt-glyph italic">I</span>
        </button>
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
        {tweaked && (
          <button class="fig-reset" onClick={() => set('Reset text', { size: undefined, letterSpacing: undefined, lineHeight: undefined, amount: undefined, font: undefined, weight: undefined, italic: undefined, textCase: undefined })}>
            Back to {preset ? preset.label : 'the role'}
          </button>
        )}
        {onSavePreset && (
          <SavePreset
            presetName={preset?.label ?? null}
            canUpdate={Boolean(preset) && tweaked}
            onUpdate={() => onSavePreset('update')}
            onNew={(name) => onSavePreset('new', name)}
          />
        )}
      </>
    );
  } else if (sticky && style) {
    quick = (
      <>
        <button class={`fig-swatch-btn square ${pop === 'fill' ? 'on' : ''}`} title="Note colour" aria-label="Note colour" onClick={() => toggle('fill')}>
          <span style={{ background: swatch(sticky.fill, STICKY_COLORS[0]!) }} />
        </button>
        {fontChip}
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
          <button class={`fig-icon-btn ${pop === 'tweak' ? 'on' : ''}`} title="Size and spacing, and saving them as a brand preset" aria-label="Tune" onClick={() => toggle('tweak')}>
            {icon(<path key="a" d="M4 7h9M17 7h3M4 17h3M11 17h9" />, <circle key="b" cx="15" cy="7" r="2" />, <circle key="c" cx="9" cy="17" r="2" />)}
          </button>
        )}
        {(quick || tweaks) && <span class="fig-sep" aria-hidden="true" />}
        {multi && onGroup && (
          <button class="fig-icon-btn" title="Group  ·  ⌘G" aria-label="Group" onClick={onGroup}>
            {icon(<rect key="a" x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3" />, <rect key="b" x="7" y="7" width="10" height="10" rx="2" />)}
          </button>
        )}
        {group && (
          <button class="fig-icon-btn" title="Ungroup  ·  ⇧⌘G" aria-label="Ungroup" onClick={onUngroup}>
            {icon(<rect key="a" x="3" y="3" width="8" height="8" rx="2" />, <rect key="b" x="13" y="13" width="8" height="8" rx="2" />)}
          </button>
        )}
        <button
          class={`fig-icon-btn ${inverted ? 'on' : ''}`}
          aria-pressed={inverted}
          aria-label="Invert"
          title="Invert the colours: a photo as its negative, dark ink as light"
          onClick={() => onChange(inverted ? 'Uninvert' : 'Invert', (l) => ({ ...l, invert: inverted ? undefined : true }) as FreeformLayer)}
        >
          {icon(<circle key="a" cx="12" cy="12" r="8" />, <path key="b" d="M12 4a8 8 0 010 16z" fill="currentColor" />)}
        </button>
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
          {pop === 'font' && words && (
            <div class="fig-font-list">
              <button class={`fig-font-item ${words.font ? '' : 'on'}`} onClick={() => set('Font', { font: undefined })}>
                <span style={{ fontFamily: textStyleOf({ ...words, font: undefined } as typeof words, ds).font }}>Aa</span>
                Style’s font
              </button>
              {Object.entries(ds.fonts).map(([key, stack]) => (
                <button key={key} class={`fig-font-item ${words.font === key ? 'on' : ''}`} title={stack} onClick={() => set('Font', { font: key })}>
                  <span style={{ fontFamily: stack }}>Aa</span>
                  {fontName(key)}
                </button>
              ))}
            </div>
          )}
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
                ) : item.fontStack ? (
                  <span class="glyph face" style={{ fontFamily: item.fontStack }}>
                    Aa
                  </span>
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

// --- the format bar, while words are being typed --------------------------------------------------------

export interface FormatState extends MarkState {
  /** Formatting goes on the selected words, or on all of them when nothing is selected. */
  scope: 'selection' | 'all';
}

const HIGHLIGHTS = ['#FFE58A', '#FFC6D9', '#C4E4FF', '#CDEFC6', '#FFD2A8', '#E0D4FF'];

const FORMAT_KEYS: Array<{ key: MarkKey; label: string; keys: string }> = [
  { key: 'bold', label: 'Bold', keys: '⌘B' },
  { key: 'italic', label: 'Italic', keys: '⌘I' },
  { key: 'underline', label: 'Underline', keys: '⌘U' },
  { key: 'strike', label: 'Strikethrough', keys: '⇧⌘X' },
];

/**
 * Bold, italic, underline, strike, colour, highlight and font for the words being typed: the selected
 * ones, or every one when nothing is selected. It never takes focus, so the selection it acts on
 * stays selected while you click about in it.
 */
export function FigFormat({
  ds,
  state,
  left,
  top,
  below,
  onToggle,
  onMarks,
  onClear,
}: {
  ds: DesignSystem;
  state: FormatState;
  left: number;
  top: number;
  below: boolean;
  onToggle(key: MarkKey): void;
  onMarks(label: string, patch: Partial<TextMarks>): void;
  onClear(): void;
}) {
  const [pop, setPop] = useState<'colour' | 'highlight' | 'font' | null>(null);
  const toggle = (p: 'colour' | 'highlight' | 'font') => setPop((cur) => (cur === p ? null : p));
  const where = state.scope === 'selection' ? 'the selected words' : 'all the words';
  const palette = Object.keys(ds.colors).slice(0, 8);
  const colour = state.color ? (colorOf(ds, state.color) ?? state.color) : null;

  return (
    <div class={`fig-chrome fig-format ${below ? 'below' : ''}`} style={{ left: `${left}px`, top: `${top}px` }} onMouseDown={(e) => e.preventDefault()}>
      <div class="fig-bar-row">
        {FORMAT_KEYS.map(({ key, label, keys }) => (
          <button key={key} class={`fig-icon-btn ${state[key] ? 'on' : ''}`} aria-pressed={state[key]} aria-label={label} title={`${label} ${where}  ·  ${keys}`} onClick={() => onToggle(key)}>
            <span class={`fmt-glyph ${key}`}>{label[0]}</span>
          </button>
        ))}
        <span class="fig-sep" aria-hidden="true" />
        <button class={`fig-swatch-btn ${pop === 'colour' ? 'on' : ''}`} aria-label="Colour" title={`Colour ${where}`} onClick={() => toggle('colour')}>
          <span class={colour ? '' : 'empty'} style={colour ? { background: colour } : undefined} />
        </button>
        <button class={`fig-icon-btn ${pop === 'highlight' ? 'on' : ''}`} aria-label="Highlight" title={`Highlight ${where}`} onClick={() => toggle('highlight')}>
          <span class="fmt-hl" style={{ background: `linear-gradient(transparent 55%, ${state.highlight ?? '#FFE58A'} 55%, ${state.highlight ?? '#FFE58A'} 92%, transparent 92%)` }}>
            ab
          </span>
        </button>
        <button class={`fig-chip ${pop === 'font' ? 'on' : ''}`} title={`Font for ${where}`} onClick={() => toggle('font')}>
          <span class="fig-font-aa" style={state.font ? { fontFamily: ds.fonts[state.font] } : undefined}>
            Aa
          </span>
          {state.font ? fontName(state.font) : state.font === undefined ? 'Mixed' : 'Font'}
          <span class="caret">▾</span>
        </button>
        <span class="fig-sep" aria-hidden="true" />
        <button class="fig-icon-btn" aria-label="Clear formatting" title={`Clear the formatting on ${where}`} onClick={onClear}>
          <span class="fmt-glyph clear">T</span>
        </button>
        <span class="fig-format-scope">{state.scope === 'selection' ? 'Selection' : 'All words'}</span>
      </div>

      {pop && (
        <div class="fig-bar-pop">
          {pop === 'colour' && (
            <div class="fig-bar-dots">
              <button class={`fig-dot none ${state.color === null ? 'on' : ''}`} title="The layer's own colour" aria-label="Default colour" onClick={() => onMarks('Colour', { color: undefined })} />
              {palette.map((name) => (
                <button key={name} class={`fig-dot ${state.color === name ? 'on' : ''}`} style={{ background: colorOf(ds, name) ?? undefined }} title={name} aria-label={name} onClick={() => onMarks('Colour', { color: name })} />
              ))}
            </div>
          )}
          {pop === 'highlight' && (
            <div class="fig-bar-dots">
              <button class={`fig-dot clear ${state.highlight === null ? 'on' : ''}`} title="No highlight" aria-label="No highlight" onClick={() => onMarks('Highlight', { highlight: undefined })} />
              {HIGHLIGHTS.map((hex) => (
                <button key={hex} class={`fig-dot ${state.highlight === hex ? 'on' : ''}`} style={{ background: hex }} title="Highlighter" aria-label={`Highlight ${hex}`} onClick={() => onMarks('Highlight', { highlight: hex })} />
              ))}
            </div>
          )}
          {pop === 'font' && (
            <div class="fig-font-list">
              <button class={`fig-font-item ${state.font === null ? 'on' : ''}`} onClick={() => onMarks('Font', { font: undefined })}>
                <span>Aa</span>
                Layer’s font
              </button>
              {Object.entries(ds.fonts).map(([key, stack]) => (
                <button key={key} class={`fig-font-item ${state.font === key ? 'on' : ''}`} title={stack} onClick={() => onMarks('Font', { font: key })}>
                  <span style={{ fontFamily: stack }}>Aa</span>
                  {fontName(key)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The project's saved Riso looks, from this site's shared storage. */
function readSaved(): SavedRisoPreset[] {
  try {
    return readSavedRisoPresets(localStorage.getItem(RISO_PROJECT_PRESETS));
  } catch {
    return [];
  }
}

/**
 * Saving a tweaked text back into the design system: into its preset, which every layer in it then
 * follows, or as a new preset under a name. Both are one undo step.
 */
function SavePreset({ presetName, canUpdate, onUpdate, onNew }: { presetName: string | null; canUpdate: boolean; onUpdate(): void; onNew(name: string): void }) {
  const [naming, setNaming] = useState<string | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  const open = naming !== null;
  // Selected once as it opens, so typing replaces the suggested name.
  useEffect(() => {
    if (open) {
      field.current?.focus();
      field.current?.select();
    }
  }, [open]);
  if (naming !== null) {
    return (
      <form
        class="fig-fx-name"
        onSubmit={(e) => {
          e.preventDefault();
          onNew(naming.trim() || 'New preset');
          setNaming(null);
        }}
      >
        <input
          ref={field}
          value={naming}
          maxLength={40}
          placeholder="Name this preset"
          aria-label="Preset name"
          onInput={(e) => setNaming((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            // Letters are words here, not the canvas's tool keys.
            e.stopPropagation();
            if (e.key === 'Escape') setNaming(null);
          }}
        />
        <button class="fig-chip primary" type="submit">
          Save
        </button>
      </form>
    );
  }
  return (
    <div class="fig-fx-actions">
      {canUpdate && (
        <button class="fig-chip" title={`Rewrite ${presetName} with these settings. Every text in it follows.`} onClick={onUpdate}>
          Update preset
        </button>
      )}
      <button class="fig-chip" title="Save these settings as a new brand preset in the design system." onClick={() => setNaming(presetName ? `${presetName} copy` : '')}>
        New preset
      </button>
    </div>
  );
}

// --- properties -------------------------------------------------------------------------------------

/** One number: a short label, the field, committed on Enter, on leaving the field, or on the arrow keys. */
function PropNum({ label, title, value, min, max, step = 1, suffix, disabled, onCommit }: { label: string; title: string; value: number; min?: number; max?: number; step?: number; suffix?: string; disabled?: boolean; onCommit(v: number): void }) {
  const field = useRef<HTMLInputElement | null>(null);
  // The field shows the layer's number unless it is being typed into; a drag on the canvas updates it live.
  useEffect(() => {
    const el = field.current;
    if (el && document.activeElement !== el) el.value = String(value);
  }, [value]);
  const commit = (el: HTMLInputElement) => {
    const v = Number(el.value);
    if (!Number.isFinite(v)) return void (el.value = String(value));
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (clamped !== value) onCommit(clamped);
    else el.value = String(value);
  };
  return (
    <label class={`fig-prop ${disabled ? 'off' : ''}`} title={title}>
      <span class="fig-prop-label">{label}</span>
      <input
        ref={field}
        type="number"
        defaultValue={String(value)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit(e.currentTarget);
        }}
      />
      {suffix && <span class="fig-prop-unit">{suffix}</span>}
    </label>
  );
}

const ALIGNS: Array<{ edge: AlignEdge; label: string; d: string }> = [
  { edge: 'left', label: 'Align left', d: 'M4 4v16M8 8h10M8 16h6' },
  { edge: 'centre', label: 'Align centre', d: 'M12 4v16M6 8h12M8 16h8' },
  { edge: 'right', label: 'Align right', d: 'M20 4v16M6 8h10M10 16h6' },
  { edge: 'top', label: 'Align top', d: 'M4 4h16M8 8v10M16 8v6' },
  { edge: 'middle', label: 'Align middle', d: 'M4 12h16M8 6v12M16 8v8' },
  { edge: 'bottom', label: 'Align bottom', d: 'M4 20h16M8 6v10M16 10v6' },
];

/**
 * Exact numbers for what is picked, the way a layout tool shows them: X, Y, W, H, rotation, opacity,
 * and a row that lines it up with the page. A drawing (a group) shows the box around its strokes and
 * scales them together; it does not turn. Text finds its own height, so H is shown but not set.
 */
function FigProps({ block, ds, pickedKey, heights, onLayers, onAlignUnits, onDistribute, onGroup }: { block: FreeformBlock; ds: DesignSystem; pickedKey: string; heights: Record<string, number>; onLayers: FigLayersProps['onLayers']; onAlignUnits: FigLayersProps['onAlignUnits']; onDistribute: FigLayersProps['onDistribute']; onGroup(): void }) {
  const sel = selectionOf(block, pickedKey);
  if (!sel) return null;
  const group = sel.many;
  const g = geometryOf(sel.layers, group, heights);
  if (!g) return null;
  const one = sel.layers[0]!;
  const name = sel.multi ? `${sel.units.length} selected` : group ? 'Group' : LAYER_NAMES[one.kind];
  const box = (label: string, patch: Partial<{ x: number; y: number; width: number; height: number }>) => onLayers(label, withGeometry(sel.layers, group, patch, heights));
  return (
    <div class="fig-page fig-props">
      <div class="fig-page-row">
        <b>{name}</b>
        {sel.multi && (
          <button class="fig-text-btn" title="Make these one group  ·  ⌘G" onClick={onGroup}>
            Group
          </button>
        )}
      </div>
      {sel.multi && (
        <div class="fig-align" role="group" aria-label="Align to each other">
          {ALIGNS.map((a) => (
            <button key={a.edge} class="fig-icon-btn" title={`${a.label} to each other`} aria-label={`${a.label} to each other`} onClick={() => onAlignUnits(a.edge)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                <path d={a.d} />
              </svg>
            </button>
          ))}
        </div>
      )}
      {sel.multi && (
        <div class="fig-text-row">
          <button class="fig-chip" disabled={sel.units.length < 3} title="Even gaps across, first and last stay put. Needs three or more." onClick={() => onDistribute('x')}>
            Distribute across
          </button>
          <button class="fig-chip" disabled={sel.units.length < 3} title="Even gaps down, first and last stay put. Needs three or more." onClick={() => onDistribute('y')}>
            Distribute down
          </button>
        </div>
      )}
      <div class="fig-prop-grid">
        <PropNum label="X" title="Left edge, in pixels from the page's left" value={g.x} onCommit={(v) => box('Move', { x: v })} />
        <PropNum label="Y" title="Top edge, in pixels from the page's top" value={g.y} onCommit={(v) => box('Move', { y: v })} />
        <PropNum label="W" title="Width, in pixels" value={g.width} min={1} onCommit={(v) => box('Resize', { width: v })} />
        <PropNum
          label="H"
          title={g.heightFixed ? 'Text is as tall as its words. Change the width or the size to change it.' : 'Height, in pixels'}
          value={g.height}
          min={1}
          disabled={g.heightFixed}
          onCommit={(v) => box('Resize', { height: v })}
        />
        <PropNum
          label="R"
          title={g.rotation === null ? 'A drawing scales but does not turn.' : 'Rotation, in degrees clockwise'}
          value={g.rotation ?? 0}
          step={1}
          suffix="°"
          disabled={g.rotation === null}
          onCommit={(v) => onLayers('Rotate', [withRotation(one, v)])}
        />
        <PropNum label="Op" title="Opacity, 0 to 100 percent" value={Math.round(g.opacity * 100)} min={0} max={100} suffix="%" onCommit={(v) => onLayers('Opacity', withOpacity(sel.layers, v / 100))} />
      </div>
      {!sel.many && one.kind === 'text' && <TextProps layer={one} ds={ds} onLayers={onLayers} />}
      {!sel.many && one.kind === 'image' && one.src.trim() && <ImageProps layer={one} onLayers={onLayers} />}
      <div class="fig-align" role="group" aria-label="Align to page">
        {ALIGNS.map((a) => (
          <button key={a.edge} class="fig-icon-btn" title={`${a.label} to the page`} aria-label={`${a.label} to the page`} onClick={() => onLayers(a.label, alignToPage(sel.layers, block, a.edge, heights))}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
              <path d={a.d} />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- the text tool's settings --------------------------------------------------------------------

const CASES: Array<{ v: 'none' | 'upper' | 'lower' | 'title'; label: string; title: string }> = [
  { v: 'none', label: '–', title: 'As typed' },
  { v: 'upper', label: 'AG', title: 'Uppercase' },
  { v: 'lower', label: 'ag', title: 'Lowercase' },
  { v: 'title', label: 'Ag', title: 'Title case' },
];
const ALIGN_LABELS: Record<Align, string> = { left: 'Align left', center: 'Align centre', right: 'Align right' };

/**
 * Text, set the way a layout tool sets it: face, weight, size, line height, letter spacing, alignment,
 * case, italic and colour, each one field. Jared: "make a solid text tool." Every value starts from the
 * text's type role and becomes the layer's own once changed; Reset takes them all back to the role.
 */
function TextProps({ layer, ds, onLayers }: { layer: Extract<FreeformLayer, { kind: 'text' }>; ds: DesignSystem; onLayers: FigLayersProps['onLayers'] }) {
  const t = textStyleOf(layer, ds);
  const set = (label: string, patch: Partial<Extract<FreeformLayer, { kind: 'text' }>>, coalesce?: string) =>
    onLayers(label, [{ ...layer, ...patch } as FreeformLayer], coalesce ? `text:${layer.id}:${coalesce}` : undefined);
  const fonts = Object.keys(ds.fonts);
  const palette = Object.keys(ds.colors);
  // What the words are actually drawn in: their own colour, the role's, or the theme's ink.
  const hex = colorOf(ds, layer.color) ?? colorOf(ds, t.color) ?? theme(ds, firstPreset(ds)).text;
  const tweaked = hasTweaks(layer) || layer.color !== null;
  return (
    <div class="fig-text-props">
      <div class="fig-page-row">
        <b>Type</b>
        {tweaked && (
          <button
            class="fig-text-btn"
            title="Back to the type role's settings"
            onClick={() => set('Reset text', { font: undefined, weight: undefined, italic: undefined, textCase: undefined, size: undefined, lineHeight: undefined, letterSpacing: undefined, color: null })}
          >
            Reset
          </button>
        )}
      </div>
      <label class="fig-prop wide" title="Typeface, from the design system">
        <span class="fig-prop-label">Aa</span>
        <select value={layer.font ?? ''} onChange={(e) => set('Font', { font: (e.target as HTMLSelectElement).value || undefined })} style={{ fontFamily: t.font }}>
          <option value="">Role font</option>
          {fonts.map((f) => (
            <option key={f} value={f} style={{ fontFamily: ds.fonts[f] }}>
              {fontName(f)}
            </option>
          ))}
        </select>
      </label>
      <div class="fig-prop-grid">
        <label class="fig-prop" title="Weight">
          <span class="fig-prop-label">Wt</span>
          <select value={t.weight} onChange={(e) => set('Weight', { weight: (e.target as HTMLSelectElement).value as 'normal' | 'bold' })}>
            <option value="normal">Regular</option>
            <option value="bold">Bold</option>
          </select>
        </label>
        <PropNum label="Sz" title="Size, in pixels" value={t.size} min={4} max={400} onCommit={(v) => set('Text size', { size: v })} />
        <PropNum label="Lh" title="Line height, as a percentage of the size" value={t.lineHeight} min={50} max={300} suffix="%" onCommit={(v) => set('Line height', { lineHeight: v })} />
        <PropNum label="Ls" title="Letter spacing, in pixels" value={t.letterSpacing} min={-20} max={80} step={0.5} onCommit={(v) => set('Letter spacing', { letterSpacing: v })} />
      </div>
      <div class="fig-text-row">
        <span class="fig-seg" role="group" aria-label="Alignment">
          {(['left', 'center', 'right'] as Align[]).map((a) => (
            <button key={a} class={layer.align === a ? 'on' : ''} aria-pressed={layer.align === a} title={ALIGN_LABELS[a]} aria-label={ALIGN_LABELS[a]} onClick={() => set(ALIGN_LABELS[a], { align: a })}>
              {ALIGN_ICONS[a]()}
            </button>
          ))}
        </span>
        <span class="fig-seg" role="group" aria-label="Case">
          {CASES.map((c) => (
            <button key={c.v} class={t.textCase === c.v ? 'on' : ''} aria-pressed={t.textCase === c.v} title={c.title} onClick={() => set(c.title, { textCase: c.v })}>
              {c.label}
            </button>
          ))}
        </span>
        <button class={`fig-icon-btn ${t.italic ? 'on' : ''}`} title="Italic" aria-label="Italic" aria-pressed={t.italic} onClick={() => set('Italic', { italic: !t.italic })}>
          <span class="fmt-glyph italic">I</span>
        </button>
      </div>
      <div class="fig-text-colour">
        <div class="fig-bar-dots">
          <button class={`fig-dot none ${layer.color === null ? 'on' : ''}`} title="The role's colour" aria-label="The role's colour" onClick={() => set('Colour', { color: null })} />
          {palette.map((name) => (
            <button key={name} class={`fig-dot ${layer.color === name ? 'on' : ''}`} style={{ background: colorOf(ds, name) ?? undefined }} title={`${name}, ${colorOf(ds, name)}`} aria-label={name} onClick={() => set('Colour', { color: name })} />
          ))}
        </div>
        <HexField label="Colour" value={hex.slice(0, 7).toLowerCase()} onInput={(v) => set('Colour', { color: v }, 'colour')} />
      </div>
    </div>
  );
}

// --- pictures ---------------------------------------------------------------------------------------------

/**
 * A picture in its frame: fill, fit or stretch, how far in, the point kept in view, round corners or an
 * ellipse. Jared: "crop and mask inside a shape, fill or fit, rounded corners, focal point." Click the
 * small picture to set the focal point; double-click the picture on the canvas to drag it inside its frame.
 */
function ImageProps({ layer, onLayers }: { layer: ImageLayer; onLayers: FigLayersProps['onLayers'] }) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => setHref(shownImageHref(layer.id)), [layer.id, layer.src]);
  /** Changes that need the picture's own size measure it first, once, for a picture placed before it was kept. */
  const set = async (label: string, patch: Partial<ImageLayer>, coalesce?: string) => {
    const natural = layer.natural ?? (await measureImage(layer.id)) ?? undefined;
    onLayers(label, [{ ...layer, ...(natural ? { natural } : {}), ...patch } as FreeformLayer], coalesce ? `image:${layer.id}:${coalesce}` : undefined);
  };
  const fit = layer.fit ?? 'fill';
  const fx = layer.focusX ?? 0.5;
  const fy = layer.focusY ?? 0.5;
  const crops = fit !== 'stretch' && (imagePlacement(layer)?.width ?? Infinity) >= layer.width - 0.5;
  return (
    <div class="fig-text-props">
      <div class="fig-page-row">
        <b>Picture</b>
        <button class="fig-text-btn" title="Back to the whole picture, centred, filling the frame" onClick={() => void set('Reset crop', { fit: 'fill', zoom: undefined, focusX: undefined, focusY: undefined })}>
          Reset
        </button>
      </div>
      <div class="fig-text-row">
        <span class="fig-seg" role="group" aria-label="How the picture sits in its frame">
          {(['fill', 'fit', 'stretch'] as const).map((f) => (
            <button key={f} class={fit === f ? 'on' : ''} aria-pressed={fit === f} title={f === 'fill' ? 'Cover the frame, cropping the overflow' : f === 'fit' ? 'Show the whole picture inside the frame' : 'Stretch to the frame'} onClick={() => void set(`Picture ${f}`, { fit: f })}>
              {f}
            </button>
          ))}
        </span>
        <span class="fig-seg" role="group" aria-label="Shape">
          <button class={layer.mask !== 'ellipse' ? 'on' : ''} aria-pressed={layer.mask !== 'ellipse'} title="Rectangle" aria-label="Rectangle mask" onClick={() => void set('Rectangle', { mask: undefined })}>
            ▭
          </button>
          <button class={layer.mask === 'ellipse' ? 'on' : ''} aria-pressed={layer.mask === 'ellipse'} title="Ellipse" aria-label="Ellipse mask" onClick={() => void set('Ellipse', { mask: 'ellipse' })}>
            ◯
          </button>
        </span>
      </div>
      <div class="fig-prop-grid">
        <PropNum label="Zm" title={`Zoom, 100 to ${MAX_ZOOM * 100}%`} value={Math.round((layer.zoom ?? 1) * 100)} min={100} max={MAX_ZOOM * 100} step={5} suffix="%" disabled={fit === 'stretch'} onCommit={(v) => void set('Zoom', { zoom: v / 100 })} />
        <PropNum label="Rd" title="Corner radius, in pixels" value={layer.radius ?? 0} min={0} max={1000} disabled={layer.mask === 'ellipse'} onCommit={(v) => void set('Corners', { radius: v || undefined })} />
      </div>
      {href && crops && (
        <button
          class="fig-focus"
          title="Click the part of the picture to keep in view"
          aria-label="Set the focal point"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const img = (e.currentTarget as HTMLElement).querySelector('img');
            const ir = img?.getBoundingClientRect() ?? r;
            const x = Math.max(0, Math.min(1, (e.clientX - ir.left) / ir.width));
            const y = Math.max(0, Math.min(1, (e.clientY - ir.top) / ir.height));
            void set('Focal point', { focusX: Math.round(x * 1000) / 1000, focusY: Math.round(y * 1000) / 1000 });
          }}
        >
          <span class="fig-focus-frame">
            <img src={href} alt="" />
            <i style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }} aria-hidden="true" />
          </span>
        </button>
      )}
      <div class="fig-text-row">
        <button class="fig-chip" disabled={!layer.natural} title="Make the frame the picture's own shape, at this width" onClick={() => onLayers('Frame to picture', [frameToPicture(layer)])}>
          Frame to picture
        </button>
      </div>
      <p class="fig-fx-hint">Double-click the picture on the canvas to drag it inside its frame.</p>
    </div>
  );
}
