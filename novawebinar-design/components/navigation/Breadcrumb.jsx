import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function Breadcrumb({ items = [], style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-secondary)', ...style }}>
      {items.map((it, i) => (
        <a
          key={i}
          href={it.href || '#'}
          onClick={it.onClick}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: i === items.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)', textDecoration: 'none' }}
        >
          <Icon name={it.icon || 'file'} size={13} />
          {it.label}
        </a>
      ))}
    </div>
  );
}
