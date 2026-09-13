// Turning a block of type into a picture of that type.
//
// Why anybody would want this: live text is the one thing in an email that every client renders
// differently. Word's engine — Outlook 2016 through 2021 on Windows — rounds line heights to whole
// points, ignores `letter-spacing` outright, and substitutes a font it has for one it does not.
// Apple Mail, Gmail's web client and Outlook.com each hyphenate and wrap at different places. A
// carefully tracked uppercase H5 is exactly the case where that shows.
//
// A picture of the text renders identically everywhere. What it gives up is the subject of
// `renderAsImage`'s doc comment below — none of it is small, which is why converting is an action
// somebody takes rather than a default.
//
// This file is the only part of the feature that touches the DOM, which is why it lives in the app
// and not in `compile/`. The compiler never learns that an image was once words; it sees an image
// block like any other and `tests/purity.test.ts` keeps it that way.

/**
 * Renders HTML to a PNG at twice its display size.
 *
 * The trick is `<foreignObject>`: the browser lays the real HTML out with the real CSS, and the
 * result is drawn to a canvas. Laying the text out by hand with `fillText` would mean writing a
 * line-breaker, and the whole promise of the feature is that the picture matches what the canvas
 * already shows — so it has to be the same layout engine, not a second one that agrees most days.
 *
 * Two rules the SVG imposes, both enforced by the browser rather than by this code:
 *
 *   - Everything must be inline. An external stylesheet or a remote image inside a `foreignObject`
 *     is not fetched, and a remote image also taints the canvas so that `toBlob` throws. The CSS
 *     is passed in whole and the markup carries no `<img>`.
 *   - The markup must be well-formed **XML**, not HTML. This is the one that bites: `innerHTML`
 *     serialises void elements the HTML way — `<br>`, `<hr>`, `<img>` — and inside a
 *     `foreignObject` that is a fatal parse error, so the whole image fails to load and the block
 *     simply never draws. `xhtmlOf` below serialises properly instead (learnings 3.49).
 */
export interface RasteriseOptions {
  /** The block's markup, already sanitised. */
  html: string;
  /** The design system's rules for it — what `.sy-rich` and the heading roles emit. */
  css: string;
  /** CSS pixels. The image's display width, which is the column's content width. */
  width: number;
  /** Painted behind the text, because a PNG with a transparent ground inverts badly in dark mode. */
  background: string;
  /**
   * The inline style the text was inheriting — font, colour, alignment — taken off the cell it
   * lives in, with the padding removed.
   *
   * Lifted from the live canvas rather than rebuilt here. Rebuilding it would mean a second copy
   * of what `layout.ts` emits, and a second copy is a copy that disagrees the week after next.
   */
  style?: string;
  /**
   * The classes the cell carries — `sy-rich`, the per-section link-colour class, `hs_padded`.
   *
   * Not optional in practice, and the reason it exists: almost every rule that styles this markup
   * is scoped to one of them. `.sy-rich p { font-size:18px }` and `.sy-rtl-d10000 a { color:… }`
   * match the *cell*, not anything inside it, so a wrapper without the classes draws the words in
   * Times New Roman with blue underlined links and looks, at a glance, like it worked.
   *
   * Found by counting pixels rather than by looking: the shot had the right dimensions, the right
   * amount of ink and the right navy — and not one red pixel, because the link had fallen back to
   * the browser's own colour (learnings 3.45).
   */
  className?: string;
  /** Device pixels per CSS pixel. Two, for the same reason every other image in the email is. */
  scale?: number;
}

export interface Rastered {
  blob: Blob;
  /** For the canvas, before the file exists anywhere. */
  url: string;
  width: number;
  height: number;
}

/** Measures the markup at the given width, using the page's own layout engine. */
function measure(html: string, css: string, width: number, style: string, className: string): number {
  const host = document.createElement('div');
  // Off-screen rather than `display:none`: a hidden element has no layout and therefore no height.
  host.setAttribute('style', `position:fixed; left:-10000px; top:0; width:${width}px; visibility:hidden`);
  // `display:flow-root` so the last paragraph's bottom margin stays *inside* the box being
  // measured. Left to collapse, it escapes the wrapper and the picture comes out 16px shorter than
  // the cell it replaces — which reads as the block having quietly tightened up.
  host.innerHTML = `<style>${css}</style><div class="sy-shot ${className}" style="display:flow-root; width:${width}px; ${style}">${html}</div>`;
  document.body.appendChild(host);
  const box = host.querySelector('.sy-shot') as HTMLElement;
  const height = Math.ceil(box.getBoundingClientRect().height);
  host.remove();
  return Math.max(1, height);
}

/**
 * An element's children as well-formed XHTML.
 *
 * `innerHTML` would be simpler and is wrong: it emits `<br>` and `<hr>` unclosed, which is correct
 * HTML and fatal XML, and `<foreignObject>` content is parsed as XML. A paragraph with a line
 * break in it — the most ordinary thing in an email — took the whole render down with
 * "something in it is not well-formed markup".
 *
 * `XMLSerializer` closes them, escapes what needs escaping, and stamps the XHTML namespace on each
 * node, which is what the foreignObject needs anyway.
 */
export function xhtmlOf(host: Element): string {
  const xml = new XMLSerializer();
  return [...host.childNodes].map((node) => xml.serializeToString(node)).join('');
}

/** Images this browser will refuse to draw, because doing so would taint the canvas. */
export function foreignImages(host: Element): string[] {
  const here = window.location.origin;
  // `<img>` in markup and `<image>` on a freeform surface: both are pictures the canvas would taint on.
  const imgs = [...host.querySelectorAll('img')].map((img) => img.src);
  const svgs = [...host.querySelectorAll('image')].map((image) => image.getAttribute('href') ?? '');
  return [...imgs, ...svgs].filter((src) => /^https?:/i.test(src) && !src.startsWith(here));
}

export function rasterise(options: RasteriseOptions): Promise<Rastered> {
  const { html, css, width, background, style = '', className = '', scale = 2 } = options;
  const height = measure(html, css, width, style, className);

  // `xmlns` on both elements, and `xhtml` on the body div: a foreignObject whose contents are not
  // in the XHTML namespace renders as nothing at all, silently.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" class="${className}" style="display:flow-root; width:${width}px; background:${background}; ${style}">` +
    `<style>${css}</style>${html}` +
    `</div></foreignObject></svg>`;

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        draw();
      } catch (cause) {
        // `toBlob` on a canvas that has been tainted throws *inside* this handler, where an
        // uncaught throw would settle nothing at all and leave the button saying "Drawing…"
        // for ever. A promise with a path that neither resolves nor rejects is worse than one
        // that fails.
        reject(
          cause instanceof Error && cause.name === 'SecurityError'
            ? new Error('This block contains an image from another site, and a browser will not let me draw one into a picture. Remove it, or host it alongside the editor.')
            : (cause as Error),
        );
      }
    };
    const draw = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('This browser would not give me a canvas to draw on.'));
        return;
      }
      // The ground is painted rather than left transparent. A PNG with an alpha channel sitting on
      // a cream email looks right until a dark client paints its own background behind it.
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('The image could not be encoded.'));
          return;
        }
        resolve({ blob, url: URL.createObjectURL(blob), width, height });
      }, 'image/png');
    };
    image.onerror = () =>
      reject(new Error('The text could not be drawn. Something in it is not well-formed markup.'));
    // A data URL rather than a blob URL: a blob URL for an SVG is treated as a separate document
    // by some engines and loses the styles inside it.
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * The words, for the `alt`.
 *
 * Not decoration and not a nicety: Outlook on Windows blocks images by default and so does most of
 * corporate email, which means for a real share of the audience this *is* the block. Taking the
 * text from the markup rather than asking for it again is the only way it cannot drift.
 */
export function textOf(html: string): string {
  const host = document.createElement('div');
  // A space wherever a block ends. `textContent` alone concatenates, so a heading followed by a
  // paragraph comes out as "Heading oneSome copy here." — and for a reader with images off this
  // string *is* the block, so it has to read as a sentence and not as a run-on.
  host.innerHTML = html.replace(/<\/(?:p|h[1-6]|div|li|blockquote|tr|td)>|<(?:br|hr)\s*\/?>/gi, ' ');
  return (host.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Where rendered text goes, kept apart from artwork somebody made. */
export const RENDERED = 'rendered';

/**
 * `rendered/a-heading-like-this-b00h.png`.
 *
 * Named after the words so the file says what it holds — a folder of `image-1.png` through
 * `image-9.png` is a folder nobody can tidy — and suffixed with the block id so that two blocks
 * that happen to start the same way do not overwrite each other.
 *
 * The subfolder is the point of the name: these are *generated*, they are regenerated whenever the
 * type changes, and a folder three people sync should say which files are safe to delete.
 */
export function fileNameFor(text: string, id: string): string {
  const stem =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'text';
  return `${RENDERED}/${stem}-${id}.png`;
}
