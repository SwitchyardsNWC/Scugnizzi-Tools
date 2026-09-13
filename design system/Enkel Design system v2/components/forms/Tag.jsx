import React from 'react';
export function Tag({ tone = 'outline', children, style, ...rest }) {
  const v = { outline: { border: '1px solid var(--border-hairline)', color: 'var(--text-primary)', background: 'transparent' }, muted: { border: '1px solid var(--border-muted)', color: 'var(--text-muted)', background: 'transparent' }, filled: { border: '1px solid var(--text-primary)', color: 'var(--surface-paper)', background: 'var(--text-primary)' } }[tone];
  // width:max-content + maxWidth:100% — a label never stretches to its grid column and never pushes past it.
  return <span style={{ display: 'inline-block', width: 'max-content', maxWidth: '100%', minHeight: 'var(--label-height,22px)', padding: '5px 8px 1px', boxSizing: 'border-box', borderRadius: 'var(--radius-tags,4px)', fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: 'var(--label-line,14px)', letterSpacing: '0.143px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle', ...v, ...style }} {...rest}>{children}</span>;
}
