import React from 'react';
/* Where you are, and the way back. Text only, › between, current item ink. */
export function Breadcrumb({ items = [], style, ...rest }) {
  return <nav aria-label="Breadcrumb" style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: 1.25, letterSpacing: '0.143px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap', ...style }} {...rest}>
    {items.map((it, i) => { const last = i === items.length - 1; const act = !last && (it.onClick || it.href);
      return <React.Fragment key={i}>
        {act ? <a href={it.href || '#'} onClick={e => { if (it.onClick) { e.preventDefault(); it.onClick(); } }} style={{ color: 'var(--text-muted)', textDecoration: 'none', whiteSpace: 'nowrap' }} onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}>{it.label}</a>
          : <span aria-current={last ? 'page' : undefined} style={{ color: last ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>}
        {!last ? <span aria-hidden style={{ color: 'var(--text-faint)' }}>›</span> : null}
      </React.Fragment>; })}
  </nav>;
}
