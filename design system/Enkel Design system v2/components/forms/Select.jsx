import React from 'react';
export function Select({ label, hint, options = [], style, id, ...rest }) {
  const uid = id || (label ? 'sel-' + label.replace(/\W+/g, '-').toLowerCase() : undefined);
  return <label htmlFor={uid} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-helveticaneue)', ...style }}>
    {label ? <span style={{ fontSize: 13, lineHeight: 1.3, letterSpacing: '0.143px', color: 'var(--text-secondary)' }}>{label}</span> : null}
    <select id={uid} onFocus={e => { e.currentTarget.style.boxShadow = 'inset 0 -1px 0 var(--border-hairline)'; }} onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
      style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', color: 'var(--text-primary)', background: 'transparent', border: 0, borderBottom: '1px solid var(--border-hairline)', borderRadius: 0, padding: '8px 16px 8px 0', minHeight: 'var(--control-height,36px)', width: '100%', boxSizing: 'border-box', outline: 'none', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', transition: 'box-shadow 120ms linear', backgroundImage: 'linear-gradient(45deg, transparent 50%, var(--text-primary) 50%), linear-gradient(135deg, var(--text-primary) 50%, transparent 50%)', backgroundPosition: 'calc(100% - 5px) 50%, 100% 50%', backgroundSize: '5px 5px, 5px 5px', backgroundRepeat: 'no-repeat' }} {...rest}>
      {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {hint ? <span style={{ fontSize: 13, lineHeight: 1.3, letterSpacing: '0.143px', color: 'var(--text-muted)' }}>{hint}</span> : null}
  </label>;
}
