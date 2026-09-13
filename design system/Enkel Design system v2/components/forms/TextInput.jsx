import React from 'react';
export function TextInput({ label, hint, error, multiline = false, style, inputStyle, id, ...rest }) {
  const uid = id || (label ? 'ti-' + label.replace(/\W+/g, '-').toLowerCase() : undefined);
  const Field = multiline ? 'textarea' : 'input';
  const rule = error ? 'var(--status-blocked)' : 'var(--border-hairline)';
  const f = { fontFamily: 'var(--font-helveticaneue)', fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', color: 'var(--text-primary)', background: 'transparent', border: 0, borderBottom: '1px solid ' + rule, borderRadius: 0, padding: '10px 0', minHeight: multiline ? 84 : 'var(--control-height,36px)', width: '100%', boxSizing: 'border-box', outline: 'none', resize: multiline ? 'vertical' : undefined, transition: 'box-shadow 120ms linear', ...inputStyle };
  return <label htmlFor={uid} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-helveticaneue)', ...style }}>
    {label ? <span style={{ fontSize: 13, lineHeight: 1.3, letterSpacing: '0.143px', color: 'var(--text-secondary)' }}>{label}</span> : null}
    <Field id={uid} aria-invalid={error ? true : undefined} style={f} onFocus={e => { e.currentTarget.style.boxShadow = 'inset 0 -1px 0 ' + rule; }} onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }} {...rest} />
    {error ? <span role="alert" style={{ fontSize: 13, lineHeight: 1.3, letterSpacing: '0.143px', color: 'var(--status-blocked)' }}>{error}</span> : hint ? <span style={{ fontSize: 13, lineHeight: 1.3, letterSpacing: '0.143px', color: 'var(--text-muted)' }}>{hint}</span> : null}
  </label>;
}
