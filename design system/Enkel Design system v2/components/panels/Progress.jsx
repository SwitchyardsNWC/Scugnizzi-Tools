import React from 'react';
export function Progress({ done = 0, total = 0, required, label, tone, style, ...rest }) {
  const pct = total ? Math.round(done / total * 100) : 0;
  const fill = tone ? 'var(--data-' + ({ primary: 1, good: 2, warn: 3, bad: 4 }[tone] || 1) + ')' : pct === 100 ? 'var(--status-done)' : 'var(--text-primary)';
  return <div style={{ fontFamily: 'var(--font-helveticaneue)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...style }} {...rest}>
    {label !== false ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, lineHeight: 'var(--control-line-sm,14px)', letterSpacing: '0.143px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label || (done + ' of ' + total + ' done')}</span>{required != null ? <span style={{ flex: '0 0 auto', color: required ? 'var(--status-blocked)' : 'var(--status-done)' }}>{required ? required + ' required open' : 'Ready to close'}</span> : null}</div> : null}
    <div style={{ height: 4, background: 'var(--data-track)', position: 'relative' }}><div style={{ position: 'absolute', inset: '0 auto 0 0', width: pct + '%', background: fill, transition: 'width 120ms linear' }} /></div>
  </div>;
}
/* Kpi = the quiet, hairline-under version of a figure. For dashboards prefer Stat (components/dashboard), which adds delta + sparkline + drill. */
export function Kpi({ label, value, hint, tone, style, ...rest }) {
  return <div style={{ fontFamily: 'var(--font-helveticaneue)', borderBottom: '1px solid var(--border-card)', paddingBottom: 8, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...style }} {...rest}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 24, lineHeight: 1.1, letterSpacing: '-0.2px', fontVariantNumeric: 'tabular-nums', color: tone === 'risk' ? 'var(--status-risk)' : tone === 'blocked' ? 'var(--status-blocked)' : 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    <span style={{ fontSize: 13, lineHeight: 1.25, letterSpacing: '0.143px', color: 'var(--text-secondary)', textWrap: 'pretty', minWidth: 0 }}>{label}</span>
    {hint != null ? <span style={{ fontSize: 13, lineHeight: 1.25, letterSpacing: '0.143px', color: 'var(--text-muted)', textWrap: 'pretty', minWidth: 0 }}>{hint}</span> : null}
  </div>;
}
export function KpiStrip({ children, columns, min = 140, style, ...rest }) {
  const kids = React.Children.toArray(children).filter(Boolean);
  const anyHint = kids.some(k => k.props && k.props.hint != null && k.props.hint !== '');
  const rows = anyHint ? 3 : 2;
  const cols = columns ? 'repeat(' + columns + ',minmax(0,1fr))' : 'repeat(auto-fit,minmax(' + (typeof min === 'number' ? min + 'px' : min) + ',1fr))';
  return <div style={{ display: 'grid', gridTemplateColumns: cols, gridTemplateRows: 'repeat(' + rows + ',auto)', columnGap: 'var(--element-gap,12px)', rowGap: 'var(--element-gap,12px)', ...style }} {...rest}>
    {kids.map((k, i) => React.isValidElement(k) ? React.cloneElement(k, { key: k.key || i, hint: anyHint ? (k.props.hint != null ? k.props.hint : '') : k.props.hint, style: { gridRow: 'span ' + rows, display: 'grid', gridTemplateRows: 'subgrid', rowGap: 4, ...k.props.style } }) : k)}
  </div>;
}
