import React from 'react';
export function Divider({ tone = 'ink', vertical = false, style, ...rest }) {
  const c = { ink: 'var(--border-hairline)', charcoal: 'var(--border-hairline-soft)', muted: 'var(--border-muted)' }[tone];
  return <hr aria-orientation={vertical ? 'vertical' : undefined} style={{ margin: 0, border: 0, background: c, ...(vertical ? { width: 1, alignSelf: 'stretch', height: 'auto' } : { height: 1, width: '100%' }), ...style }} {...rest} />;
}
