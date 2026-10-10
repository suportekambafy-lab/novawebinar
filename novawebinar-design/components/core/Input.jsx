import React from 'react';
import { Icon } from './Icon.jsx';

export function Input({ value, defaultValue, placeholder = 'Search', icon = 'search', variant = 'light', onChange, style }) {
  const [focus, setFocus] = React.useState(false);
  const bg = variant === 'white' ? 'var(--white)' : 'var(--gray-100)';
  return (
    <label
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px 0 14px', minWidth: 220,
        borderRadius: 'var(--radius-pill)', background: bg, color: 'var(--text-primary)',
        boxShadow: focus ? '0 0 0 1.5px var(--accent), var(--focus-ring)' : 'none', transition: 'box-shadow var(--duration-fast) var(--ease-standard)', ...style,
      }}
    >
      {icon && <Icon name={icon} size={16} color="var(--text-secondary)" />}
      <input
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        onChange={onChange}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'inherit', letterSpacing: '-0.01em' }}
      />
    </label>
  );
}
