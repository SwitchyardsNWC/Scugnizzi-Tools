import React from 'react';
/* Exclusive pick between 2–5 short options. Filled ink for the active one, on the sunken ground in a soft hairline box.
   Height from padding, like Button: md 36 = 1 + 2 + (9 / 16 / 5) + 2 + 1, sm 28 = 1 + 2 + (6 / 14 / 2) + 2 + 1
   (border + group padding + segment padding / line), top = bottom + 4. No minHeight to centre in. */
export function Segmented({ options = [], value, onChange, size = 'md', ariaLabel, style, ...rest }) {
  const sm = size === 'sm';
  return <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'inline-flex', border: '1px solid var(--border-card)', borderRadius: sm ? 'var(--radius-buttons-sm,4px)' : 'var(--radius-buttons,6px)', padding: 2, gap: 2, background: 'var(--surface-sunken)', boxSizing: 'border-box', maxWidth: '100%', ...style }} {...rest}>
    {options.map(o => { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label; const on = v === value;
      return <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange && onChange(v)}
        onMouseEnter={e => { if (!on) e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={e => { if (!on) e.currentTarget.style.color = 'var(--text-muted)'; }}
        style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: sm ? 'var(--control-line-sm,14px)' : 'var(--control-line,16px)', letterSpacing: 'var(--tracking-meta,0.143px)', padding: sm ? '6px 8px 2px' : '9px 12px 5px', border: 0, borderRadius: sm ? 2 : 4, background: on ? 'var(--text-primary)' : 'transparent', color: on ? 'var(--surface-paper)' : 'var(--text-muted)', cursor: on ? 'default' : 'pointer', whiteSpace: 'nowrap', transition: 'background-color 120ms linear, color 120ms linear', appearance: 'none', minWidth: 0 }}>{l}</button>; })}
  </div>;
}
