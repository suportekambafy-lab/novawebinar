import React from 'react';
import { Tag } from '../core/Tag.jsx';

export function BarChart({ data = [], highlight, tag, height = 180, barRadius = 10, gap = 8, showLabels = true, style }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--font-sans)', ...style }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap, height }}>
        {data.map((d, i) => {
          const hi = i === highlight;
          return (
            <div key={i} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
              {hi && tag != null && <Tag variant="accent" size="md">{tag}</Tag>}
              <div style={{
                width: '100%', height: Math.max(8, (d.value / max) * (height - (hi && tag != null ? 34 : 0))), borderRadius: barRadius,
                background: hi ? 'var(--hatch)' : 'var(--chart-bar)', transition: 'height var(--duration-base) var(--ease-standard)',
              }} />
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div style={{ display: 'flex', gap }}>
          {data.map((d, i) => (
            <span key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', overflow: 'hidden', textOverflow: 'clip', fontSize: 11, color: 'var(--text-secondary)' }}>{d.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
