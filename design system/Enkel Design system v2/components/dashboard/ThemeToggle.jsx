import React from 'react';
const KEY = 'enkel-theme';
export function GetTheme() { try { return localStorage.getItem(KEY) || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { return 'light'; } }
export function ApplyTheme(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem(KEY, t); } catch (e) {} }
/* Two-word toggle: "Light / Dark". Sets data-theme on <html> and remembers it. */
export function ThemeToggle({ size = 'sm', style, ...rest }) {
  const [t, setT] = React.useState(() => (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')) || GetTheme());
  React.useEffect(() => { document.documentElement.setAttribute('data-theme', t); }, []);
  const set = v => { setT(v); ApplyTheme(v); };
  const sm = size === 'sm';
  return <div role="radiogroup" aria-label="Colour mode" style={{ display: 'inline-flex', border: '1px solid var(--border-card)', borderRadius: sm ? 4 : 6, padding: 2, gap: 2, background: 'var(--surface-card)', boxSizing: 'border-box', minHeight: sm ? 28 : 36, ...style }} {...rest}>
    {['light', 'dark'].map(v => { const on = v === t; return <button key={v} type="button" role="radio" aria-checked={on} onClick={() => set(v)} onMouseEnter={e => { if (!on) e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={e => { if (!on) e.currentTarget.style.color = 'var(--text-muted)'; }}
      style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: sm ? '14px' : '16px', letterSpacing: '0.143px', padding: sm ? '5px 8px 1px' : '8px 12px 4px', border: 0, borderRadius: sm ? 2 : 4, background: on ? 'var(--text-primary)' : 'transparent', color: on ? 'var(--surface-paper)' : 'var(--text-muted)', cursor: on ? 'default' : 'pointer', transition: 'background-color 120ms linear, color 120ms linear', appearance: 'none', textTransform: 'capitalize' }}>{v}</button>; })}
  </div>;
}
