// Momentum: a canvas let go mid-drag keeps sliding and eases to a stop.
//
// The velocity is read from the last moments of the drag rather than the whole of it, so a drag that
// slowed down before letting go stops where it is, and one flung fast carries. The glide decays
// exponentially, the way a wheel's momentum does on a trackpad, so it never stops with a jolt.

/** A few recent pointer positions, enough to know how fast the hand was moving when it let go. */
export class PanTracker {
  private samples: Array<{ t: number; x: number; y: number }> = [];

  push(x: number, y: number, t = performance.now()): void {
    this.samples.push({ t, x, y });
    // Only the last 120ms matter.
    while (this.samples.length > 2 && t - this.samples[0]!.t > 120) this.samples.shift();
  }

  /**
   * Speed in pixels per millisecond at the time given, or null when the hand had already stopped: no
   * movement in the last 80ms, or too little history to say.
   */
  velocity(t = performance.now()): { vx: number; vy: number } | null {
    const last = this.samples[this.samples.length - 1];
    if (!last || this.samples.length < 2 || t - last.t > 80) return null;
    const first = this.samples[0]!;
    const dt = last.t - first.t;
    if (dt < 8) return null;
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }
}

export interface GlideOptions {
  /** Time constant of the decay, in ms: how long the slide takes to lose about two thirds of its speed. */
  friction?: number;
  /** Below this speed, in pixels per ms, the slide is over. */
  minSpeed?: number;
  /** The fastest it may start, in pixels per ms, so a wild fling does not throw the board away. */
  maxSpeed?: number;
}

/**
 * Slides from a velocity to a stop, calling `apply` with each frame's movement. Returns a function
 * that stops the slide, for the next touch or wheel.
 */
export function glide(start: { vx: number; vy: number }, apply: (dx: number, dy: number) => void, options: GlideOptions = {}): () => void {
  const friction = options.friction ?? 320;
  const minSpeed = options.minSpeed ?? 0.02;
  const maxSpeed = options.maxSpeed ?? 4;
  let vx = start.vx;
  let vy = start.vy;
  const speed = Math.hypot(vx, vy);
  if (speed < minSpeed) return () => {};
  if (speed > maxSpeed) {
    vx *= maxSpeed / speed;
    vy *= maxSpeed / speed;
  }
  let frame = 0;
  let last = performance.now();
  const step = (now: number) => {
    const dt = Math.min(64, now - last);
    last = now;
    // The exact distance covered under exponential decay over dt, so the slide is the same at any frame rate.
    const decay = Math.exp(-dt / friction);
    const travel = friction * (1 - decay);
    apply(vx * travel, vy * travel);
    vx *= decay;
    vy *= decay;
    if (Math.hypot(vx, vy) >= minSpeed) frame = requestAnimationFrame(step);
    else frame = 0;
  };
  frame = requestAnimationFrame(step);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
}
