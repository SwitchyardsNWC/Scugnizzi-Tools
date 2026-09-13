import React from 'react';
export function Refusal({ title, children, action, tone = 'gate', style, ...rest }) {
  const ink = tone === 'short' ? 'var(--status-risk)' : 'var(--status-blocked)';
  return <div role="status" style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', borderTop: '1px solid ' + ink, borderBottom: '1px solid ' + ink, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 4, ...style }} {...rest}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><span aria-hidden style={{ color: ink }}>→</span><span>{title}</span></div>
    {children ? <div style={{ paddingLeft: 16, color: 'var(--text-secondary)', fontSize: 13, letterSpacing: '0.143px', display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div> : null}
    {action ? <div style={{ paddingLeft: 16, marginTop: 5 }}>{action}</div> : null}
  </div>;
}
