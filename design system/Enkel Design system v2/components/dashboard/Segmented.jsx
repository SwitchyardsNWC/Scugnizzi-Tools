import React from 'react';
/* Exclusive pick between 2–5 short options. Filled ink for the active one; hairline box; same control geometry as Button (36 / 28). */
export function Segmented({ options = [], value, onChange, size = 'md', ariaLabel, style, ...rest }) {
  const sm = size === 'sm';
  return <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'inline-flex', border: '1px solid var(--border-card)', borderRadius: sm ? 'var(--radius-buttons-sm,4px)' : 'var(--radius-buttons,6px)', padding: 2, gap: 2, background: 'var(--surface-card)', boxSizing: 'border-box', minHeight: sm ? 'var(--control-height-sm,28px)' : 'var(--control-height,36px)', maxWidth: '100%', ...style }} {...rest}>
    {options.map(o => { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label; const on = v === value;
      return <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange && onChange(v)}
        onMouseEnter={e => { if (!on) e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={e => { if (!on) e.currentTarget.style.color = 'var(--text-muted)'; }}
        style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: sm ? 'var(--control-line-sm,14px)' : 'var(--control-line,16px)', letterSpacing: '0.143px', padding: sm ? '5px 8px 1px' : '8px 12px 4px', border: 0, borderRadius: sm ? 2 : 4, background: on ? 'var(--text-primary)' : 'transparent', color: on ? 'var(--surface-paper)' : 'var(--text-muted)', cursor: on ? 'default' : 'pointer', whiteSpace: 'nowrap', transition: 'background-color 120ms linear, color 120ms linear', appearance: 'none', minWidth: 0 }}>{l}</button>; })}
  </div>;
}
