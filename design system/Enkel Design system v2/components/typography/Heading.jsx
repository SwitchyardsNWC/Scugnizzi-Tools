import React from 'react';
const SIZES = { heading: ['30px', 1.1, '0.264px'], sm: ['21px', 1.15, '0.198px'], sub: ['19px', 1.15, '0.176px'] };
export function Heading({ level = 'heading', as, children, style, ...rest }) {
  const [fs, lh, ls] = SIZES[level] || SIZES.heading;
  const Tag = as || (level === 'heading' ? 'h2' : level === 'sm' ? 'h3' : 'h4');
  return <Tag style={{ margin: 0, fontFamily: 'var(--font-helveticaneue)', fontWeight: 400, fontSize: fs, lineHeight: lh, letterSpacing: ls, color: 'var(--text-primary)', ...style }} {...rest}>{children}</Tag>;
}
