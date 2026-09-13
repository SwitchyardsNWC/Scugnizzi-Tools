import React from 'react';
const META = { live: { label: 'Live', ink: 'var(--fresh-live)' }, stale: { label: 'Changed since you looked', ink: 'var(--fresh-stale)' }, frozen: { label: 'Frozen', ink: 'var(--fresh-frozen)' } };
export function Freshness({ state = 'live', when, onRefresh, onFreeze, style, ...rest }) {
  const m = META[state] || META.live;
  const lnk = { color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 0, padding: 0, font: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit', textDecoration: 'underline', textDecorationColor: 'var(--border-muted)', textUnderlineOffset: 3 };
  return <span style={{ fontFamily:'var(--font-helveticaneue)', fontSize: 13, lineHeight: 1.3, letterSpacing: '0.143px', display: 'inline-flex', alignItems: 'baseline', gap: 8, color: m.ink, ...style }} {...rest}>
    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 0, alignSelf: 'center', background: state === 'frozen' ? 'transparent' : m.ink, border: '1px solid ' + m.ink, boxSizing: 'border-box' }} />
    <span>{m.label}{when ? ' · ' + when : ''}</span>
    {state === 'stale' && onRefresh ? <button type="button" onClick={onRefresh} style={lnk}>Refresh</button> : null}
    {state !== 'frozen' && onFreeze ? <button type="button" onClick={onFreeze} style={lnk}>Freeze</button> : null}
  </span>;
}
