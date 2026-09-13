import React from 'react';
export function Wordmark({ name = 'enkel', size = 18, as = 'div', href, style, ...rest }) {
  const Tag = href ? 'a' : as;
  const ls = (size * 0.011).toFixed(3) + 'px';
  return <Tag href={href} style={{ fontFamily: 'var(--font-helveticaneue)', fontWeight: 400, fontSize: size, lineHeight: 1, letterSpacing: ls, color: 'var(--text-primary)', textDecoration: 'none', textTransform: 'lowercase', display: 'inline-block', ...style }} {...rest}>{name}_</Tag>;
}
