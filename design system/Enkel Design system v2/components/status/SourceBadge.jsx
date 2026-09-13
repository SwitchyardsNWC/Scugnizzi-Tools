import React from 'react';
const META = { warehouse: { label: 'Warehouse', ink: 'var(--source-warehouse)', soft: 'var(--source-warehouse-soft)' }, purchase: { label: 'Purchase', ink: 'var(--source-purchase)', soft: 'var(--source-purchase-soft)' }, build: { label: 'Build', ink: 'var(--source-build)', soft: 'var(--source-build-soft)' } };
export function SourceBadge({ source = 'purchase', detail, style, ...rest }) {
  const m = META[source] || META.purchase;
  return <span style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: 'var(--control-line,16px)', letterSpacing: '0.143px', display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%', minWidth: 0, verticalAlign: 'middle', ...style }} {...rest}>
    <span style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', minHeight: 'var(--label-height-sm,20px)', padding: '5px 5px 1px', boxSizing: 'border-box', borderRadius: 'var(--radius-tags-sm,4px)', background: m.ink, color: 'var(--source-on-ink, var(--color-paper-white))', fontSize: 'var(--text-micro,13px)', lineHeight: 'var(--label-line-sm,14px)', letterSpacing: 'var(--tracking-micro,0.3px)', textTransform: 'uppercase' }}>{m.label}</span>
    {detail ? <span style={{ color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</span> : null}
  </span>;
}
