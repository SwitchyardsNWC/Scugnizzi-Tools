import { useEffect, useRef, useState } from 'preact/hooks';

import { capture, release } from './pointer.ts';

// A number you drag.
//
// The shape is borrowed from the live-tuning panel genre — DialKit, Leva, Tweakpane — where the
// control is the whole row rather than a label with a box beside it: a quiet track, a fill that
// reads the value, a hairline at the current position, the name on the left and the number on the
// right. Jared pointed at DialKit's panels specifically, and this is the part worth taking. The
// library itself is not a fit (it owns the values; here the document has to, so every change can
// reach the undo stack, the autosave and the field-name rules), but the interaction is.
//
// Four decisions that are the difference between feeling right and merely working:
//
//   - **The drag is one-to-one with the fill.** Dragging to the right-hand edge reaches the
//     maximum, because a bar that fills up but moves at some unrelated rate is lying about what it
//     is. Shift divides the rate by four when a number needs finding precisely.
//   - **Pointer capture**, so a drag survives leaving the element and never selects text.
//   - **The value still types.** A scrub is for finding a number; the keyboard is for knowing one,
//     and a control that only does the first is worse than a plain input. Click the number, or
//     double-click the bar.
//   - **A click does not jump the value.** Grabbing anywhere on the track moves relative to where
//     the value already is. Absolute positioning would be the usual slider behaviour and is wrong
//     here: most of these ranges are generous — padding allows 120px and is typically 10 — so a
//     mis-click near the middle would replace a considered number with a wild one.

export interface DialProps {
  value: number;
  onChange(value: number): void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  /** What an empty field means, e.g. "Level default" for a size of 0. */
  zero?: string;
  title?: string;
}

const TICKS = [10, 20, 30, 40, 50, 60, 70, 80, 90];

export function Dial({ value, onChange, label, min = 0, max = 100, step = 1, suffix, zero, title }: DialProps) {
  const [dragging, setDragging] = useState(false);
  // The typed value, held as the *string* the field contains rather than as the number it parses
  // to, and `null` when the field is not open.
  //
  // It used to be a boolean, with the input controlled by the committed number and clamping on
  // every keystroke. Which meant typing `100` into a line height that allows 90–220 went: `1`,
  // clamped up to 90, field rewritten to "90"; then `0` making "900", clamped down to 220; then
  // `0` making "2200", clamped to 220. Three keystrokes, and the answer was 220%. Jared typed a
  // number he could read on screen and got a different one (learnings 3.43).
  const [draft, setDraft] = useState<string | null>(null);
  const escaped = useRef(false);
  // The drag state lives on a ref, not in state. A pointermove can arrive before the re-render a
  // setState schedules, and a handler closed over a stale `false` drops the first few pixels of
  // every drag. State exists only to drive the highlight.
  const drag = useRef({ on: false, x: 0, value: 0, width: 1, moved: false });
  const input = useRef<HTMLInputElement | null>(null);

  // `autofocus` is not enough: the attribute only acts on a document being parsed, so an input that
  // appears in a re-render never takes focus — and this one exits on blur, so an unfocused field
  // would trap the control in typing mode until the user clicked it.
  useEffect(() => {
    if (draft === null) return;
    input.current?.focus();
    input.current?.select();
  }, [draft === null]);

  const n = Number(value) || 0;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  // `toFixed` because a fractional step accumulates binary dust: three 0.1s is 0.30000000000000004,
  // and a dial that reports that is a dial nobody trusts.
  const snap = (v: number) => clamp(Number((Math.round(v / step) * step).toFixed(4)));
  const pct = Math.max(0, Math.min(100, ((n - min) / (max - min || 1)) * 100));

  const onPointerDown = (event: PointerEvent) => {
    // Left button only: a right-click should still open the context menu.
    if (event.button !== 0 || draft !== null) return;
    const el = event.currentTarget as HTMLElement;
    capture(el, event.pointerId);
    drag.current = { on: true, x: event.clientX, value: n, width: el.getBoundingClientRect().width || 1, moved: false };
    setDragging(true);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent) => {
    const d = drag.current;
    if (!d.on) return;
    const dx = event.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 3) return; // still a click, not yet a drag
    d.moved = true;
    const perPixel = (max - min) / d.width;
    const next = snap(d.value + dx * perPixel * (event.shiftKey ? 0.25 : 1));
    if (next !== value) onChange(next);
  };

  const onPointerUp = (event: PointerEvent) => {
    release(event.currentTarget as HTMLElement, event.pointerId);
    const moved = drag.current.moved;
    drag.current.on = false;
    setDragging(false);
    // A press that never moved was a click, and a click on a number means "let me type one".
    if (!moved) openField();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const by = event.shiftKey ? 10 : 1;
    // `snap`, not `clamp`: a value that arrived off the grid — a shipped 0.6 where the dial now
    // moves in halves — should step onto it rather than carry its offset forever.
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') onChange(snap(n + by * step));
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') onChange(snap(n - by * step));
    else if (event.key === 'Enter' || event.key === ' ') openField();
    else return;
    event.preventDefault();
  };

  const openField = () => setDraft(n === 0 && zero ? '' : String(n));

  /**
   * What a finished edit means. Empty is zero — which is what `zero` names in the field — and
   * anything unparseable leaves the value alone rather than replacing it with NaN.
   *
   * Clamped but *not* snapped to the step: a scrub is for finding a number and the keyboard is for
   * knowing one, so a typed 103 stays 103 even where dragging moves in fives.
   */
  const commit = (raw: string) => {
    const text = raw.trim();
    if (text === '') onChange(0);
    else if (Number.isFinite(Number(text))) onChange(clamp(Number(text)));
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <div class="dial typing" title={title}>
        <label class="dial-name">{label}</label>
        <input
          ref={input}
          type="number"
          value={draft}
          placeholder={zero ?? ''}
          min={min}
          max={max}
          step={step}
          onInput={(e) => {
            const raw = (e.target as HTMLInputElement).value;
            setDraft(raw);
            // Live, but only once what has been typed is already a legal value. That keeps the
            // canvas following along for most edits without ever rewriting the field underneath
            // the cursor — half-typed `1` on its way to `100` simply waits.
            const v = Number(raw);
            if (raw.trim() !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(v);
          }}
          onBlur={(e) => {
            if (escaped.current) {
              escaped.current = false;
              setDraft(null);
              return;
            }
            commit((e.target as HTMLInputElement).value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            else if (e.key === 'Escape') {
              escaped.current = true;
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div class={`dial ${dragging ? 'dragging' : ''}`} title={title}>
      <div
        class="dial-bar"
        role="slider"
        tabIndex={0}
        aria-label={`${label}. Drag sideways to change, or press Enter to type a value.`}
        aria-valuenow={n}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={n === 0 && zero ? zero : `${n}${suffix ?? ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div class="dial-fill" style={{ width: `${pct}%` }} />
        <div class="dial-ticks" aria-hidden="true">
          {TICKS.map((t) => (
            <i key={t} style={{ left: `${t}%` }} />
          ))}
        </div>
        <div class="dial-handle" style={{ left: `${pct}%` }} aria-hidden="true" />
        <span class="dial-label">{label}</span>
        <span class="dial-value">
          {n === 0 && zero ? <em>{zero}</em> : `${n}${suffix ?? ''}`}
        </span>
      </div>
    </div>
  );
}
