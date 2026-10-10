import React from 'react';
import { Icon } from '../core/Icon.jsx';

function NavPill({ item, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 18px 0 14px', border: 0,
        borderRadius: 'var(--radius-pill)', cursor: 'pointer',
        background: active ? 'var(--button-primary)' : hover ? 'var(--gray-150)' : 'var(--gray-100)',
        color: active ? 'var(--white)' : 'var(--text-primary)',
        fontFamily: 'var(--font-sans)', fontSize: 13, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
        transition: 'background var(--duration-fast) var(--ease-standard), color var(--duration-fast)',
      }}
    >
      {item.icon && <Icon name={item.icon} size={15} />}
      {item.label}
    </button>
  );
}

export function NavTabs({ items = [], value, onChange, style }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 6, ...style }}>
      {items.map(it => (
        <NavPill key={it.id} item={it} active={it.id === value} onClick={() => onChange && onChange(it.id)} />
      ))}
    </nav>
  );
}
