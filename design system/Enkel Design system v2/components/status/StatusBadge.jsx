import React from 'react';
export const STATUS_META = {
  done: { label: 'Done', ink: 'var(--status-done)', soft: 'var(--status-done-soft)' },
  ontrack: { label: 'On track', ink: 'var(--status-done)', soft: 'var(--status-done-soft)' },
  progress: { label: 'In progress', ink: 'var(--status-progress)', soft: 'var(--status-progress-soft)' },
  risk: { label: 'At risk', ink: 'var(--status-risk)', soft: 'var(--status-risk-soft)' },
  blocked: { label: 'Blocked', ink: 'var(--status-blocked)', soft: 'var(--status-blocked-soft)' },
  notstarted: { label: 'Not started', ink: 'var(--status-notstarted)', soft: 'var(--status-notstarted-soft)' },
  build: { label: 'In-house build', ink: 'var(--source-build)', soft: 'var(--source-build-soft)' },
};
export function StatusBadge({ status = 'notstarted', size = 'badge', label, style, children, ...rest }) {
  const m = STATUS_META[status] || STATUS_META.notstarted; const text = label || m.label;
  const box = { fontFamily: 'var(--font-helveticaneue)', fontSize: 13, lineHeight: 'var(--label-line,14px)', letterSpacing: '0.143px', display: 'inline-flex', alignItems: 'center', gap: 4, width: 'max-content', maxWidth: '100%', boxSizing: 'border-box', verticalAlign: 'middle' };
  const txt = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const dot = { flex: '0 0 auto', width: 5, height: 5, background: m.ink };
  if (size === 'dot') return <span title={text} aria-label={text} style={{ display: 'inline-block', flex: '0 0 auto', width: 10, height: 10, background: m.ink, borderRadius: 0, verticalAlign: 'middle', ...style }} {...rest} />;
  if (size === 'bar') return <span title={text} aria-label={text} style={{ display: 'block', height: 4, width: '100%', background: m.ink, ...style }} {...rest} />;
  if (size === 'chip') return <span style={{ ...box, minHeight: 22, padding: '5px 8px 1px', borderRadius: 'var(--radius-tags,4px)', background: m.soft, color: m.ink, ...style }} {...rest}><span style={dot} /><span style={txt}>{children || text}</span></span>;
  if (size === 'card') return <div style={{ borderLeft: '2px solid ' + m.ink, paddingLeft: 10, minWidth: 0, ...style }} {...rest}>{children}</div>;
  return <span style={{ ...box, minHeight: 'var(--label-height,22px)', padding: '5px 8px 1px', borderRadius: 'var(--radius-tags,4px)', border: '1px solid ' + m.ink, color: m.ink, background: m.soft, ...style }} {...rest}><span style={dot} /><span style={txt}>{text}</span></span>;
}
