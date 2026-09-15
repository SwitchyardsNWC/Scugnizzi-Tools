// The Canvas menu: the dials for how the canvases move and draw (canvas-settings.ts).
//
// One component for both pages. On the board it opens from a plain header button; on the Freeform page
// from a pill, which `pill` asks for. Every row is a label, a control, and the value in mono, and the
// bottom of the menu puts everything back the way it shipped.

import { useEffect, useRef, useState } from 'preact/hooks';

import { CANVAS_RANGES, DEFAULT_CANVAS_SETTINGS, resetCanvasSettings, useCanvasSettings, writeCanvasSettings, type CanvasSettings, type GroundKind } from './canvas-settings.ts';

export function CanvasMenu({ pill = false }: { pill?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div class={`cv-menu ${pill ? 'pill' : ''}`} ref={root}>
      <button class={pill ? `fig-pill ${open ? 'on' : ''}` : `pb-ghost ${open ? 'on' : ''}`} aria-expanded={open} title="How the canvas moves and draws: momentum, zoom speed, what lies under the board, quick shapes, the pencil." onClick={() => setOpen((o) => !o)}>
        Canvas
      </button>
      {open && <CanvasSettingsPanel />}
    </div>
  );
}

const fmt = {
  friction: (v: number) => `${v} ms`,
  holdPanMs: (v: number) => `${v} ms`,
  pinchGain: (v: number) => `×${v.toFixed(1)}`,
  wheelGain: (v: number) => `×${v.toFixed(1)}`,
  groundOpacity: (v: number) => `${Math.round(v * 100)}%`,
  gridStep: (v: number) => `${v} px`,
  holdMs: (v: number) => `${v} ms`,
};

export function CanvasSettingsPanel() {
  const s = useCanvasSettings();
  const set = (patch: Partial<CanvasSettings>) => writeCanvasSettings(patch);
  // The presence name is a person's, not a dial: Reset leaves it alone.
  const changed = JSON.stringify({ ...s, presenceName: '' }) !== JSON.stringify({ ...DEFAULT_CANVAS_SETTINGS, presenceName: '' });
  /** The ground that is drawn, whose opacity the dial shows; plain paper shows the lines' dial, greyed. */
  const drawn = s.ground === 'none' ? null : s.ground;
  return (
    <div class="cv-pop" role="dialog" aria-label="Canvas settings" onPointerDown={(e) => e.stopPropagation()}>
      <div class="cv-section">
        <div class="cv-head">Moving</div>
        <Toggle label="Momentum" help="Let go mid-drag and the canvas keeps sliding, then eases to a stop." value={s.momentum} onChange={(v) => set({ momentum: v })} />
        <Slider label="Glide" help="How long the slide lasts: the time it takes to lose two thirds of its speed." value={s.friction} range={CANVAS_RANGES.friction} format={fmt.friction} disabled={!s.momentum} onChange={(v) => set({ friction: v })} />
        <Slider label="Hold to pan" help="Press and stay still on a card or a layer this long, and the press becomes the hand: dragging then moves the view, not the thing. A quick click still selects it. Space does the same at once." value={s.holdPanMs} range={CANVAS_RANGES.holdPanMs} format={fmt.holdPanMs} onChange={(v) => set({ holdPanMs: v })} />
        <Slider label="Pinch zoom" help="How much a pinch zooms for how far the fingers move." value={s.pinchGain} range={CANVAS_RANGES.pinchGain} format={fmt.pinchGain} onChange={(v) => set({ pinchGain: v })} />
        <Slider label="Wheel zoom" help="The same for ⌘ + wheel and a trackpad pinch." value={s.wheelGain} range={CANVAS_RANGES.wheelGain} format={fmt.wheelGain} onChange={(v) => set({ wheelGain: v })} />
      </div>
      <div class="cv-section">
        <div class="cv-head">Board</div>
        <div class="cv-row" title="What lies under the board: plain paper, drafting lines, a dot grid, or a cutting mat.">
          <span class="cv-label">Background</span>
          <div class="cv-seg" role="radiogroup" aria-label="Background">
            {(
              [
                ['none', 'Off'],
                ['lines', 'Lines'],
                ['dots', 'Dots'],
                ['mat', 'Mat'],
              ] as Array<[GroundKind, string]>
            ).map(([value, label]) => (
              <button key={value} role="radio" aria-checked={s.ground === value} class={s.ground === value ? 'on' : ''} onClick={() => set({ ground: value })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Opacity"
          help="How strongly the background shows over the paper. Each background keeps its own."
          value={s.groundOpacity[drawn ?? 'lines']}
          range={CANVAS_RANGES.groundOpacity}
          format={fmt.groundOpacity}
          disabled={!drawn}
          onChange={(v) => drawn && set({ groundOpacity: { ...s.groundOpacity, [drawn]: v } })}
        />
        <Slider label="Grid step" help="The fine line's spacing, or the dots'; the firm line, or the bigger dot, is every fifth." value={s.gridStep} range={CANVAS_RANGES.gridStep} format={fmt.gridStep} disabled={!drawn} onChange={(v) => set({ gridStep: v })} />
        <Toggle label="Snap to grid" help="Cards and groups let go on the board land on the grid." value={s.snap} onChange={(v) => set({ snap: v })} />
      </div>
      <div class="cv-section">
        <div class="cv-head">Drawing</div>
        <Toggle label="Quick shapes" help="Hold the pen still at the end of a stroke and it snaps to a line, box, circle or triangle." value={s.quickShapes} onChange={(v) => set({ quickShapes: v })} />
        <Slider label="Hold" help="How long to hold still before the stroke snaps." value={s.holdMs} range={CANVAS_RANGES.holdMs} format={fmt.holdMs} disabled={!s.quickShapes} onChange={(v) => set({ holdMs: v })} />
        <div class="cv-row" title="On a tablet, whether a finger draws. Auto: it draws until a pencil is seen, then it pans while the pencil draws.">
          <span class="cv-label">Finger draws</span>
          <div class="cv-seg" role="radiogroup" aria-label="Finger draws">
            {(
              [
                ['auto', 'Until a pencil'],
                ['off', 'Always'],
                ['on', 'Never'],
              ] as Array<[CanvasSettings['pencilOnly'], string]>
            ).map(([value, label]) => (
              <button key={value} role="radio" aria-checked={s.pencilOnly === value} class={s.pencilOnly === value ? 'on' : ''} onClick={() => set({ pencilOnly: value })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div class="cv-section">
        <div class="cv-head">Together</div>
        <label class="cv-row" title="Others see this name beside your cursor when you have the same project open.">
          <span class="cv-label">Your name</span>
          <input type="text" class="cv-text" value={s.presenceName} maxLength={40} placeholder="How others see you" onInput={(e) => set({ presenceName: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="cv-row" title="The presence server (party/board.ts), for this browser. Leave it empty to use the site's own. Local: localhost:1999 after npm run party.">
          <span class="cv-label">Server</span>
          <input type="text" class="cv-text" value={s.presenceHost} maxLength={200} placeholder="the site's own" spellcheck={false} onInput={(e) => set({ presenceHost: (e.target as HTMLInputElement).value })} />
        </label>
      </div>
      <div class="cv-foot">
        <span>Kept in this browser, for every canvas.</span>
        <button class="cv-reset" disabled={!changed} onClick={() => resetCanvasSettings({ presenceName: s.presenceName })}>
          Reset
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, help, value, onChange }: { label: string; help: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <label class="cv-row" title={help}>
      <span class="cv-label">{label}</span>
      <span class="cv-grow" />
      <input type="checkbox" class="cv-check" checked={value} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span class="cv-value">{value ? 'on' : 'off'}</span>
    </label>
  );
}

function Slider({
  label,
  help,
  value,
  range,
  format,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  range: { min: number; max: number; step: number };
  format(v: number): string;
  disabled?: boolean;
  onChange(v: number): void;
}) {
  return (
    <label class={`cv-row ${disabled ? 'off' : ''}`} title={help}>
      <span class="cv-label">{label}</span>
      <input type="range" class="cv-range" min={range.min} max={range.max} step={range.step} value={value} disabled={disabled} onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))} />
      <span class="cv-value">{format(value)}</span>
    </label>
  );
}
