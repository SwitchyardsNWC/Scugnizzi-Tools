import React from 'react';
export function Paragraph({ light = false, muted = false, measure = true, size = 'body', children, style, ...rest }) {
  const caption = size === 'caption';
  return <p style={{ margin: '0 0 21px', fontFamily: light ? 'var(--font-helveticaneue-light)' : 'var(--font-helveticaneue)', fontWeight: light ? 300 : 400, fontSize: caption ? 15 : 17, lineHeight: 1.3, letterSpacing: caption ? '0.143px' : '0.154px', color: muted ? 'var(--text-muted)' : 'var(--text-primary)', textAlign: 'left', maxWidth: measure ? 'var(--measure-body,66ch)' : undefined, textWrap: 'pretty', ...style }} {...rest}>{children}</p>;
}
