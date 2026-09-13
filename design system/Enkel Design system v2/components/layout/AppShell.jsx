import React from 'react';
/* Shell = rail | [header / scrolling main] with an optional right drawer laid over the main.
   The shell owns the viewport height so a static header and sticky table headers work inside `main`;
   pass style={{height:'auto'}} to fall back to page scroll. */
export function AppShell({ tier = 'auto', rail, top, tabs, header, drawer, drawerWidth = 440, drawerTitle, onDrawerClose, width = 'page', ground = 'paper', children, style, ...rest }) {
  const bg = ground === 'sunken' ? 'var(--surface-sunken)' : 'var(--surface-paper)';
  const [w, setW] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  React.useEffect(() => { if (tier !== 'auto') return; const f = () => setW(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, [tier]);
  React.useEffect(() => { if (!drawer || !onDrawerClose) return; const f = e => { if (e.key === 'Escape') onDrawerClose(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [drawer, onDrawerClose]);
  const t = tier !== 'auto' ? tier : (w < 768 ? 'phone' : w < 1024 ? 'tablet' : 'desktop');
  const open = drawer != null && drawer !== false;
  // The scroll region publishes --shell-sticky-top (= measured header height) so DataTable stickyHeader can pin just under the static header.
  const hdrRef = React.useRef(null); const scrollRef = React.useRef(null);
  React.useEffect(() => { const el = hdrRef.current, sc = scrollRef.current; if (!sc) return; const set = () => sc.style.setProperty('--shell-sticky-top', (el ? el.offsetHeight : 0) + 'px'); set(); if (!el || typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(set); ro.observe(el); return () => ro.disconnect(); }, [header, t]);
  const hdr = header ? <div ref={hdrRef} data-shell-header style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, width: '100%', boxSizing: 'border-box', background: 'var(--surface-paper)', borderBottom: '1px solid var(--border-hairline)' }}>{header}</div> : null;
  if (t === 'phone') return <div data-tier="phone" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-paper)', position: 'relative', ...style }} {...rest}>
    {top}
    <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', background: bg }}>{hdr}<main style={{ flex: 1, background: bg, padding: 'var(--gutter-phone,16px)', fontSize: 'var(--text-body-mobile,16px)' }}>{children}</main></div>
    {tabs}
    {open ? <div role="presentation" onClick={onDrawerClose} style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'var(--surface-scrim,rgba(0,0,0,.4))', display: 'flex', alignItems: 'flex-end' }}>
      <section role="dialog" aria-modal="true" aria-label={typeof drawerTitle === 'string' ? drawerTitle : undefined} onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: 'var(--sheet-max-height,85vh)', display: 'flex', flexDirection: 'column', background: 'var(--surface-paper)', borderTop: '1px solid var(--border-hairline)', paddingBottom: 'var(--safe-bottom,0px)', boxSizing: 'border-box' }}>
        {React.isValidElement(drawer) ? React.cloneElement(drawer, { style: { width: '100%', borderLeft: 0, minHeight: 0, flex: 1, ...drawer.props.style } }) : drawer}
      </section>
    </div> : null}
  </div>;
  const tablet = t === 'tablet';
  const railW = tablet ? 'var(--sidebar-width-tablet,160px)' : 'var(--sidebar-width,200px)';
  const gutter = width === 'full' || tablet ? 'var(--gutter-tablet,24px)' : 'var(--gutter-desktop,32px)';
  const dw = typeof drawerWidth === 'number' ? drawerWidth + 'px' : drawerWidth;
  return <div data-tier={t} style={{ height: '100vh', minHeight: 0, display: 'grid', gridTemplateColumns: `${railW} minmax(0,1fr)`, background: 'var(--surface-paper)', position: 'relative', ...style }} {...rest}>
    <aside style={{ borderRight: '1px solid var(--border-hairline)', padding: 'var(--spacing-24,24px) var(--spacing-16,16px)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-24,24px)', minHeight: 0, overflowY: 'auto', boxSizing: 'border-box' }}>{rail}</aside>
    <div ref={scrollRef} style={{ minWidth: 0, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', position: 'relative', background: bg }}>
      {hdr}
      <main style={{ flex: 1, background: bg, padding: `var(--spacing-24,24px) ${gutter} var(--spacing-32,32px)`, maxWidth: width === 'full' ? 'none' : 'var(--page-max-width,1440px)', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>{children}</main>
    </div>
    {open ? <div role="dialog" aria-label={typeof drawerTitle === 'string' ? drawerTitle : undefined} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 10, width: dw, maxWidth: `calc(100% - ${railW})`, display: 'flex', flexDirection: 'column', background: 'var(--surface-paper)', borderLeft: '1px solid var(--border-hairline)', boxSizing: 'border-box' }}>
      {React.isValidElement(drawer) ? React.cloneElement(drawer, { style: { width: '100%', borderLeft: 0, minHeight: 0, flex: 1, ...drawer.props.style } }) : drawer}
    </div> : null}
  </div>;
}
/* Static header row for the shell: title/tabs left, actions right. Sits inside AppShell's `header` slot. */
export function ShellHeader({ title, kicker, actions, children, style, ...rest }) {
  return <div style={{ padding: '10px var(--gutter-tablet,42px)', minHeight: 'var(--shell-header-height,56px)', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, fontFamily: 'var(--font-helveticaneue)', ...style }} {...rest}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>{kicker ? <span style={{ fontSize: 13, lineHeight: '14px', letterSpacing: '0.3px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{kicker}</span> : null}<span style={{ fontSize: 18, lineHeight: 1.15, letterSpacing: '0.198px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span></div>
      {children}
    </div>
    {actions ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>{actions}</div> : null}
  </div>;
}
