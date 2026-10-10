import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function BottomNav({ items = [], value, onChange, style }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'stretch', background: 'var(--white)', borderTop: '1px solid var(--border-hairline)', padding: '8px 6px 10px', ...style }}>
      {items.map(it => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange && onChange(it.id)}
            style={{
              flex: 1, minWidth: 0, minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              border: 0, background: 'transparent', cursor: 'pointer', padding: 0,
              color: active ? 'var(--accent)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: active ? 600 : 500, letterSpacing: '-0.01em',
              transition: 'color var(--duration-fast) var(--ease-standard)',
            }}
          >
            <span style={{ width: 44, height: 28, borderRadius: 'var(--radius-pill)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? 'var(--accent-soft)' : 'transparent', transition: 'background var(--duration-fast) var(--ease-standard)' }}>
              <Icon name={it.icon} size={20} strokeWidth={active ? 1.8 : 1.5} />
            </span>
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}
