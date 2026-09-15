// How the canvases move and draw, as settings a person can dial in.
//
// One set for both the project board and the Freeform surface, kept in this browser. Every value has a
// default that is the one shipped, a range it is clamped to, and a control in the Canvas menu
// (CanvasMenu.tsx). Pages hear a change at once, and other open tabs through the storage event.

import { useEffect, useState } from 'preact/hooks';

export interface CanvasSettings {
  /** The canvas keeps sliding after a pan lets go (inertia.ts). */
  momentum: boolean;
  /** The slide's time constant in ms: how long it takes to lose about two thirds of its speed. */
  friction: number;
  /** How much a pinch zooms for how far the fingers move: 1 is one to one, 2 is twice as eager. */
  pinchGain: number;
  /** The same for the wheel and trackpad. */
  wheelGain: number;
  /** The board's drafting grid. */
  grid: boolean;
  /** The grid's fine step, in board pixels; the firm line is every fifth. */
  gridStep: number;
  /** Cards and groups let go on the board land on the grid. */
  snap: boolean;
  /** A stroke held still at its end snaps to the shape it meant (quick-shape.ts). */
  quickShapes: boolean;
  /** How long the pen must sit still for that, in ms. */
  holdMs: number;
  /** Whether a finger draws on the Freeform surface: never once a pencil has been seen, always, or never at all. */
  pencilOnly: 'auto' | 'on' | 'off';
  /** The presence server for the board (project/presence.ts), when this browser names one over the site's own. */
  presenceHost: string;
  /** The name others see beside this browser's cursor. */
  presenceName: string;
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  momentum: true,
  friction: 320,
  pinchGain: 1.5,
  wheelGain: 1,
  grid: true,
  gridStep: 24,
  snap: false,
  quickShapes: true,
  holdMs: 160,
  pencilOnly: 'auto',
  presenceHost: '',
  presenceName: '',
};

/** Each dial's floor, ceiling and step. */
export const CANVAS_RANGES = {
  friction: { min: 120, max: 800, step: 20 },
  pinchGain: { min: 1, max: 3, step: 0.1 },
  wheelGain: { min: 0.4, max: 3, step: 0.1 },
  gridStep: { min: 8, max: 64, step: 8 },
  holdMs: { min: 80, max: 500, step: 20 },
} as const;

export const CANVAS_SETTINGS_KEY = 'scuggnizzi.canvas.settings';

const clamp = (value: unknown, range: { min: number; max: number }, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : fallback;
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** The settings as stored, with every value checked and clamped; anything unreadable is the default. */
export function parseCanvasSettings(raw: string | null): CanvasSettings {
  type Raw = Partial<Record<keyof CanvasSettings, unknown>>;
  let value: Raw | null = null;
  try {
    value = raw ? (JSON.parse(raw) as Raw) : null;
  } catch {
    value = null;
  }
  const d = DEFAULT_CANVAS_SETTINGS;
  if (!value || typeof value !== 'object') return { ...d };
  const pencil = value.pencilOnly;
  return {
    momentum: flag(value.momentum, d.momentum),
    friction: clamp(value.friction, CANVAS_RANGES.friction, d.friction),
    pinchGain: clamp(value.pinchGain, CANVAS_RANGES.pinchGain, d.pinchGain),
    wheelGain: clamp(value.wheelGain, CANVAS_RANGES.wheelGain, d.wheelGain),
    grid: flag(value.grid, d.grid),
    gridStep: clamp(value.gridStep, CANVAS_RANGES.gridStep, d.gridStep),
    snap: flag(value.snap, d.snap),
    quickShapes: flag(value.quickShapes, d.quickShapes),
    holdMs: clamp(value.holdMs, CANVAS_RANGES.holdMs, d.holdMs),
    pencilOnly: pencil === 'on' || pencil === 'off' || pencil === 'auto' ? pencil : d.pencilOnly,
    presenceHost: text(value.presenceHost, 200),
    presenceName: text(value.presenceName, 40),
  };
}

const listeners = new Set<(settings: CanvasSettings) => void>();
let cached: CanvasSettings | null = null;

export function readCanvasSettings(): CanvasSettings {
  if (cached) return cached;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CANVAS_SETTINGS_KEY);
  } catch {
    raw = null;
  }
  cached = parseCanvasSettings(raw);
  return cached;
}

/** Changes some settings, keeps them, and tells every listener. Returns the whole set as it now is. */
export function writeCanvasSettings(patch: Partial<CanvasSettings>): CanvasSettings {
  const next = parseCanvasSettings(JSON.stringify({ ...readCanvasSettings(), ...patch }));
  cached = next;
  try {
    localStorage.setItem(CANVAS_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the settings last for this page.
  }
  for (const fn of listeners) fn(next);
  return next;
}

/** Everything back as shipped, except what `keep` names: a person's name is theirs, not a dial. */
export const resetCanvasSettings = (keep: Partial<CanvasSettings> = {}): CanvasSettings => writeCanvasSettings({ ...DEFAULT_CANVAS_SETTINGS, ...keep });

export function subscribeCanvasSettings(fn: (settings: CanvasSettings) => void): () => void {
  listeners.add(fn);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== CANVAS_SETTINGS_KEY && event.key !== null) return;
    cached = null;
    fn(readCanvasSettings());
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

/** The settings, live: the component renders again when any of them changes, here or in another tab. */
export function useCanvasSettings(): CanvasSettings {
  const [settings, setSettings] = useState<CanvasSettings>(readCanvasSettings);
  useEffect(() => subscribeCanvasSettings(setSettings), []);
  return settings;
}
