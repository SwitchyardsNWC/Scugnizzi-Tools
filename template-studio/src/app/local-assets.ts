import type { AssetFile } from '../workspace/workspace.ts';

// Showing a local picture on the canvas without letting one into a template.
//
// An image block whose `src` is a file name — `hero.png` — is a picture the designer can see and an
// email client cannot fetch. Both halves have to be true at once: the canvas should show the real
// thing at the real dimensions, and Export should refuse until a hosted URL replaces it.
//
// So the substitution happens **here**, on the preview string, and nowhere near the compiler. The
// compiler stays pure and DOM-free (architecture.md §2) and has never heard of a blob URL; this is
// the same shape as `simulateDark`, which also transforms compiled output rather than changing how
// it is produced. Nothing this file does can reach an exported template, because the export is
// compiled separately and never passes through it.

/** Everything an email client could actually fetch. Anything else is still sitting on a laptop. */
export const isHostedUrl = (src: string) =>
  /^(https?:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('{{') || src.startsWith('{%');

/**
 * Swaps local file names for blob URLs in a compiled *preview*.
 *
 * Matched on the whole attribute value rather than as a substring: `src="hero.png"` and
 * `src="https://example.com/hero.png"` both contain the file name, and replacing inside the second
 * would corrupt a URL that was already fine.
 */
export function withLocalAssets(html: string, assets: AssetFile[]): string {
  if (assets.length === 0) return html;
  const byName = new Map(assets.map((a) => [a.name, a.url]));
  // `href` as well as `src`: an image layer on a freeform surface is an SVG `<image href>`.
  return html.replace(/\b(src|href)="([^"]*)"/g, (whole, attr: string, value: string) => {
    const url = byName.get(value);
    return url ? `${attr}="${url}"` : whole;
  });
}

/**
 * Empties the `href` of every SVG `<image>` that still names a bare file after `withLocalAssets`: a
 * picture the page cannot show yet. The standalone Freeform tool loads its kept pictures a moment after
 * the canvas first draws, and until then every redraw asked the server for `photo.png` by name and
 * logged a 404. An empty href asks for nothing; the picture appears when its file arrives.
 */
export function withoutMissingPictures(svg: string): string {
  return svg.replace(/(<image\b[^>]*?\bhref=")([^"]*)"/g, (whole, start: string, value: string) =>
    !value || isHostedUrl(value) || value.startsWith('blob:') ? whole : `${start}"`,
  );
}

/** The image sources in a compiled template that no email client could load. */
export function localImages(html: string): string[] {
  const out = new Set<string>();
  for (const [, src] of html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)) {
    if (src && !isHostedUrl(src)) out.add(src);
  }
  return [...out];
}
