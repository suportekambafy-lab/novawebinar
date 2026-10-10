import React from 'react';
import { Tag } from '../core/Tag.jsx';

export function RangeChart({ labels = [], upper = [], lower = [], upperLabel, lowerLabel, highlight, tag, width = 600, height = 150, style }) {
  const pid = 'hatch-' + React.useId().replace(/:/g, '');
  const all = [...upper, ...lower];
  const min = Math.min(...all), max = Math.max(...all);
  const n = Math.max(upper.length, 2);
  const padX = 8, padY = 10;
  const x = i => padX + (i / (n - 1)) * (width - padX * 2);
  const y = v => padY + (1 - (v - min) / (max - min || 1)) * (height - padY * 2);
  const top = upper.map((v, i) => [x(i), y(v)]);
  const bot = lower.map((v, i) => [x(i), y(v)]);
  const poly = [...top, ...bot.slice().reverse()].map(p => p.join(',')).join(' ');
  return (
    <div style={{ fontFamily: 'var(--font-sans)', ...style }}>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
          <defs>
            <pattern id={pid} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="var(--chart-hatch)" strokeWidth="2" />
            </pattern>
          </defs>
          <polygon points={poly} fill={`url(#${pid})`} stroke="var(--chart-line)" strokeWidth="1" />
          {highlight != null && top[highlight] && (
            <line x1={top[highlight][0]} y1={top[highlight][1]} x2={bot[highlight][0]} y2={bot[highlight][1]} stroke="var(--accent)" strokeWidth="1" />
          )}
          {[...top, ...bot].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--gray-400)" />)}
        </svg>
        {upperLabel && <span style={{ position: 'absolute', left: 0, top: (top[0][1] / height) * 100 + '%', transform: 'translateY(-150%)', fontSize: 11, color: 'var(--gray-700)' }}>{upperLabel}</span>}
        {lowerLabel && <span style={{ position: 'absolute', left: 0, top: (bot[0][1] / height) * 100 + '%', transform: 'translateY(40%)', fontSize: 11, color: 'var(--gray-700)' }}>{lowerLabel}</span>}
        {highlight != null && tag != null && top[highlight] && (
          <Tag variant="accent" size="md" style={{ position: 'absolute', left: (x(highlight) / width) * 100 + '%', top: (((top[highlight][1] + bot[highlight][1]) / 2) / height) * 100 + '%', transform: 'translate(-50%,-50%)' }}>{tag}</Tag>
        )}
      </div>
      {labels.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, fontSize: 12, color: 'var(--text-secondary)' }}>
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </div>
  );
}
