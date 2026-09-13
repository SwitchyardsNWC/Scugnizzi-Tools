import React from 'react';
import { Freshness } from '../status/Freshness.jsx';
/* Paper surface on the sunken page. Square, one soft hairline, no shadow. Title row is 13px muted; children carry the content.
   onClick makes the whole card a drill target — border deepens on hover, an arrow appears in the corner. */
export function Card({ title, kicker, meta, actions, footer, updated, fresh = 'live', onClick, padding = 16, children, style, ...rest }) {
  const act = !!onClick;
  const foot = updated != null ? <><Freshness state={fresh} when={updated} style={{ fontSize: 12, letterSpacing: '0.132px' }} />{footer}</> : footer;
  const [hov, setHov] = React.useState(false);
  const Tag = act ? 'button' : 'section';
  return <Tag type={act ? 'button' : undefined} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
    style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', color: 'var(--text-primary)', background: 'var(--surface-card)', border: '1px solid ' + (act && hov ? 'var(--text-primary)' : 'var(--border-card)'), borderRadius: 0, boxShadow: 'none', display: 'flex', flexDirection: 'column', minWidth: 0, boxSizing: 'border-box', textAlign: 'left', width: '100%', padding: 0, margin: 0, cursor: act ? 'pointer' : 'default', transition: 'border-color 120ms linear', appearance: 'none', ...style }} {...rest}>
    {title || actions || kicker ? <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: padding + 'px ' + padding + 'px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {kicker ? <span style={{ fontSize: 11, lineHeight: 1.2, letterSpacing: '0.3px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{kicker}</span> : null}
        {title ? <span style={{ fontSize: 13, lineHeight: 1.25, letterSpacing: '0.143px', color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>{meta ? <span style={{ color: 'var(--text-muted)', flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' }}>{meta}</span> : null}</span> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>{actions}{act ? <span aria-hidden style={{ color: hov ? 'var(--text-primary)' : 'var(--text-faint)', fontSize: 14, lineHeight: 1, transition: 'color 120ms linear' }}>→</span> : null}</div>
    </header> : null}
    <div style={{ padding: padding, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    {foot ? <footer style={{ padding: '8px ' + padding + 'px', borderTop: '1px solid var(--border-muted)', fontSize: 13, letterSpacing: '0.143px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{foot}</footer> : null}
  </Tag>;
}
/* Responsive card grid: drops columns instead of squeezing. */
export function CardGrid({ min = 240, columns, gap = 12, children, style, ...rest }) {
  const cols = columns ? 'repeat(' + columns + ',minmax(0,1fr))' : 'repeat(auto-fit,minmax(min(' + (typeof min === 'number' ? min + 'px' : min) + ',100%),1fr))';
  return <div style={{ display: 'grid', gridTemplateColumns: cols, gap, alignItems: 'stretch', ...style }} {...rest}>{children}</div>;
}
