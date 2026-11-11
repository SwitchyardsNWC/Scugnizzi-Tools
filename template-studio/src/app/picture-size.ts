// A picture's own size, read from the address the canvas is showing it at. Local files are drawn from blob
// addresses that only the page knows (local-assets.ts), so the page's own element is the one place to ask.

/** The address the canvas draws a picture layer from, or null when it is not on the page. */
export function shownImageHref(layerId: string): string | null {
  const el = document.querySelector(`[data-sy-layer="${CSS.escape(layerId)}"]`);
  const img = el?.tagName.toLowerCase() === 'image' ? el : el?.querySelector('image');
  return img?.getAttribute('href') || img?.getAttribute('xlink:href') || null;
}

export function measureImage(layerId: string): Promise<{ width: number; height: number } | null> {
  const href = shownImageHref(layerId);
  if (!href) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = href;
  });
}
