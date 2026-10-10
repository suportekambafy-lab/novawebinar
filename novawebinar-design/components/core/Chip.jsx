import React from 'react';
import { Icon } from './Icon.jsx';

const CHIP_VARIANTS = {
  light: { bg: 'var(--gray-100)', fg: 'var(--text-primary)', cap: 'var(--text-secondary)' },
  white: { bg: 'var(--white)', fg: 'var(--text-primary)', cap: 'var(--text-secondary)' },
  chip: { bg: 'var(--gray-150)', fg: 'var(--text-primary)', cap: 'var(--text-secondary)' },
  dark: { bg: 'var(--navy)', fg: 'var(--white)', cap: 'var(--gray-400)' },
};

export function Chip({ label, caption, icon, knob = false, variant = 'light', size = 'md', onClick, style }) {
  const v = CHIP_VARIANTS[variant] || CHIP_VARIANTS.light;
  const h = size === 'sm' ? 30 : caption ? 46 : 40;
  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10, height: h,
        padding: knob ? '0 5px 0 ' + (icon ? 6 : 16) + 'px' : '0 ' + (size === 'sm' ? 12 : 16) + 'px 0 ' + (icon ? 6 : size === 'sm' ? 12 : 16) + 'px',
        borderRadius: 'var(--radius-pill)', background: v.bg, color: v.fg,
        fontFamily: 'var(--font-sans)', fontSize: size === 'sm' ? 12 : 13, whiteSpace: 'nowrap', letterSpacing: '-0.01em',
        cursor: onClick ? 'pointer' : 'default', ...style,
      }}
    >
      {icon && (
        <span style={{ width: h - 12, height: h - 12, borderRadius: '50%', background: variant === 'dark' ? 'var(--overlay-on-inverse)' : 'var(--gray-150)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={15} />
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        {caption && <span style={{ fontSize: 10, color: v.cap }}>{caption}</span>}
        <span>{label}</span>
      </span>
      {knob && <span style={{ width: h - 10, height: h - 10, borderRadius: '50%', background: 'var(--white)', boxShadow: 'var(--shadow-soft)', marginLeft: 6 }} />}
    </div>
  );
}
