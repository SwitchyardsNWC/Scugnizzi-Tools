import React from 'react';
export function Panel({ title, kicker, onClose, footer, width = 360, children, style, ...rest }) {
  const f = { fontFamily: 'var(--font-helveticaneue)', letterSpacing: '0.154px' };
  return <aside style={{ ...f, width, flex: 'none', borderLeft: '1px solid var(--border-hairline)', background: 'var(--surface-paper)', display: 'flex', flexDirection: 'column', minHeight: 0, ...style }} {...rest}>
    <header style={{ padding: '16px', borderBottom: '1px solid var(--border-card)', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>{kicker ? <span style={{ fontSize: 13, letterSpacing: '0.143px', color: 'var(--text-muted)' }}>{kicker}</span> : null}<span style={{ fontSize: 18, lineHeight: 1.15, letterSpacing: '0.198px' }}>{title}</span></div>
      {onClose ? <button type="button" onClick={onClose} aria-label="Close" onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }} style={{ background: 'none', border: 0, padding: 0, margin: '-10px -10px -10px 0', minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1, cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit', transition: 'color 120ms linear' }}>×</button> : null}
    </header>
    <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, fontSize: 14, lineHeight: 1.2 }}>{children}</div>
    {footer ? <footer style={{ padding: 16, borderTop: '1px solid var(--border-hairline)', display: 'flex', gap: 8, alignItems: 'center' }}>{footer}</footer> : null}
  </aside>;
}
export function PanelSection({ title, children, style }) {
  return <section style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>{title ? <div style={{ fontSize: 13, letterSpacing: '0.143px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-muted)', paddingBottom: 5 }}>{title}</div> : null}{children}</section>;
}
export function Field({ label, children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', padding: '5px 0', borderBottom: '1px solid var(--border-muted)' }}><span style={{ fontSize: 13, letterSpacing: '0.143px', color: 'var(--text-muted)' }}>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</span></div>;
}
