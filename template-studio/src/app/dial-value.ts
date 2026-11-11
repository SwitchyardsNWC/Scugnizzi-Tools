// What a dial's typed field means once it is finished with. Its own file so it can be tested without a DOM.

/**
 * The value a typed edit commits, or `null` to leave the value alone.
 *
 * Empty is zero where the dial names what zero means (`zero`, e.g. "Level default"), and the minimum everywhere
 * else: an image's width cleared to nothing used to be stored as 0 under a minimum of 20. Anything unparseable
 * leaves the value alone rather than replacing it with NaN. Clamped but not snapped to the step: the keyboard is
 * for knowing a number, so a typed 103 stays 103 even where dragging moves in fives.
 */
export function typedValue(raw: string, min: number, max: number, zero?: string): number | null {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const text = raw.trim();
  if (text === '') return zero ? 0 : clamp(0);
  const n = Number(text);
  return Number.isFinite(n) ? clamp(n) : null;
}
