import React from 'react';
export function TopBar({ title, back, onBack, action, style, ...rest }) {
  const btn = { fontFamily: 'var(--font-helveticaneue)', fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', background: 'none', border: 0, padding: 0, marginLeft: -5, minWidth: 'var(--touch-target,44px)', minHeight: 'var(--touch-target,44px)', display: 'inline-flex', alignItems: 'center', color: 'var(--text-primary)', cursor: 'pointer' };
  return <header style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface-paper)', borderBottom: '1px solid var(--border-hairline)', paddingTop: 'var(--safe-top,0px)', height: 'calc(var(--topbar-height,52px) + var(--safe-top,0px))', boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '0 var(--gutter-phone,21px)', ...style }} {...rest}>
    <div style={{ justifySelf: 'start' }}>{back && <button type="button" onClick={onBack} style={btn} aria-label="Back">←&nbsp;{typeof back === 'string' ? back : ''}</button>}</div>
    <div style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
    <div style={{ justifySelf: 'end' }}>{action}</div>
  </header>;
}
