import React from 'react';

const HEAT_LEVELS = ['var(--hatch-light)', 'var(--accent-100)', 'var(--accent-200)', 'var(--accent-300)', 'var(--accent-400)'];

export function Heatmap({ rows = [], cell = 30, gap = 4, labelWidth = 80, style }) {
  const cols = Math.max(0, ...rows.flatMap(r => r.lines ? r.lines.map(l => l.length) : []));
  const lines = rows.flatMap((r, ri) => (r.lines || []).map((l, li) => ({ label: li === 0 ? r.label : '', cells: l, key: ri + '-' + li })));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, fontFamily: 'var(--font-sans)', ...style }}>
      {lines.map(line => (
        <div key={line.key} style={{ display: 'flex', alignItems: 'center', gap }}>
          <span style={{ width: labelWidth, flex: 'none', fontSize: 12, color: 'var(--text-primary)' }}>{line.label}</span>
          {Array.from({ length: cols }).map((_, ci) => {
            const v = line.cells[ci];
            return (
              <span key={ci} style={{
                width: cell, height: cell, flex: 'none', borderRadius: 6,
                background: v == null ? 'transparent' : HEAT_LEVELS[Math.max(0, Math.min(4, v))],
                opacity: v === 0 ? 0.7 : 1,
              }} />
            );
          })}
        </div>
      ))}
    </div>
  );
}
