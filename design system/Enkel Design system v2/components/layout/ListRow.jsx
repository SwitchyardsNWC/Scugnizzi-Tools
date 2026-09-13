import React from 'react';
export function ListRow({ primary, secondary, meta, trailing, onClick, href, style, ...rest }) {
  const Tag = href ? 'a' : (onClick ? 'button' : 'div');
  const act = !!(onClick || href);
  return <Tag href={href} onClick={onClick} type={Tag === 'button' ? 'button' : undefined}
    onMouseEnter={act ? e => { e.currentTarget.style.background = 'var(--surface-row-hover)'; } : undefined} onMouseLeave={act ? e => { e.currentTarget.style.background = 'none'; } : undefined}
    style={{ transition: 'background 120ms linear', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', columnGap: 'var(--element-gap,12px)', width: '100%', minHeight: 'var(--touch-target-lg,56px)', padding: '10px 0', boxSizing: 'border-box', borderBottom: '1px solid var(--border-muted)', background: 'none', border: 0, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border-muted)', textAlign: 'left', textDecoration: 'none', fontFamily: 'var(--font-helveticaneue)', color: 'var(--text-primary)', cursor: onClick || href ? 'pointer' : 'default', ...style }} {...rest}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primary}</div>
      {secondary && <div style={{ fontSize: 13, lineHeight: 1.3, letterSpacing: '0.143px', color: 'var(--text-secondary)', marginTop: 2 }}>{secondary}</div>}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, letterSpacing: '0.143px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{meta}{trailing}{(onClick || href) && !trailing && <span aria-hidden="true">›</span>}</div>
  </Tag>;
}
