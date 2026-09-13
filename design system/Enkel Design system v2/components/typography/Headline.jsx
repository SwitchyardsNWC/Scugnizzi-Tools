import React from 'react';
export function Headline({ as = 'h1', children, style, ...rest }) {
  const Tag = as;
  return <Tag style={{ margin: 0, fontFamily: 'var(--font-helveticaneue)', fontWeight: 400, fontSize: 'var(--text-display, 40px)', lineHeight: 1, letterSpacing: 'var(--tracking-display, 0.44px)', color: 'var(--text-primary)', textAlign: 'left', textWrap: 'balance', ...style }} {...rest}>{children}</Tag>;
}
