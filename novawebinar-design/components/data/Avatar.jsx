import React from 'react';

export function Avatar({ src, name = '', size = 40, ring = true, style }) {
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span
      title={name}
      style={{
        width: size, height: size, flex: 'none', borderRadius: '50%', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gray-250)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: size * 0.36,
        boxShadow: ring ? '0 0 0 2px var(--bg-canvas)' : 'none', ...style,
      }}
    >
      {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </span>
  );
}
