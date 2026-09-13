import React from 'react';
export function TextLink({ children, style, arrow = false, ...rest }) {
  return <a onMouseEnter={e => { e.currentTarget.style.color = 'var(--link-hover)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--link-default)'; }}
    style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', fontWeight: 400, color: 'var(--link-default)', textDecoration: 'none', transition: 'color 120ms linear', cursor: 'pointer', ...style }} {...rest}>{children}{arrow ? ' →' : null}</a>;
}
