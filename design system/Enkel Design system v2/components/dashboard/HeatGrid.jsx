import React from 'react';
import { Peek } from './Peek.jsx';
/* Cell map: one square per thing (a bin, a day, a seat), filled by `tone` (data palette index or CSS colour) or by `value` against `max` as opacity of one tone.
   Hover peeks the cell's label/meta; click drills. Square cells, 2px gutters, no rounding — reads as a floor plan, not a chart. */
export function HeatGrid({ cells = [], columns = 12, size = 22, gap = 2, tone = 1, max, onSelect, selectedKey, legend, peek = true, style, ...rest }) {
  const top = max != null ? max : Math.max(1, ...cells.map(c => c.value || 0));
  const act = !!onSelect;
  const ink = t => typeof t === 'number' ? 'var(--data-' + t + ')' : t;
  return <div style={{ fontFamily: 'var(--font-helveticaneue)', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, ...style }} {...rest}>
    <div role={act ? 'listbox' : 'list'} style={{ display: 'grid', gridTemplateColumns: 'repeat(' + columns + ',minmax(0,1fr))', gap, maxWidth: columns * (size + gap) }}>
      {cells.map(c => {
        const k = c.key != null ? c.key : c.label; const sel = k === selectedKey;
        const bg = c.tone != null ? ink(c.tone) : c.value == null || c.value === 0 ? 'var(--data-track)' : ink(tone);
        const op = c.tone != null || c.value == null || c.value === 0 ? 1 : 0.35 + 0.65 * Math.min(1, c.value / top);
        const sq = <span aria-hidden style={{ display: 'block', aspectRatio: '1', background: bg, opacity: op, outline: sel ? '2px solid var(--text-primary)' : 'none', outlineOffset: 1 }} />;
        const Tag = act ? 'button' : 'div';
        const el = <Tag key={k} type={act ? 'button' : undefined} role={act ? 'option' : 'listitem'} aria-selected={act ? sel : undefined} aria-label={c.label + (c.meta ? ' · ' + c.meta : '')} onClick={act ? () => onSelect(c) : undefined}
          style={{ display: 'block', padding: 0, margin: 0, border: 0, background: 'none', cursor: act ? 'pointer' : 'default', appearance: 'none', minWidth: 0, width: '100%' }}>{sq}</Tag>;
        return peek ? <Peek key={k} delay={150} width={200} content={<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{c.label}</span>{c.meta ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.meta}</span> : null}</div>}>{el}</Peek> : el;
      })}
    </div>
    {legend ? <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, lineHeight: 1.25, letterSpacing: '0.132px', color: 'var(--text-muted)' }}>{legend.map(l => <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 8, height: 8, background: ink(l.tone) }} />{l.label}</span>)}</div> : null}
  </div>;
}
