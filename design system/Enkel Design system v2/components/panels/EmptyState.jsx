import React from 'react';
export function EmptyState({ what, action, ratio, compact = false, style, ...rest }) {
  return <div style={{ fontFamily: 'var(--font-helveticaneue)', border: '1px dashed var(--border-muted)', aspectRatio: ratio, padding: compact ? '10px 21px' : 21, display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: compact ? 'center' : 'flex-start', justifyContent: compact ? 'space-between' : 'flex-end', gap: 8, boxSizing: 'border-box', minHeight: compact ? undefined : 84, ...style }} {...rest}>
    <span style={{ fontSize: 13, lineHeight: 1.3, letterSpacing: '0.143px', color: 'var(--text-muted)' }}>{what}</span>{action}
  </div>;
}
