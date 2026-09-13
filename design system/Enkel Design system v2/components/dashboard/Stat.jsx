import React from 'react';
import { Delta } from './Delta.jsx';
import { Sparkline } from './Sparkline.jsx';
/* The dashboard figure. Label (13px secondary) / value (28px mono) / delta / sparkline. Click = drill. */
export function Stat({ label, value, unit, delta, deltaLabel, invert, spark, sparkKind = 'line', tone = 1, hint, onClick, size = 'md', style, ...rest }) {
  const act = !!onClick; const [hov, setHov] = React.useState(false);
  const Tag = act ? 'button' : 'div'; const big = size === 'lg';
  return <Tag type={act ? 'button' : undefined} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
    style={{ fontFamily: 'var(--font-helveticaneue)', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, margin: 0, color: 'var(--text-primary)', cursor: act ? 'pointer' : 'default', appearance: 'none', width: '100%', ...style }} {...rest}>
    <span style={{ fontSize: 13, lineHeight: 1.25, letterSpacing: '0.143px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>{act ? <span aria-hidden style={{ color: hov ? 'var(--text-primary)' : 'var(--text-faint)', transition: 'color 120ms linear', flex: '0 0 auto' }}>→</span> : null}</span>
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: big ? 40 : 28, lineHeight: 1.1, letterSpacing: big ? '-0.5px' : '-0.2px', fontVariantNumeric: 'tabular-nums', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      {unit ? <span style={{ fontSize: 13, letterSpacing: '0.143px', color: 'var(--text-muted)' }}>{unit}</span> : null}
    </span>
    {delta != null || hint ? <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, fontSize: 13, letterSpacing: '0.143px', color: 'var(--text-muted)' }}>{delta != null ? <Delta value={delta} invert={invert} label={deltaLabel} /> : null}{hint ? <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</span> : null}</span> : null}
    {spark ? <Sparkline data={spark} kind={sparkKind} tone={tone} height={big ? 40 : 28} style={{ marginTop: 4 }} /> : null}
  </Tag>;
}
/* Phone breakpoint shared by the dashboard set. */
export function usePhone(max = 767) {
  const q = '(max-width:' + max + 'px)';
  const [m, setM] = React.useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  React.useEffect(() => { const mq = window.matchMedia(q); const f = e => setM(e.matches); mq.addEventListener('change', f); setM(mq.matches); return () => mq.removeEventListener('change', f); }, [q]);
  return m;
}
/* Row of Stats: cards on the sunken page, reflowing by min width; value / delta / spark share rows. Under 768px it pins two columns at 12px padding so six Stats read as three rows, not a tower. */
export function StatGrid({ children, min = 200, columns, phoneColumns = 2, gap = 12, style, ...rest }) {
  const phone = usePhone();
  const cols = phone && phoneColumns ? 'repeat(' + phoneColumns + ',minmax(0,1fr))' : columns ? 'repeat(' + columns + ',minmax(0,1fr))' : 'repeat(auto-fit,minmax(min(' + (typeof min === 'number' ? min + 'px' : min) + ',100%),1fr))';
  return <div style={{ display: 'grid', gridTemplateColumns: cols, gap: phone ? 8 : gap, ...style }} {...rest}>
    {React.Children.map(children, k => k ? <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-card)', padding: phone ? 12 : 16, minWidth: 0, display: 'flex' }}>{k}</div> : null)}
  </div>;
}
