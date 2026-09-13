import React from 'react';
export function SidebarNav({ items = [], activeId, onSelect, style, ...rest }) {
  return <nav aria-label="Sections" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--list-gap,8px)', alignItems: 'flex-start', ...style }} {...rest}>
    {items.map(it => {
      const active = it.id === activeId;
      return <a key={it.id} href={it.href || '#'} aria-current={active ? 'page' : undefined}
        onClick={e => { if (onSelect) { e.preventDefault(); onSelect(it.id); } }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = active ? 'var(--text-primary)' : 'var(--text-muted)'; }}
        style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', fontWeight: 400, textDecoration: 'none', color: active ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'color 120ms linear', cursor: 'pointer' }}>{it.label}</a>;
    })}
  </nav>;
}
