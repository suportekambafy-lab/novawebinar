import React from 'react';
import { IconButton } from '../core/IconButton.jsx';

export function SideRail({ items = [], value, onChange, style }) {
  return (
    <aside style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, ...style }}>
      {items.map(it => (
        <IconButton
          key={it.id}
          icon={it.icon}
          label={it.label}
          variant="white"
          active={it.id === value}
          onClick={() => onChange && onChange(it.id)}
        />
      ))}
    </aside>
  );
}
