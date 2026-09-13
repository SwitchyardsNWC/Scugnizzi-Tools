import React from 'react';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function relativeDays(d, now = new Date()) {
  const a = new Date(d); a.setHours(0,0,0,0); const b = new Date(now); b.setHours(0,0,0,0);
  const n = Math.round((a - b) / 86400000);
  if (n === 0) return 'today'; if (n === 1) return 'tomorrow'; if (n === -1) return 'yesterday';
  if (n > 0) return n < 14 ? 'in ' + n + ' days' : n < 60 ? 'in ' + Math.round(n/7) + ' weeks' : 'in ' + Math.round(n/30) + ' months';
  const m = -n; return m < 14 ? m + ' days ago' : m < 60 ? Math.round(m/7) + ' weeks ago' : Math.round(m/30) + ' months ago';
}
export function DateStamp({ date, now, clock = 'project', showRelative = true, style, ...rest }) {
  const d = new Date(date); const rel = relativeDays(d, now ? new Date(now) : undefined); const late = d < (now ? new Date(now) : new Date()) && !/today/.test(rel);
  return <span style={{ fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: 1.3, letterSpacing: '0.143px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', display: 'inline-flex', gap: 4, alignItems: 'baseline', ...style }} {...rest}>
    {clock === 'phase' ? <span aria-hidden style={{ width: 5, height: 5, border: '1px solid var(--text-secondary)', alignSelf: 'center' }} /> : <span aria-hidden style={{ width: 5, height: 5, background: 'var(--text-primary)', alignSelf: 'center' }} />}
    <span style={{ color: 'var(--text-primary)' }}>{MONTHS[d.getMonth()]} {d.getDate()}</span>
    {showRelative ? <span style={{ color: late ? 'var(--status-blocked)' : 'var(--text-muted)' }}>· {rel}</span> : null}
  </span>;
}
