import React from 'react';
export const KIND_GLYPH = { page: '¶', frame: '▢', row: '≡', embed: '⊞', file: '⎘', spec: '¶' };
export const KIND_LABEL = { page: 'Document page', frame: 'Board frame', row: 'Schedule row', embed: 'Embed', file: 'File', spec: 'Spec page' };
export function LivesIn({ kind, label, href = '#', unlinked = false, required = false, onClick, style, ...rest }) {
  const f = { fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: 'var(--control-line,16px)', letterSpacing: '0.143px', display: 'inline-flex', gap: 4, whiteSpace: 'nowrap', textDecoration: 'none', maxWidth: '100%', minWidth: 0 };
  const txt = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' };
  // Unlinked reads "Not yet linked" only — required is carried by the amber rule, not a second word.
  if (unlinked) return <button type="button" onClick={onClick} title={required ? 'Required — not yet linked' : 'Not yet linked'} style={{ ...f, alignItems: 'center', width: 'max-content', border: '1px dashed ' + (required ? 'var(--status-risk)' : 'var(--border-muted)'), color: required ? 'var(--status-risk)' : 'var(--text-muted)', background: 'transparent', padding: '5px 8px 1px', minHeight: 'var(--label-height,22px)', boxSizing: 'border-box', borderRadius: 'var(--radius-tags,4px)', cursor: 'pointer', ...style }} {...rest}><span style={txt}>Not yet linked</span><span aria-hidden style={{ flex: '0 0 auto' }}>→</span></button>;
  return <a href={href} onClick={e => { if (onClick) { e.preventDefault(); onClick(); } }} title={KIND_LABEL[kind]}
    onMouseEnter={e => { e.currentTarget.style.borderBottomColor = 'var(--text-primary)'; }} onMouseLeave={e => { e.currentTarget.style.borderBottomColor = 'var(--border-muted)'; }}
    style={{ ...f, alignItems: 'baseline', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-muted)', cursor: 'pointer', ...style }} {...rest}><span aria-hidden style={{ flex: '0 0 auto', color: 'var(--text-muted)' }}>{KIND_GLYPH[kind] || '↗'}</span><span style={txt}>{label}</span></a>;
}
