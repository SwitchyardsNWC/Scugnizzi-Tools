import React from 'react';
import { Num } from './Delta.jsx';
/* Ranked horizontal bars: label left, bar, mono value right. One colour unless a row sets its own tone. Rows drill with onSelect. */
export function BarList({ items = [], max, tone = 1, format, onSelect, selectedKey, showValue = true, barHeight = 6, style, ...rest }) {
  const top = max != null ? max : Math.max(1, ...items.map(i => i.value || 0));
  const fmt = format || (v => typeof v === 'number' ? v.toLocaleString() : v);
  return <div role={onSelect ? 'listbox' : 'list'} style={{ fontFamily: 'var(--font-helveticaneue)', display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0, ...style }} {...rest}>
    {items.map((it, i) => {
      const k = it.key != null ? it.key : it.label; const sel = k === selectedKey; const act = !!onSelect;
      const ink = it.tone != null ? (typeof it.tone === 'number' ? 'var(--data-' + it.tone + ')' : it.tone) : (typeof tone === 'number' ? 'var(--data-' + tone + ')' : tone);
      const Tag = act ? 'button' : 'div';
      return <Tag key={k} type={act ? 'button' : undefined} role={act ? 'option' : 'listitem'} aria-selected={act ? sel : undefined} onClick={act ? () => onSelect(it) : undefined}
        onMouseEnter={act ? e => { e.currentTarget.style.background = 'var(--surface-row-hover)'; } : undefined} onMouseLeave={act ? e => { e.currentTarget.style.background = sel ? 'var(--surface-row-hover)' : 'transparent'; } : undefined}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gridTemplateRows: 'auto auto', columnGap: 12, rowGap: 4, padding: '6px 0', margin: 0, border: 0, borderBottom: i < items.length - 1 ? '1px solid var(--border-muted)' : 0, background: sel ? 'var(--surface-row-hover)' : 'transparent', color: 'var(--text-primary)', textAlign: 'left', width: '100%', boxSizing: 'border-box', cursor: act ? 'pointer' : 'default', appearance: 'none', transition: 'background 120ms linear', boxShadow: sel ? 'inset 2px 0 0 var(--text-primary)' : 'none', paddingLeft: sel ? 8 : 0 }}>
        <span style={{ fontSize: 13, lineHeight: 1.25, letterSpacing: '0.143px', color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', gap: 8 }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>{it.meta ? <span style={{ color: 'var(--text-muted)' }}>{it.meta}</span> : null}</span>
        {showValue ? <Num size={13} style={{ lineHeight: 1.25, color: 'var(--text-primary)' }}>{fmt(it.value)}</Num> : <span />}
        <span style={{ gridColumn: '1 / -1', height: barHeight, background: 'var(--data-track)', position: 'relative' }}><span style={{ position: 'absolute', inset: '0 auto 0 0', width: Math.max(0, Math.min(100, (it.value || 0) / top * 100)) + '%', background: ink, transition: 'width 120ms linear' }} /></span>
      </Tag>;
    })}
  </div>;
}
