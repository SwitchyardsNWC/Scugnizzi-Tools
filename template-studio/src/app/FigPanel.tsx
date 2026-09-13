import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { brushSampleSvg, canvasTypeSampleSvg } from '../compile/freeform.ts';
import { amountLabel, LAYER_NAMES, layerName, textStyleOf, type CanvasCommand } from '../model/canvas-text.ts';
import { canvasTypeOf, colorOf, type ColorRef, type DesignSystem } from '../model/design-system.ts';
import { BRUSHES, groupKey, groupRuns, STICKY_COLORS } from '../model/freeform.ts';
import { MARKS } from '../model/marks.ts';
import { Riso } from '../effects/riso.ts';
import { misregister, readSavedRisoPresets, RISO_PRESETS, RISO_PROJECT_PRESETS, RISO_SWATCHES, risoStep, withSavedRisoPreset, type SavedRisoPreset } from '../model/effects.ts';
import type { MarkKey, MarkState } from '../model/rich-text.ts';
import type { Align, EffectStep, FreeformBlock, FreeformLayer, RisoInk, TextMarks } from '../model/types.ts';

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
  /** The page's effects, replaced as a list. `coalesce` makes a slider drag one undo step. */
  onEffects(next: EffectStep[] | undefined, label: string, coalesce?: string): void;
  onOpenRiso(): void;
  /** A line about the effect: where the Riso tab is, or why it could not open. */
  effectNote?: string | null;
  /** The printed picture is being made again after a change. */
  effectBusy?: boolean;
}

export function FigLayers({ block, ds, picked, hover, onPick, onHover, onEdit, onDuplicate, onRemove, onUngroup, onMove, onPage, onClose, onEffects, onOpenRiso, effectNote, effectBusy }: FigLayersProps) {
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

      <FigEffects effects={block.effects} onEffects={onEffects} onOpenRiso={onOpenRiso} note={effectNote ?? null} busy={Boolean(effectBusy)} />
    </div>
  );
}

// --- effects ----------------------------------------------------------------------------------------

/**
 * The presets' screens at half size. They were tuned on 900px photographs; a page of drawn lines and
 * type loses its detail in dots that coarse, and at half size it still reads as a print.
 */
const pageScreens = (step: EffectStep): EffectStep => ({ ...step, inks: step.inks.map((k) => ({ ...k, cell: Math.max(2, Math.round(k.cell) / 2) })) });

const PAPERS: Array<[string, string]> = [
  ['Natural', '#f6f2e8'],
  ['White', '#ffffff'],
  ['Kraft', '#e9dcc2'],
  ['Grey', '#dfe6e9'],
];

/**
 * The page printed through the Riso press: a preset to start from, the few dials worth having on the
 * canvas, and every other dial one click away in the Riso tool itself.
 */
function FigEffects({ effects, onEffects, onOpenRiso, note, busy }: { effects: EffectStep[] | undefined; onEffects: FigLayersProps['onEffects']; onOpenRiso(): void; note: string | null; busy: boolean }) {
  const [ink, setInk] = useState<number | null>(null);
  const step = effects?.find((e) => e.effect === 'riso');
  const set = (next: EffectStep, label: string, coalesce?: string) => onEffects([next], label, coalesce);
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
    if (!step || naming === null) return;
    try {
      localStorage.setItem(RISO_PROJECT_PRESETS, withSavedRisoPreset(localStorage.getItem(RISO_PROJECT_PRESETS), naming, step, `p${Date.now().toString(36)}`));
      setSaved(readSaved());
    } catch {
      // Storage full or blocked: the look stays on the page, just not in the list.
    }
    setNaming(null);
  };

  if (!step) {
    return (
      <div class="fig-effects">
        <div class="fig-page-row">
          <b>Effects</b>
        </div>
        <div class="fig-fx-presets">
          {RISO_PRESETS.map((p, i) => (
            <button key={p.name} class="fig-fx-preset" title={`Riso: ${p.desc}`} onClick={() => onEffects([pageScreens(risoStep(i, 1))], 'Riso print')}>
              <span class="fig-fx-inks" aria-hidden="true">
                {p.apply.inks.map((k, j) => (
                  <i key={j} style={{ background: k.color }} />
                ))}
              </span>
              {p.name}
            </button>
          ))}
        </div>
        {saved.length > 0 && (
          <>
            <div class="fig-fx-sub">Saved in this project</div>
            <div class="fig-fx-presets">
              {saved.map((p) => (
                <button key={p.id} class="fig-fx-preset" title={`${p.name}: a saved look`} onClick={() => onEffects([p.step], `Riso · ${p.name}`)}>
                  <span class="fig-fx-inks" aria-hidden="true">
                    {p.step.inks.map((k, j) => (
                      <i key={j} style={{ background: k.color }} />
                    ))}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}
        <p class="fig-fx-hint">{note ?? 'Print the page through the Riso press. The layers stay editable underneath.'}</p>
      </div>
    );
  }

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
    <div class="fig-effects">
      <div class="fig-page-row">
        <b>Riso print</b>
        {busy && <span class="fig-fx-busy">inking…</span>}
        <button class="fig-text-btn" title="Save these settings as a look for the project. The Riso tool and every Freeform page offer it." onClick={() => setNaming('')}>
          Save look
        </button>
        <button class="fig-icon-btn danger" title="Take the print off. The layers are untouched." aria-label="Remove effect" onClick={() => onEffects(undefined, 'Remove effect')}>
          {icon(<path key="a" d="M6 6l12 12M18 6L6 18" />)}
        </button>
      </div>

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
          <button key={p.name} class="fig-fx-chip" title={`${p.name}: ${p.desc}`} onClick={() => set(pageScreens(risoStep(i, step.seed)), `Riso · ${p.name}`)}>
            <span class="fig-fx-inks" aria-hidden="true">
              {p.apply.inks.map((k, j) => (
                <i key={j} style={{ background: k.color }} />
              ))}
            </span>
            {p.name}
          </button>
        ))}
        {saved.map((p) => (
          <button key={p.id} class="fig-fx-chip saved" title={`${p.name}: saved in this project`} onClick={() => set(p.step, `Riso · ${p.name}`)}>
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
        <button class="fig-chip primary" title="Open this page in the Riso separator with every dial. Back to Freeform there sends the settings here." onClick={onOpenRiso}>
          Open in Riso ↗
        </button>
      </div>
      {note && <p class="fig-fx-hint">{note}</p>}
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

type Pop = 'style' | 'font' | 'colour' | 'fill' | 'outline' | 'tweak' | 'mark' | 'brush' | null;

/** A design system font's key as a name: `georgia` is Georgia. */
const fontName = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export function FigBar({ ds, layers, group, left, top, below, onChange, onDuplicate, onRemove, onUngroup, onOrder }: FigBarProps) {
  const [pop, setPop] = useState<Pop>(null);
  const one = group ? undefined : layers[0];
  const inverted = layers.length > 0 && layers.every((l) => l.invert);
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
    const lookLabel = text.look ? (looks[text.look]?.label ?? 'Style') : 'Plain';
    const amount = amountLabel(style.effect);
    quick = (
      <>
        <button class={`fig-chip ${pop === 'style' ? 'on' : ''}`} title="Text style  ·  or type / while editing" onClick={() => toggle('style')}>
          <span class="fig-chip-sample" dangerouslySetInnerHTML={{ __html: canvasTypeSampleSvg(ds, text.look ?? null, 'Aa') }} />
          {lookLabel}
          <span class="caret">▾</span>
        </button>
        {fontChip}
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
