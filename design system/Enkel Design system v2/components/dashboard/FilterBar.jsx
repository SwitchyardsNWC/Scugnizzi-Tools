import React from 'react';
/* One row of controls between the page header and the content: filters left, summary/actions right. Hairline under, paper ground so it can sit in the shell header slot. */
export function FilterBar({ children, trailing, summary, style, ...rest }) {
  return <div role="toolbar" style={{ fontFamily: 'var(--font-helveticaneue)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', minHeight: 'var(--control-height,36px)', ...style }} {...rest}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>{children}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>{summary ? <span style={{ fontSize: 13, letterSpacing: '0.143px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{summary}</span> : null}{trailing}</div>
  </div>;
}
/* Removable filter token: "Club: Ponce City ×". 28px, hairline, 4px corner. */
export function FilterChip({ label, value, onRemove, style, ...rest }) {
  return <span style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: 'var(--control-line-sm,14px)', letterSpacing: '0.143px', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 'var(--control-height-sm,28px)', padding: '7px 4px 3px 10px', border: '1px solid var(--border-card)', borderRadius: 'var(--radius-buttons-sm,4px)', background: 'var(--surface-card)', color: 'var(--text-primary)', boxSizing: 'border-box', whiteSpace: 'nowrap', ...style }} {...rest}>
    {label ? <span style={{ color: 'var(--text-muted)' }}>{label}:</span> : null}<span>{value}</span>
    {onRemove ? <button type="button" aria-label={'Remove ' + (typeof value === 'string' ? value : 'filter')} onClick={onRemove} onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }} style={{ background: 'none', border: 0, padding: '0 6px', margin: '-4px 0', fontSize: 14, lineHeight: 1, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 120ms linear' }}>×</button> : null}
  </span>;
}
