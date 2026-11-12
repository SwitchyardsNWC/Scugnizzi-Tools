import React from 'react';
export function Button({ variant = 'filled', size = 'md', count, wrap = false, children, disabled, style, ...rest }) {
  const sm = size === 'sm';
  // Height comes from padding, never centring: border + padTop / line / padBottom + border.
  //   md 36 = 1 + 11 / 16 / 7 + 1 at 14px, 16px each side.   sm 28 = 1 + 8 / 14 / 4 + 1 at 13px, 12px each side.
  // The top pad carries 4px more than the bottom (--optical-nudge). Measured HelveticaNeue at 14px: cap 10.0, ascent 10.3,
  // descent 3.7, so the cap block sits 1.86px above the line-box centre and takes 2 x that in extra top padding.
  // No minHeight: if the padding or line-height is overridden, the height should visibly break, not hide behind a floor.
  const base = { fontFamily: 'var(--font-helveticaneue)', fontWeight: 400, fontSize: sm ? 13 : 14, lineHeight: sm ? 'var(--control-line-sm,14px)' : 'var(--control-line,16px)', letterSpacing: sm ? 'var(--tracking-meta,0.143px)' : 'var(--tracking-body,0.154px)', borderRadius: sm ? 'var(--radius-buttons-sm,4px)' : 'var(--radius-buttons,6px)', padding: sm ? '8px 12px 4px' : '11px 16px 7px', boxSizing: 'border-box', cursor: disabled ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'left', maxWidth: '100%', minWidth: 0, transition: 'background-color 120ms linear, color 120ms linear, border-color 120ms linear', boxShadow: 'none', appearance: 'none' };
  const v = {
    filled: { background: 'var(--action-primary)', color: 'var(--action-primary-text)', border: '1px solid var(--action-primary)' },
    outline: { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-control)' }, // 3:1 on paper and card: reads as a control without ink
    ghost: { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent', padding: sm ? '8px 0 4px' : '11px 0 7px' },
  }[variant];
  const d = disabled ? (variant === 'filled' ? { background: 'var(--action-disabled-surface)', color: 'var(--action-disabled-text)', border: '1px solid var(--action-disabled-surface)' } : { color: 'var(--action-disabled-text)', border: variant === 'outline' ? '1px solid var(--border-muted)' : '1px solid transparent' }) : {};
  const rest_ = { ...v, ...d };
  // Children live in one text run — never as sibling flex items, or the 8px gap opens up inside the label.
  // Note: whiteSpace and textWrap are never emitted together — textWrap resets text-wrap-mode and would undo nowrap.
  const label = wrap ? { minWidth: 0, textWrap: 'pretty' } : { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const title = rest.title != null ? rest.title : (typeof children === 'string' && !wrap ? children : undefined);
  return <button type="button" disabled={disabled} aria-disabled={disabled || undefined} title={title}
    onMouseEnter={e => { if (disabled) return; const s = e.currentTarget.style; if (variant === 'filled') { s.background = 'var(--action-primary-hover)'; s.borderColor = 'var(--action-primary-hover)'; } else if (variant === 'ghost') s.color = 'var(--text-primary)'; else { s.background = 'var(--surface-row-hover)'; s.borderColor = 'var(--text-muted)'; } }}
    onMouseLeave={e => { const s = e.currentTarget.style; s.background = rest_.background; s.color = rest_.color; s.border = rest_.border; }}
    style={{ ...base, ...rest_, ...style }} {...rest}><span style={label}>{children}</span>{count != null ? <span style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums', color: variant === 'filled' ? 'inherit' : 'var(--text-muted)' }}>{count}</span> : null}</button>;
}
