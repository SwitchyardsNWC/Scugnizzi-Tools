// Pointer capture, defensively.
//
// `setPointerCapture` throws `NotFoundError` when the pointer id is no longer active, which happens
// for ordinary reasons: the window loses focus mid-press, the OS takes the pointer for a gesture, a
// touch is cancelled. Uncaught, it takes down the render that was handling the event, and the
// symptom — the whole editor blanking when you happened to drag near the edge of the screen — looks
// nothing like its cause.
//
// Capture itself is not optional. It is what keeps a drag alive when the pointer crosses into the
// preview iframe, which would otherwise swallow every move (learnings 3.17).

export function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Nothing to capture. The drag still works from this element's own events.
  }
}

export function release(el: HTMLElement, pointerId: number): void {
  try {
    el.releasePointerCapture(pointerId);
  } catch {
    // Already released, or never captured.
  }
}
