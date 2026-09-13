import React from 'react';
/* Hairline-row data table. Rows never zebra; numbers set in mono, right-aligned; a row can open in place (expandedKey + renderExpanded). */
export function DataTable({ columns = [], rows = [], rowKey = 'id', onRowClick, selectedKey, expandedKey, renderExpanded, emptyText = 'No results.', stickyHeader = false, pinFirst = false, density = 'balanced', maxHeight, style, ...rest }) {
  const py = density === 'compact' ? 6 : density === 'airy' ? 12 : 9;
  const cell = { padding: py + 'px 16px ' + py + 'px 0', fontFamily: 'var(--font-helveticaneue)', fontSize: 14, lineHeight: 1.3, letterSpacing: '0.154px', textAlign: 'left', verticalAlign: 'middle' };
  // The row marker hangs in a 12px gutter left of the text, so the sheet is pulled out by the same amount and column one still starts on the container edge.
  const GUT = 12;
  const clip = c => c.nowrap ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: c.width || 240 } : null;
  const num = c => c.numeric ? { fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: 0, textAlign: 'right', whiteSpace: 'nowrap' } : null;
  const pin = i => pinFirst && i === 0 ? { position: 'sticky', left: 0, zIndex: 1, background: 'inherit', boxShadow: 'inset -1px 0 0 var(--border-muted)', paddingRight: 16 } : null;
  const own = maxHeight != null;
  // Phones: wide tables scroll sideways inside the card, header stops sticking (sticky + overflow can't coexist), first column stays pinned so the row label survives the scroll.
  const [phone, setPhone] = React.useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width:767px)').matches);
  React.useEffect(() => { const mq = window.matchMedia('(max-width:767px)'); const f = e => setPhone(e.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  if (phone) { stickyHeader = false; pinFirst = true; }
  const head = stickyHeader ? { position: 'sticky', top: own ? 0 : 'var(--shell-sticky-top,0px)', zIndex: 2, background: 'var(--surface-paper)', boxShadow: 'inset 0 -1px 0 var(--border-card)' } : null;
  const isOpen = k => expandedKey != null && (Array.isArray(expandedKey) ? expandedKey.includes(k) : expandedKey === k);
  return <div style={{ maxWidth: `calc(100% + ${GUT}px)`, marginLeft: -GUT, overflow: stickyHeader && !own ? 'visible' : 'auto', maxHeight }}><table style={{ width: '100%', minWidth: 'min-content', borderCollapse: 'separate', borderSpacing: 0, ...style }} {...rest}>
    <thead><tr style={{ background: 'var(--surface-paper)' }}>{columns.map((c, i) => <th key={c.key} style={{ ...cell, ...head, fontWeight: 400, fontSize: 12, lineHeight: 1.25, letterSpacing: '0.132px', color: 'var(--text-muted)', width: c.width, minWidth: c.nowrap ? undefined : c.width, textAlign: c.numeric ? 'right' : c.align || 'left', whiteSpace: 'nowrap', paddingLeft: i === 0 ? GUT : 0, paddingTop: 6, paddingBottom: 6, borderBottom: stickyHeader ? 0 : '1px solid var(--border-card)', ...(pin(i) ? { ...pin(i), zIndex: 3, background: 'var(--surface-paper)' } : null) }}>{c.label}</th>)}</tr></thead>
    <tbody>
      {rows.length === 0 ? <tr><td colSpan={columns.length} style={{ ...cell, color: 'var(--text-muted)', padding: '16px 0 16px ' + GUT + 'px' }}>{emptyText}</td></tr> : null}
      {rows.map(r => {
        const k = r[rowKey]; const sel = k === selectedKey; const open = isOpen(k); const act = !!onRowClick;
        const base = { boxShadow: sel || open ? 'inset 2px 0 0 var(--text-primary)' : 'none', cursor: act ? 'pointer' : 'default', background: sel ? 'var(--surface-selected)' : open ? 'var(--surface-row-hover)' : 'var(--surface-paper)', transition: 'background 120ms linear' };
        return <React.Fragment key={k}><tr onClick={act ? () => onRowClick(r) : undefined}
          onMouseEnter={e => { if (act && !sel) { e.currentTarget.style.background = 'var(--surface-row-hover)'; if (!open) e.currentTarget.style.boxShadow = 'inset 2px 0 0 var(--border-card)'; } }} onMouseLeave={e => { e.currentTarget.style.background = base.background; e.currentTarget.style.boxShadow = base.boxShadow; }}
          aria-selected={sel || undefined} aria-expanded={renderExpanded ? open : undefined} style={base}>
          {columns.map((c, i) => <td key={c.key} style={{ ...cell, borderBottom: open ? 0 : '1px solid var(--border-muted)', color: c.muted ? 'var(--text-muted)' : 'var(--text-primary)', textAlign: c.align || 'left', fontVariantNumeric: 'tabular-nums', paddingLeft: i === 0 ? GUT : 0, ...clip(c), ...num(c), ...pin(i) }}>{c.render ? c.render(r) : r[c.key]}</td>)}
        </tr>
        {open && renderExpanded ? <tr><td colSpan={columns.length} style={{ padding: '0 0 16px ' + GUT + 'px', borderBottom: '1px solid var(--border-muted)', background: 'var(--surface-row-hover)', boxShadow: 'inset 2px 0 0 var(--text-primary)' }}>{renderExpanded(r)}</td></tr> : null}
        </React.Fragment>;
      })}
    </tbody>
  </table></div>;
}
