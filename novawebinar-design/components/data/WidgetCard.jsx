import React from 'react';
import { IconButton } from '../core/IconButton.jsx';

const CARD_VARIANTS = {
  default: { bg: 'var(--surface-card)', fg: 'var(--text-primary)', sub: 'var(--text-secondary)', btn: 'light' },
  white: { bg: 'var(--white)', fg: 'var(--text-primary)', sub: 'var(--text-secondary)', btn: 'light' },
  inverse: { bg: 'var(--surface-inverse-soft)', fg: 'var(--white)', sub: 'var(--gray-400)', btn: 'white' },
  glass: { bg: 'var(--surface-glass)', fg: 'var(--text-primary)', sub: 'var(--text-secondary)', btn: 'white' },
};

export function WidgetCard({ title, subtitle, actions = [], headerRight, variant = 'default', padding = 24, children, style }) {
  const v = CARD_VARIANTS[variant] || CARD_VARIANTS.default;
  return (
    <section
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0,
        background: v.bg, color: v.fg, borderRadius: 'var(--radius-card)', padding,
        backdropFilter: variant === 'glass' ? 'blur(var(--blur-glass))' : undefined,
        WebkitBackdropFilter: variant === 'glass' ? 'blur(var(--blur-glass))' : undefined,
        fontFamily: 'var(--font-sans)', ...style,
      }}
    >
      {(title || actions.length > 0 || headerRight) && (
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && <h3 style={{ margin: 0, fontSize: 'var(--text-subtitle)', fontWeight: 400, letterSpacing: 'var(--tracking-heading)', lineHeight: 1.2, textWrap: 'pretty' }}>{title}</h3>}
            {subtitle && <div style={{ marginTop: 4, fontSize: 12, color: v.sub }}>{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flex: 'none', alignItems: 'center' }}>
            {headerRight}
            {actions.map((a, i) => (
              <IconButton key={i} icon={a.icon} label={a.label} variant={a.variant || v.btn} size={a.size || 36} onClick={a.onClick} />
            ))}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}
