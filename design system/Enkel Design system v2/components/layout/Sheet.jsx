import React from 'react';
export function Sheet({ open, title, onClose, children, style, ...rest }) {
  if (!open) return null;
  return <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10, background: 'var(--surface-scrim,rgba(0,0,0,.4))', display: 'flex', alignItems: 'flex-end' }}>
    <section role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={e => e.stopPropagation()}
      style={{ width: '100%', maxHeight: 'var(--sheet-max-height,85vh)', overflowY: 'auto', background: 'var(--surface-paper)', borderTop: '1px solid var(--border-hairline)', paddingBottom: 'var(--safe-bottom,0px)', boxSizing: 'border-box', ...style }} {...rest}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 'var(--topbar-height,48px)', padding: '0 var(--gutter-phone,21px)', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', color: 'var(--text-primary)' }}>{title}</div>
        <button type="button" onClick={onClose} onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }} style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 14, letterSpacing: '0.154px', background: 'none', border: 0, padding: 0, minWidth: 'var(--touch-target,44px)', minHeight: 'var(--touch-target,44px)', color: 'var(--text-muted)', cursor: 'pointer', marginRight: -10, transition: 'color 120ms linear' }}>Close</button>
      </header>
      <div style={{ padding: 'var(--gutter-phone,16px)' }}>{children}</div>
    </section>
  </div>;
}
