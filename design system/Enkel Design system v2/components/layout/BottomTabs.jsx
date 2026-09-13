import React from 'react';
export function BottomTabs({ items = [], activeId, onSelect, style, ...rest }) {
  return <nav aria-label="Primary" style={{ position: 'sticky', bottom: 0, zIndex: 2, background: 'var(--surface-paper)', borderTop: '1px solid var(--border-hairline)', paddingBottom: 'var(--safe-bottom,0px)', display: 'grid', gridTemplateColumns: `repeat(${items.length || 1},1fr)`, ...style }} {...rest}>
    {items.map(it => {
      const active = it.id === activeId;
      return <a key={it.id} href={it.href || '#'} aria-current={active ? 'page' : undefined}
        onClick={e => { if (onSelect) { e.preventDefault(); onSelect(it.id); } }}
        style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: 1.3, letterSpacing: '0.143px', textDecoration: 'none', minHeight: 'var(--bottomtabs-height,56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, padding: '0 5px', color: active ? 'var(--text-primary)' : 'var(--text-muted)', borderTop: active ? '2px solid var(--border-hairline)' : '2px solid transparent', marginTop: -1, transition: 'color 120ms linear', cursor: 'pointer' }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span></a>;
    })}
  </nav>;
}
