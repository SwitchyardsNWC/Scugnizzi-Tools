import React from 'react';
export function AccentCard({ variant = 'accent', children, style, ...rest }) {
  const v = variant === 'accent' ? { background: 'var(--surface-accent)', color: 'var(--text-on-accent)', border: '1px solid var(--surface-accent)' } : { background: 'var(--surface-paper)', color: 'var(--text-primary)', border: '1px solid var(--border-hairline)' };
  return <div style={{ padding: 'var(--card-padding,16px)', borderRadius: 0, boxShadow: 'none', fontFamily: 'var(--font-helveticaneue)', fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', ...v, ...style }} {...rest}>{children}</div>;
}
