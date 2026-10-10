import React from 'react';

const TAG_VARIANTS = {
  accent: { bg: 'var(--accent)', fg: 'var(--white)' },
  soft: { bg: 'var(--accent-soft)', fg: 'var(--accent-700)' },
  dark: { bg: 'var(--navy)', fg: 'var(--white)' },
  gray: { bg: 'var(--gray-150)', fg: 'var(--text-primary)' },
};

export function Tag({ children, variant = 'accent', size = 'sm', pill = false, style }) {
  const v = TAG_VARIANTS[variant] || TAG_VARIANTS.accent;
  const sz = size === 'md' ? { h: 26, px: 10, fs: 12 } : { h: 20, px: 8, fs: 10 };
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: sz.h, padding: `0 ${sz.px}px`,
        borderRadius: pill ? 'var(--radius-pill)' : 'var(--radius-tag)', background: v.bg, color: v.fg,
        fontFamily: 'var(--font-sans)', fontSize: sz.fs, fontWeight: 400, whiteSpace: 'nowrap', letterSpacing: '-0.01em',
        fontVariantNumeric: 'tabular-nums', ...style,
      }}
    >
      {children}
    </span>
  );
}
