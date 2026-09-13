import React from 'react';
export function ImageBlock({ src, alt = '', ratio, width = '100%', height, fit = 'cover', placeholder = 'Image', hint, style, ...rest }) {
  const small = (typeof width === 'number' && width <= 64) || (typeof height === 'number' && height <= 64);
  const box = { width, height, aspectRatio: ratio, borderRadius: small ? 'var(--radius-images-sm,4px)' : 'var(--radius-images,8px)', overflow: 'hidden', display: 'block', maxWidth: '100%' };
  if (!src) return <div role="img" aria-label={alt || placeholder} style={{ ...box, border: '1px solid var(--border-hairline)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: small ? 2 : 10, textAlign: 'center', fontFamily: 'var(--font-helveticaneue)', fontSize: small ? 13 : 15, lineHeight: 1.3, letterSpacing: small ? '0.3px' : '0.143px', color: 'var(--text-secondary)', ...style }} {...rest}><span>{placeholder}</span>{hint && !small ? <span style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>{hint}</span> : null}</div>;
  return <img src={src} alt={alt} style={{ ...box, objectFit: ratio || height ? fit : undefined, ...style }} {...rest} />;
}
/* Gallery of frames: cells reflow at every width instead of squeezing below a legible size. */
export function ImageGrid({ min = 180, gap = 21, columns, children, style, ...rest }) {
  const cols = columns ? 'repeat(' + columns + ',minmax(0,1fr))' : 'repeat(auto-fill,minmax(' + (typeof min === 'number' ? min + 'px' : min) + ',1fr))';
  return <div style={{ display: 'grid', gridTemplateColumns: cols, gap, ...style }} {...rest}>{children}</div>;
}
