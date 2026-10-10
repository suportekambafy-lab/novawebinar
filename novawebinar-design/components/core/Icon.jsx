import React from 'react';

const ICON_BASE = 'https://unpkg.com/lucide-static@0.454.0/icons/';
const iconCache = {};
function loadIcon(name) {
  if (!iconCache[name]) {
    iconCache[name] = fetch(ICON_BASE + name + '.svg').then(r => (r.ok ? r.text() : '')).catch(() => '');
  }
  return iconCache[name];
}

export function Icon({ name, size = 18, strokeWidth = 1.5, color = 'currentColor', style }) {
  const [svg, setSvg] = React.useState('');
  React.useEffect(() => {
    let alive = true;
    loadIcon(name).then(t => { if (alive) setSvg(t); });
    return () => { alive = false; };
  }, [name]);
  const html = svg
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`)
    .replace(/stroke-width="2"/, `stroke-width="${strokeWidth}"`)
    .replace(/stroke="currentColor"/, `stroke="${color}"`)
    .replace(/<!--[\s\S]*?-->/g, '');
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-flex', width: size, height: size, flex: 'none', lineHeight: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
