import React from 'react';

export function ProgressRow({ label, value = 0, count, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-sans)', fontSize: 12, ...style }}>
      {count != null && <span style={{ fontSize: 14, minWidth: 22 }}>{count}</span>}
      <span style={{ minWidth: 48, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ position: 'relative', flex: 1, height: 26, borderRadius: 8, background: 'var(--gray-150)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: Math.max(0, Math.min(100, value)) + '%', background: 'var(--white)', borderRadius: 8, transition: 'width var(--duration-base) var(--ease-standard)' }} />
        <span style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '100%', padding: '0 12px', color: 'var(--text-primary)' }}>{value}%</span>
      </div>
    </div>
  );
}
