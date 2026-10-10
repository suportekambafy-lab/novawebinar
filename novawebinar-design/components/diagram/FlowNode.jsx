import React from 'react';

export function FlowNode({ children, highlighted = false, variant = 'light', style }) {
  return (
    <span
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 48, padding: '0 22px',
        borderRadius: 'var(--radius-md)', background: variant === 'white' ? 'var(--white)' : 'var(--gray-100)', isolation: 'isolate',
        fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--text-primary)', whiteSpace: 'nowrap', letterSpacing: '-0.01em', ...style,
      }}
    >
      {highlighted && (
        <span aria-hidden="true" style={{ position: 'absolute', inset: '6px 14px', borderRadius: 'var(--radius-pill)', background: 'var(--accent)', filter: 'blur(14px)', opacity: 0.55, zIndex: -1 }} />
      )}
      {children}
    </span>
  );
}
