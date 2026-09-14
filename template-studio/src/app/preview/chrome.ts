// The editor chrome injected into the preview document, and how a document is split to patch it.



/** Below this, the measurement is a document that has not finished parsing, not a short email. */
export const PLAUSIBLE = 24;

/**
 * A document in two pieces: everything up to and including the `<body …>` tag, and the body's
 * contents. Two documents with the same shell differ only in what the body holds, and that can be
 * written into a live document without reloading it.
 */
export function splitDocument(html: string): { shell: string; body: string } | null {
  const open = html.indexOf('<body');
  const start = open === -1 ? -1 : html.indexOf('>', open) + 1;
  const end = html.lastIndexOf('</body>');
  if (open === -1 || start <= 0 || end === -1 || end < start) return null;
  return { shell: html.slice(0, start), body: html.slice(start, end) };
}

/**
 * Editor chrome, injected into the preview document.
 *
 * `outline` rather than `border`, because a border would change layout and the whole point of this
 * canvas is that it is the compiled email at its real dimensions. Negative offset keeps the outline
 * inside the block's own box so adjacent selections do not overlap.
 */
export const CHROME = `
<style data-sy-chrome>
  [data-sy-block] { cursor: pointer; }
  [data-sy-block]:hover { outline: 2px solid color-mix(in srgb, #2b45d8 55%, transparent); outline-offset: -2px; }
  [data-sy-selected] { outline: 2px solid #2b45d8 !important; outline-offset: -2px; }
  [data-sy-selected-section] { outline: 2px dashed #2b45d8 !important; outline-offset: -2px; }
  [data-sy-selected] svg[data-sy-freeform] [data-sy-layer] { cursor: move; }
  [data-sy-layer-on] { outline: 1.5px dashed #2b45d8; outline-offset: 2px; }
  html[data-sy-drawing] [data-sy-selected] svg[data-sy-freeform], html[data-sy-drawing] [data-sy-selected] svg[data-sy-freeform] * { cursor: crosshair !important; }
  [data-sy-slot]:hover, [data-sy-column]:hover > [data-sy-slot] { border-color: #2b45d8 !important; color: #2b45d8 !important; }
  [data-sy-dim] { opacity: 0.28; }
  [data-sy-text-editing] { outline: 2px solid #0b6f4c !important; outline-offset: 2px; cursor: text; }
  /* Body is positioned so the drop indicator can be placed against the document rather than the
     viewport. No offsets, so nothing in the email moves. */
  body { position: relative; }
  html[data-sy-dragging] [data-sy-block]:hover { outline: none; }
  html[data-sy-dragging] * { cursor: grabbing !important; user-select: none; }
  /* The block you picked up, left behind. Dimming it rather than removing it keeps the rest of the
     email still, so the drop indicator is the only thing moving and the layout does not jump under
     the pointer. */
  [data-sy-lifted] { opacity: 0.3 !important; }
  /* The copy in your hand. A clone rather than a label, and inside the frame rather than over it,
     so the email's own stylesheet renders it and what you are carrying looks like what you picked
     up. */
  [data-sy-carry] {
    position: absolute !important; z-index: 9998; pointer-events: none; opacity: 0.65;
    box-shadow: 0 14px 30px -10px rgba(0,0,0,0.45); border-radius: 3px; overflow: hidden;
    transform: rotate(-0.6deg);
  }
</style>`;
