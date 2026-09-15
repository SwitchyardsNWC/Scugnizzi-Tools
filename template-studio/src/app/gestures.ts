// Fingers on glass: pinching, palms, and taps that undo.
//
// After Canvas Kit (yaye.work, MIT), whose iPad rules are the right ones. Two fingers pan and pinch
// the view, whatever tool is in hand. Any touch while the pencil is on the glass, or just after it
// lifted, is a palm and is ignored. Two fingers tapped together undo; three redo. A tap only counts
// when the fingers barely moved and lifted quickly, so a real pan or pinch never fires one.
//
// Kept apart from the pointer handlers that use it, and free of the DOM, so the rules are testable
// on plain objects. The caller passes each pointer event in and acts on what comes back.

export interface GesturePointer {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
}

export interface Pinch {
  /** Where the fingers' midpoint was when the second finger landed, in client pixels. */
  start: { x: number; y: number };
  /** Where it is now. */
  mid: { x: number; y: number };
  /** The distance between the fingers, relative to when the second landed. */
  scale: number;
}

export interface GestureHandlers {
  /** A second finger landed: whatever one finger was doing is over, and a pinch may follow. */
  onStart(mid: { x: number; y: number }): void;
  onPinch(pinch: Pinch): void;
  /** The pinch is over: fewer than two fingers remain. */
  onEnd(): void;
  /** Two or three fingers tapped together and lifted: undo, or redo. */
  onTap(fingers: 2 | 3): void;
}

/**
 * What a pointer landing means: the pen, a palm to ignore, the second finger of a gesture, a lone
 * finger, or a mouse.
 */
export type Landing = 'pen' | 'palm' | 'gesture' | 'touch' | 'other';

/** How long after the pencil lifts a touch is still taken for the palm. */
const PALM_MS = 400;
/** How far a finger may drift and still be tapping, and how long the tap may take. */
const TAP_DRIFT_PX = 12;
const TAP_MS = 300;

export class TouchGestures {
  private touches = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  private penDown = 0;
  private lastPenUp = -Infinity;
  private tapStart = 0;
  private tapMoved = false;
  private tapMax = 0;
  private pinch: { start: { x: number; y: number }; dist: number } | null = null;

  constructor(private readonly handlers: GestureHandlers) {}

  /** Whether a touch right now is the palm: the pen is down, or lifted a moment ago. */
  penBlocksTouch(now = Date.now()): boolean {
    return this.penDown > 0 || now - this.lastPenUp < PALM_MS;
  }

  /** Two or more fingers are down: the view is being pinched or panned, and nothing else should happen. */
  active(): boolean {
    return this.touches.size >= 2;
  }

  down(e: GesturePointer, now = Date.now()): Landing {
    if (e.pointerType === 'pen') {
      this.penDown += 1;
      // Whatever touches are down are the palm: veto any tap in flight.
      this.tapMoved = true;
      return 'pen';
    }
    if (e.pointerType !== 'touch') return 'other';
    if (this.penBlocksTouch(now)) return 'palm';
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (this.touches.size === 2) {
      this.tapStart = now;
      this.tapMoved = false;
      this.tapMax = 2;
      for (const t of this.touches.values()) {
        t.sx = t.x;
        t.sy = t.y;
      }
      const [a, b] = [...this.touches.values()];
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      this.pinch = { start: mid, dist: Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y)) };
      this.handlers.onStart(mid);
      return 'gesture';
    }
    if (this.touches.size > 2) {
      this.tapMax = Math.max(this.tapMax, this.touches.size);
      return 'gesture';
    }
    return 'touch';
  }

  /** True when the move was the gesture's, and the caller should do nothing else with it. */
  move(e: GesturePointer): boolean {
    if (e.pointerType !== 'touch') return false;
    const t = this.touches.get(e.pointerId);
    if (!t) return false;
    t.x = e.clientX;
    t.y = e.clientY;
    if (this.touches.size < 2) return false;
    if (Math.hypot(t.x - t.sx, t.y - t.sy) > TAP_DRIFT_PX) this.tapMoved = true;
    if (this.pinch) {
      const [a, b] = [...this.touches.values()];
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      this.handlers.onPinch({ start: this.pinch.start, mid, scale: Math.hypot(a!.x - b!.x, a!.y - b!.y) / this.pinch.dist });
    }
    return true;
  }

  up(e: GesturePointer, now = Date.now()): void {
    if (e.pointerType === 'pen') {
      this.penDown = Math.max(0, this.penDown - 1);
      this.lastPenUp = now;
      return;
    }
    if (e.pointerType !== 'touch') return;
    if (!this.touches.delete(e.pointerId)) return;
    if (this.touches.size < 2 && this.tapMax >= 2) {
      const tapped = !this.tapMoved && !this.penBlocksTouch(now) && now - this.tapStart < TAP_MS;
      const count = this.tapMax;
      this.tapMax = 0;
      if (this.pinch) {
        this.pinch = null;
        this.handlers.onEnd();
      }
      if (tapped) this.handlers.onTap(count >= 3 ? 3 : 2);
    }
  }

  /** Everything let go at once: the window lost the pointers. */
  reset(): void {
    this.touches.clear();
    this.tapMax = 0;
    if (this.pinch) {
      this.pinch = null;
      this.handlers.onEnd();
    }
  }
}
