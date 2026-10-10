import React from 'react';
import { Avatar } from './Avatar.jsx';

export function AvatarStack({ people = [], max = 3, size = 40, overlap = 10, style }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', ...style }}>
      {shown.map((p, i) => (
        <Avatar key={i} src={p.src} name={p.name} size={size} style={{ marginLeft: i ? -overlap : 0, zIndex: i }} />
      ))}
      {rest > 0 && (
        <span style={{
          width: size, height: size, marginLeft: -overlap, zIndex: shown.length, borderRadius: '50%', background: 'var(--navy)', color: 'var(--white)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontSize: 11, boxShadow: '0 0 0 2px var(--bg-canvas)',
        }}>+{rest}</span>
      )}
    </div>
  );
}
