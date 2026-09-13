// Bringing the thing you just selected into view, in both directions.
//
// Selection is one piece of state and two views onto it — the canvas and the layer tree — and
// either can be the one you are looking at. Clicking a layer should move the canvas to it; clicking
// a block on the canvas should move the tree. Without both, half of every selection lands somewhere
// off screen and the other panel becomes a place you have to go hunting in.
//
// Two rules make this feel like help rather than interference:
//
//   1. **Nothing moves if the target is already visible.** `block: 'nearest'` is the whole of it —
//      scrolling something into the middle when it was already fine is the jitter that makes people
//      turn a feature like this off.
//   2. **Nothing moves while you are dragging.** A scroll under a drag changes what is under the
//      pointer, which is the one moment the view must hold still.

/** A little breathing room above a block, so it does not sit flush against the toolbar. */
const MARGIN = 24;

/**
 * Scrolls the canvas so a block is in view.
 *
 * The block lives in the preview iframe and the scrollbar belongs to the pane around it, so the
 * position has to be composed: where the block sits inside the frame, plus where the frame sits
 * inside the scroller, minus how far the scroller has already been scrolled.
 */
export function revealInCanvas(outer: HTMLElement | null, frame: HTMLIFrameElement | null, blockId: string): void {
  const inner = frame?.contentDocument;
  if (!outer || !frame || !inner) return;
  // Which element actually scrolls depends on the view. The inbox gives the device a fixed height
  // and the message scrolls *inside* it, like a real client; every other view lets the device grow
  // and the pane around it scrolls. Rather than teach this function about views, it takes the
  // nearest ancestor of the frame that can scroll — which is the right answer for both, and stays
  // the right answer for whatever the next frame around the canvas turns out to be.
  const scroller = scrollableAbove(frame, outer);
  const target = inner.querySelector(`[data-sy-block="${CSS.escape(blockId)}"]`) as HTMLElement | null;
  if (!target) return;

  const box = target.getBoundingClientRect();
  // The frame has no scroll of its own — it is sized to its content — so a rect measured inside it
  // is already an offset from the frame's top.
  const top = frame.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + box.top;
  const bottom = top + box.height;

  const viewTop = scroller.scrollTop;
  const viewBottom = viewTop + scroller.clientHeight;
  if (top >= viewTop + MARGIN && bottom <= viewBottom) return; // already visible, so leave it alone

  // Short blocks are brought to the top edge; anything taller than the viewport is aligned to its
  // top too, because the start of a thing is the part worth seeing.
  const next = box.height > scroller.clientHeight - MARGIN * 2 ? top - MARGIN : Math.min(top - MARGIN, bottom - scroller.clientHeight + MARGIN);
  scroller.scrollTo({ top: Math.max(0, next), behavior: 'smooth' });
}

/**
 * The first ancestor between `frame` and `stop` that has something to scroll — `stop` itself if
 * none of them do.
 *
 * `scrollHeight > clientHeight` rather than reading `overflow`: an element can be `overflow:auto`
 * and have nothing to scroll, and asking it to move is a no-op that swallows the scroll the pane
 * above it should have done.
 */
function scrollableAbove(frame: HTMLElement, stop: HTMLElement): HTMLElement {
  for (let node = frame.parentElement; node && node !== stop; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1) return node;
  }
  return stop;
}

/** Scrolls a sidebar list so its selected row is in view. Ordinary DOM, so this is one call. */
export function revealInList(root: HTMLElement | null, selector = '.row.on'): void {
  const row = root?.querySelector(selector) as HTMLElement | null;
  row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
