import React from 'react';
import { Tag } from '../core/Tag.jsx';

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function LineChart({ labels = [], values = [], highlight, tag, width = 420, height = 140, style }) {
  const gid = 'lc-' + React.useId().replace(/:/g, '');
  const min = Math.min(...values), max = Math.max(...values);
  const padX = 6, padY = 12;
  const x = i => padX + (i / Math.max(1, values.length - 1)) * (width - padX * 2);
  const y = v => padY + (1 - (v - min) / (max - min || 1)) * (height - padY * 2);
  const pts = values.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts);
  const area = line + ` L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`;
  return (
    <div style={{ fontFamily: 'var(--font-sans)', ...style }}>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--accent)', stopOpacity: 0.12 }} />
              <stop offset="1" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="var(--navy)" strokeWidth="1.25" />
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="var(--navy)" />)}
        </svg>
        {highlight != null && tag != null && pts[highlight] && (
          <Tag variant="accent" size="md" style={{ position: 'absolute', left: (pts[highlight][0] / width) * 100 + '%', top: (pts[highlight][1] / height) * 100 + '%', transform: 'translate(-50%,-150%)' }}>{tag}</Tag>
        )}
      </div>
      {labels.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </div>
  );
}
