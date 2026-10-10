import React from 'react';
import { Icon } from './Icon.jsx';

const BTN_SIZES = {
  sm: { height: 32, padding: '0 14px', fontSize: 12, gap: 6, icon: 14 },
  md: { height: 40, padding: '0 18px', fontSize: 14, gap: 8, icon: 16 },
  lg: { height: 48, padding: '0 22px', fontSize: 15, gap: 8, icon: 18 },
};
const BTN_VARIANTS = {
  dark: { bg: 'var(--navy)', hover: 'var(--hover-dark)', fg: 'var(--white)' },
  light: { bg: 'var(--gray-100)', hover: 'var(--gray-150)', fg: 'var(--text-primary)' },
  white: { bg: 'var(--white)', hover: 'var(--gray-50)', fg: 'var(--text-primary)' },
  accent: { bg: 'var(--button-primary)', hover: 'var(--button-primary-hover)', fg: 'var(--white)' },
  ghost: { bg: 'transparent', hover: 'var(--hover-ghost)', fg: 'var(--text-primary)' },
};

export function Button({ children, variant = 'light', size = 'md', icon, iconRight, disabled = false, fullWidth = false, onClick, type = 'button', style }) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const s = BTN_SIZES[size] || BTN_SIZES.md;
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.light;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: fullWidth ? 'flex' : 'inline-flex', width: fullWidth ? '100%' : undefined,
        alignItems: 'center', justifyContent: 'center', gap: s.gap,
        height: s.height, padding: s.padding, borderRadius: 'var(--radius-pill)', border: 0,
        background: hover && !disabled ? v.hover : v.bg, color: v.fg,
        fontFamily: 'var(--font-sans)', fontSize: s.fontSize, fontWeight: 400, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
        transform: press && !disabled ? 'scale(.97)' : 'none',
        transition: 'background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard)',
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={s.icon} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.icon} />}
    </button>
  );
}
