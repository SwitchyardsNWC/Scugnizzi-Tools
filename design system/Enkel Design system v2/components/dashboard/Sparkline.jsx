import React from 'react';
/* Minimal trend: one line (or bar row), no axes, no labels. Last point marked with a square. Colour from the data palette. */
export function Sparkline({ data = [], kind = 'line', height = 32, width = '100%', tone = 1, baseline, last = true, style, ...rest }) {
  const W = 100, H = 32; const n = data.length; if (!n) return <div style={{ height, width }} />;
  const lo = Math.min(...data, baseline != null ? baseline : Infinity), hi = Math.max(...data, baseline != null ? baseline : -Infinity); const span = hi - lo || 1;
  const x = i => n === 1 ? W / 2 : (i / (n - 1)) * W; const y = v => H - 2 - ((v - lo) / span) * (H - 4);
  const ink = typeof tone === 'number' ? 'var(--data-' + tone + ')' : tone;
  const pts = data.map((v, i) => x(i).toFixed(2) + ',' + y(v).toFixed(2)).join(' ');
  return <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width={width} height={height} aria-hidden style={{ display: 'block', overflow: 'visible', ...style }} {...rest}>
    {baseline != null ? <line x1="0" x2={W} y1={y(baseline)} y2={y(baseline)} stroke="var(--border-card)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="2 3" /> : null}
    {kind === 'bars' ? data.map((v, i) => { const bw = W / n; return <rect key={i} x={i * bw + bw * 0.15} width={bw * 0.7} y={y(v)} height={H - y(v)} fill={i === n - 1 && last ? ink : 'var(--data-track)'} />; })
      : <polyline points={pts} fill="none" stroke={ink} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    {kind === 'line' && last ? <rect x={x(n - 1) - 2} y={y(data[n - 1]) - 2} width="4" height="4" fill={ink} style={{ transform: 'none' }} vectorEffect="non-scaling-stroke" /> : null}
  </svg>;
}
