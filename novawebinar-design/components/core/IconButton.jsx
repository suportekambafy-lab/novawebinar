import React from 'react';
import { Icon } from './Icon.jsx';

const IB_VARIANTS = {
  dark: { bg: 'var(--navy)', hover: 'var(--hover-dark)', fg: 'var(--white)' },
  light: { bg: 'var(--gray-150)', hover: 'var(--gray-250)', fg: 'var(--text-primary)' },
  white: { bg: 'var(--white)', hover: 'var(--gray-100)', fg: 'var(--text-primary)' },
  accent: { bg: 'var(--button-primary)', hover: 'var(--button-primary-hover)', fg: 'var(--white)' },
  ghost: { bg: 'transparent', hover: 'var(--hover-ghost)', fg: 'var(--text-primary)' },
};

export function IconButton({ icon, variant = 'light', size = 40, label, active = false, disabled = false, onClick, style }) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const v = IB_VARIANTS[active ? 'accent' : variant] || IB_VARIANTS.light;
  return (
    <button
      type="button"
      aria-label={label || icon}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        width: size, height: size, flex: 'none', borderRadius: '50%', border: 0, padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: hover && !disabled ? v.hover : v.bg, color: v.fg,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
        transform: press && !disabled ? 'scale(.94)' : 'none',
        transition: 'background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard)',
        ...style,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.42)} />
    </button>
  );
}
