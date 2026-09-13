import React from 'react';
/* Change vs. a previous period. Tone follows sign unless `invert` (lower is better) or `tone` is set. Square glyphs only: ▲ ▼ ■. */
export function Delta({ value, format, invert = false, tone, label, size = 'md', style, ...rest }) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  const dir = isNaN(n) || n === 0 ? 'flat' : n > 0 ? 'up' : 'down';
  const good = tone ? tone : dir === 'flat' ? 'flat' : (dir === 'up') !== invert ? 'good' : 'bad';
  const ink = good === 'good' ? 'var(--delta-up)' : good === 'bad' ? 'var(--delta-down)' : 'var(--delta-flat)';
  const glyph = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
  const text = format ? format(n) : (isNaN(n) ? value : (n > 0 ? '+' : '') + n + '%');
  const fs = size === 'sm' ? 12 : 13;
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: fs, lineHeight: 1.25, letterSpacing: 0, fontVariantNumeric: 'tabular-nums', color: ink, display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap', ...style }} {...rest}>
    <span aria-hidden style={{ fontSize: fs - 5, lineHeight: 1, alignSelf: 'center' }}>{glyph}</span><span>{text}</span>{label ? <span style={{ fontFamily: 'var(--font-helveticaneue)', letterSpacing: '0.143px', color: 'var(--text-muted)' }}>{label}</span> : null}
  </span>;
}
/* Mono, tabular figure in running text or table cells. */
export function Num({ children, size, muted, style, ...rest }) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: size, letterSpacing: 0, fontVariantNumeric: 'tabular-nums', color: muted ? 'var(--text-muted)' : 'inherit', whiteSpace: 'nowrap', ...style }} {...rest}>{children}</span>;
}
