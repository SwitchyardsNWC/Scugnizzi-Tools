import React from 'react';
/* Hover peek: after 250ms the summary appears beside the trigger; click commits (the trigger's own onClick). Escape / mouse-out closes. Never the only route to the detail. */
export function Peek({ content, children, delay = 250, side = 'bottom', width = 280, style, ...rest }) {
  const [open, setOpen] = React.useState(false); const t = React.useRef(null);
  const show = () => { clearTimeout(t.current); t.current = setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(t.current); setOpen(false); };
  React.useEffect(() => () => clearTimeout(t.current), []);
  React.useEffect(() => { if (!open) return; const f = e => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [open]);
  const pos = side === 'top' ? { bottom: '100%', left: 0, marginBottom: 6 } : side === 'right' ? { left: '100%', top: 0, marginLeft: 6 } : { top: '100%', left: 0, marginTop: 6 };
  return <span onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} style={{ position: 'relative', display: 'inline-flex', minWidth: 0, maxWidth: '100%', ...style }} {...rest}>
    {children}
    {open ? <div role="tooltip" style={{ position: 'absolute', zIndex: 20, width, maxWidth: '80vw', ...pos, background: 'var(--surface-card)', border: '1px solid var(--text-primary)', padding: 12, fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: 1.3, letterSpacing: '0.143px', color: 'var(--text-primary)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', cursor: 'default' }}>{content}</div> : null}
  </span>;
}
