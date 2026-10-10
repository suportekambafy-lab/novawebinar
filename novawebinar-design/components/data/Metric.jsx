import React from 'react';

const METRIC_SIZES = { sm: 28, md: 40, lg: 56, xl: 96 };

export function Metric({ value, prefix, unit, caption, sub, size = 'md', inverse = false, style }) {
  const fs = METRIC_SIZES[size] || METRIC_SIZES.md;
  const muted = inverse ? 'var(--gray-400)' : 'var(--text-secondary)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-sans)', color: inverse ? 'var(--white)' : 'var(--text-primary)', ...style }}>
      {caption && <div style={{ fontSize: 12, color: inverse ? 'var(--gray-300)' : 'var(--gray-700)' }}>{caption}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', fontSize: fs, fontWeight: 400, lineHeight: 1, letterSpacing: 'var(--tracking-display)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {prefix && <span style={{ fontSize: fs * 0.55, alignSelf: 'flex-start', marginTop: fs * 0.08, marginRight: 1 }}>{prefix}</span>}
        <span>{value}</span>
        {unit && <span style={{ fontSize: fs * 0.55, marginLeft: 1 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: muted }}>{sub}</div>}
    </div>
  );
}
