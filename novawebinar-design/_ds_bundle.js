/* @ds-bundle: {"format":4,"namespace":"OrvionDesignSystem_1d6ac1","components":[{"name":"BarChart","sourcePath":"components/charts/BarChart.jsx"},{"name":"Heatmap","sourcePath":"components/charts/Heatmap.jsx"},{"name":"LineChart","sourcePath":"components/charts/LineChart.jsx"},{"name":"RangeChart","sourcePath":"components/charts/RangeChart.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"AvatarStack","sourcePath":"components/data/AvatarStack.jsx"},{"name":"Metric","sourcePath":"components/data/Metric.jsx"},{"name":"ProgressRow","sourcePath":"components/data/ProgressRow.jsx"},{"name":"WidgetCard","sourcePath":"components/data/WidgetCard.jsx"},{"name":"FlowNode","sourcePath":"components/diagram/FlowNode.jsx"},{"name":"BottomNav","sourcePath":"components/navigation/BottomNav.jsx"},{"name":"Breadcrumb","sourcePath":"components/navigation/Breadcrumb.jsx"},{"name":"NavTabs","sourcePath":"components/navigation/NavTabs.jsx"},{"name":"SideRail","sourcePath":"components/navigation/SideRail.jsx"}],"sourceHashes":{"components/charts/BarChart.jsx":"4b14439a9355","components/charts/Heatmap.jsx":"026534786727","components/charts/LineChart.jsx":"4c9d522e2092","components/charts/RangeChart.jsx":"932c4ed93302","components/core/Button.jsx":"09e40969c540","components/core/Chip.jsx":"077b99624c43","components/core/Icon.jsx":"c038036be28b","components/core/IconButton.jsx":"2b2c4ea04a1b","components/core/Input.jsx":"c20e0f9f55be","components/core/Tag.jsx":"71af245bc481","components/data/Avatar.jsx":"642739bb3cb3","components/data/AvatarStack.jsx":"b72cc74aeae4","components/data/Metric.jsx":"7e7849a50383","components/data/ProgressRow.jsx":"ffe851889071","components/data/WidgetCard.jsx":"82c4b5b88153","components/diagram/FlowNode.jsx":"f8bfff00d891","components/navigation/BottomNav.jsx":"e93d0f0056df","components/navigation/Breadcrumb.jsx":"9943490ecc12","components/navigation/NavTabs.jsx":"5d9bb8a5dacf","components/navigation/SideRail.jsx":"a5af0260a394","ui_kits/dashboard/AnalyticsScreen.jsx":"d0eb97140b2e","ui_kits/dashboard/DashboardScreen.jsx":"0f59d65a2e3c","ui_kits/dashboard/PageShell.jsx":"113984872722","ui_kits/dashboard/TopBar.jsx":"d2ab6e7508fc","ui_kits/webinar_app/PainelScreen.jsx":"bdfaa6640b61","ui_kits/webinar_room/RoomParts.jsx":"7c805805a5cc","ui_kits/webinar_room/RoomScreen.jsx":"a14191a5b881"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.OrvionDesignSystem_1d6ac1 = window.OrvionDesignSystem_1d6ac1 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/charts/Heatmap.jsx
try { (() => {
const HEAT_LEVELS = ['var(--hatch-light)', 'var(--accent-100)', 'var(--accent-200)', 'var(--accent-300)', 'var(--accent-400)'];
function Heatmap({
  rows = [],
  cell = 30,
  gap = 4,
  labelWidth = 80,
  style
}) {
  const cols = Math.max(0, ...rows.flatMap(r => r.lines ? r.lines.map(l => l.length) : []));
  const lines = rows.flatMap((r, ri) => (r.lines || []).map((l, li) => ({
    label: li === 0 ? r.label : '',
    cells: l,
    key: ri + '-' + li
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap,
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, lines.map(line => /*#__PURE__*/React.createElement("div", {
    key: line.key,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: labelWidth,
      flex: 'none',
      fontSize: 12,
      color: 'var(--text-primary)'
    }
  }, line.label), Array.from({
    length: cols
  }).map((_, ci) => {
    const v = line.cells[ci];
    return /*#__PURE__*/React.createElement("span", {
      key: ci,
      style: {
        width: cell,
        height: cell,
        flex: 'none',
        borderRadius: 6,
        background: v == null ? 'transparent' : HEAT_LEVELS[Math.max(0, Math.min(4, v))],
        opacity: v === 0 ? 0.7 : 1
      }
    });
  }))));
}
Object.assign(__ds_scope, { Heatmap });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/charts/Heatmap.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
const ICON_BASE = 'https://unpkg.com/lucide-static@0.454.0/icons/';
const iconCache = {};
function loadIcon(name) {
  if (!iconCache[name]) {
    iconCache[name] = fetch(ICON_BASE + name + '.svg').then(r => r.ok ? r.text() : '').catch(() => '');
  }
  return iconCache[name];
}
function Icon({
  name,
  size = 18,
  strokeWidth = 1.5,
  color = 'currentColor',
  style
}) {
  const [svg, setSvg] = React.useState('');
  React.useEffect(() => {
    let alive = true;
    loadIcon(name).then(t => {
      if (alive) setSvg(t);
    });
    return () => {
      alive = false;
    };
  }, [name]);
  const html = svg.replace(/width="24"/, `width="${size}"`).replace(/height="24"/, `height="${size}"`).replace(/stroke-width="2"/, `stroke-width="${strokeWidth}"`).replace(/stroke="currentColor"/, `stroke="${color}"`).replace(/<!--[\s\S]*?-->/g, '');
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'inline-flex',
      width: size,
      height: size,
      flex: 'none',
      lineHeight: 0,
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: html
    }
  });
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
const BTN_SIZES = {
  sm: {
    height: 32,
    padding: '0 14px',
    fontSize: 12,
    gap: 6,
    icon: 14
  },
  md: {
    height: 40,
    padding: '0 18px',
    fontSize: 14,
    gap: 8,
    icon: 16
  },
  lg: {
    height: 48,
    padding: '0 22px',
    fontSize: 15,
    gap: 8,
    icon: 18
  }
};
const BTN_VARIANTS = {
  dark: {
    bg: 'var(--navy)',
    hover: 'var(--hover-dark)',
    fg: 'var(--white)'
  },
  light: {
    bg: 'var(--gray-100)',
    hover: 'var(--gray-150)',
    fg: 'var(--text-primary)'
  },
  white: {
    bg: 'var(--white)',
    hover: 'var(--gray-50)',
    fg: 'var(--text-primary)'
  },
  accent: {
    bg: 'var(--button-primary)',
    hover: 'var(--button-primary-hover)',
    fg: 'var(--white)'
  },
  ghost: {
    bg: 'transparent',
    hover: 'var(--hover-ghost)',
    fg: 'var(--text-primary)'
  }
};
function Button({
  children,
  variant = 'light',
  size = 'md',
  icon,
  iconRight,
  disabled = false,
  fullWidth = false,
  onClick,
  type = 'button',
  style
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const s = BTN_SIZES[size] || BTN_SIZES.md;
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.light;
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      display: fullWidth ? 'flex' : 'inline-flex',
      width: fullWidth ? '100%' : undefined,
      alignItems: 'center',
      justifyContent: 'center',
      gap: s.gap,
      height: s.height,
      padding: s.padding,
      borderRadius: 'var(--radius-pill)',
      border: 0,
      background: hover && !disabled ? v.hover : v.bg,
      color: v.fg,
      fontFamily: 'var(--font-sans)',
      fontSize: s.fontSize,
      fontWeight: 400,
      letterSpacing: '-0.01em',
      whiteSpace: 'nowrap',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      transform: press && !disabled ? 'scale(.97)' : 'none',
      transition: 'background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard)',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: s.icon
  }), children, iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: s.icon
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
const CHIP_VARIANTS = {
  light: {
    bg: 'var(--gray-100)',
    fg: 'var(--text-primary)',
    cap: 'var(--text-secondary)'
  },
  white: {
    bg: 'var(--white)',
    fg: 'var(--text-primary)',
    cap: 'var(--text-secondary)'
  },
  chip: {
    bg: 'var(--gray-150)',
    fg: 'var(--text-primary)',
    cap: 'var(--text-secondary)'
  },
  dark: {
    bg: 'var(--navy)',
    fg: 'var(--white)',
    cap: 'var(--gray-400)'
  }
};
function Chip({
  label,
  caption,
  icon,
  knob = false,
  variant = 'light',
  size = 'md',
  onClick,
  style
}) {
  const v = CHIP_VARIANTS[variant] || CHIP_VARIANTS.light;
  const h = size === 'sm' ? 30 : caption ? 46 : 40;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      height: h,
      padding: knob ? '0 5px 0 ' + (icon ? 6 : 16) + 'px' : '0 ' + (size === 'sm' ? 12 : 16) + 'px 0 ' + (icon ? 6 : size === 'sm' ? 12 : 16) + 'px',
      borderRadius: 'var(--radius-pill)',
      background: v.bg,
      color: v.fg,
      fontFamily: 'var(--font-sans)',
      fontSize: size === 'sm' ? 12 : 13,
      whiteSpace: 'nowrap',
      letterSpacing: '-0.01em',
      cursor: onClick ? 'pointer' : 'default',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      width: h - 12,
      height: h - 12,
      borderRadius: '50%',
      background: variant === 'dark' ? 'var(--overlay-on-inverse)' : 'var(--gray-150)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 15
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15
    }
  }, caption && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: v.cap
    }
  }, caption), /*#__PURE__*/React.createElement("span", null, label)), knob && /*#__PURE__*/React.createElement("span", {
    style: {
      width: h - 10,
      height: h - 10,
      borderRadius: '50%',
      background: 'var(--white)',
      boxShadow: 'var(--shadow-soft)',
      marginLeft: 6
    }
  }));
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
const IB_VARIANTS = {
  dark: {
    bg: 'var(--navy)',
    hover: 'var(--hover-dark)',
    fg: 'var(--white)'
  },
  light: {
    bg: 'var(--gray-150)',
    hover: 'var(--gray-250)',
    fg: 'var(--text-primary)'
  },
  white: {
    bg: 'var(--white)',
    hover: 'var(--gray-100)',
    fg: 'var(--text-primary)'
  },
  accent: {
    bg: 'var(--button-primary)',
    hover: 'var(--button-primary-hover)',
    fg: 'var(--white)'
  },
  ghost: {
    bg: 'transparent',
    hover: 'var(--hover-ghost)',
    fg: 'var(--text-primary)'
  }
};
function IconButton({
  icon,
  variant = 'light',
  size = 40,
  label,
  active = false,
  disabled = false,
  onClick,
  style
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const v = IB_VARIANTS[active ? 'accent' : variant] || IB_VARIANTS.light;
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": label || icon,
    title: label,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      width: size,
      height: size,
      flex: 'none',
      borderRadius: '50%',
      border: 0,
      padding: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: hover && !disabled ? v.hover : v.bg,
      color: v.fg,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      transform: press && !disabled ? 'scale(.94)' : 'none',
      transition: 'background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard)',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: Math.round(size * 0.42)
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function Input({
  value,
  defaultValue,
  placeholder = 'Search',
  icon = 'search',
  variant = 'light',
  onChange,
  style
}) {
  const [focus, setFocus] = React.useState(false);
  const bg = variant === 'white' ? 'var(--white)' : 'var(--gray-100)';
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      height: 40,
      padding: '0 16px 0 14px',
      minWidth: 220,
      borderRadius: 'var(--radius-pill)',
      background: bg,
      color: 'var(--text-primary)',
      boxShadow: focus ? '0 0 0 1.5px var(--accent), var(--focus-ring)' : 'none',
      transition: 'box-shadow var(--duration-fast) var(--ease-standard)',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 16,
    color: "var(--text-secondary)"
  }), /*#__PURE__*/React.createElement("input", {
    value: value,
    defaultValue: defaultValue,
    placeholder: placeholder,
    onChange: onChange,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: 0,
      outline: 0,
      background: 'transparent',
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      color: 'inherit',
      letterSpacing: '-0.01em'
    }
  }));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
const TAG_VARIANTS = {
  accent: {
    bg: 'var(--accent)',
    fg: 'var(--white)'
  },
  soft: {
    bg: 'var(--accent-soft)',
    fg: 'var(--accent-700)'
  },
  dark: {
    bg: 'var(--navy)',
    fg: 'var(--white)'
  },
  gray: {
    bg: 'var(--gray-150)',
    fg: 'var(--text-primary)'
  }
};
function Tag({
  children,
  variant = 'accent',
  size = 'sm',
  pill = false,
  style
}) {
  const v = TAG_VARIANTS[variant] || TAG_VARIANTS.accent;
  const sz = size === 'md' ? {
    h: 26,
    px: 10,
    fs: 12
  } : {
    h: 20,
    px: 8,
    fs: 10
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: sz.h,
      padding: `0 ${sz.px}px`,
      borderRadius: pill ? 'var(--radius-pill)' : 'var(--radius-tag)',
      background: v.bg,
      color: v.fg,
      fontFamily: 'var(--font-sans)',
      fontSize: sz.fs,
      fontWeight: 400,
      whiteSpace: 'nowrap',
      letterSpacing: '-0.01em',
      fontVariantNumeric: 'tabular-nums',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/charts/BarChart.jsx
try { (() => {
function BarChart({
  data = [],
  highlight,
  tag,
  height = 180,
  barRadius = 10,
  gap = 8,
  showLabels = true,
  style
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap,
      height
    }
  }, data.map((d, i) => {
    const hi = i === highlight;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        flex: 1,
        minWidth: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 8
      }
    }, hi && tag != null && /*#__PURE__*/React.createElement(__ds_scope.Tag, {
      variant: "accent",
      size: "md"
    }, tag), /*#__PURE__*/React.createElement("div", {
      style: {
        width: '100%',
        height: Math.max(8, d.value / max * (height - (hi && tag != null ? 34 : 0))),
        borderRadius: barRadius,
        background: hi ? 'var(--hatch)' : 'var(--chart-bar)',
        transition: 'height var(--duration-base) var(--ease-standard)'
      }
    }));
  })), showLabels && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap
    }
  }, data.map((d, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      flex: 1,
      minWidth: 0,
      textAlign: 'center',
      overflow: 'hidden',
      textOverflow: 'clip',
      fontSize: 11,
      color: 'var(--text-secondary)'
    }
  }, d.label))));
}
Object.assign(__ds_scope, { BarChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/charts/BarChart.jsx", error: String((e && e.message) || e) }); }

// components/charts/LineChart.jsx
try { (() => {
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}
function LineChart({
  labels = [],
  values = [],
  highlight,
  tag,
  width = 420,
  height = 140,
  style
}) {
  const gid = 'lc-' + React.useId().replace(/:/g, '');
  const min = Math.min(...values),
    max = Math.max(...values);
  const padX = 6,
    padY = 12;
  const x = i => padX + i / Math.max(1, values.length - 1) * (width - padX * 2);
  const y = v => padY + (1 - (v - min) / (max - min || 1)) * (height - padY * 2);
  const pts = values.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts);
  const area = line + ` L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    style: {
      width: '100%',
      height: 'auto',
      display: 'block',
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: gid,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    style: {
      stopColor: 'var(--accent)',
      stopOpacity: 0.12
    }
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    style: {
      stopColor: 'var(--accent)',
      stopOpacity: 0
    }
  }))), /*#__PURE__*/React.createElement("path", {
    d: area,
    fill: `url(#${gid})`
  }), /*#__PURE__*/React.createElement("path", {
    d: line,
    fill: "none",
    stroke: "var(--navy)",
    strokeWidth: "1.25"
  }), pts.map((p, i) => /*#__PURE__*/React.createElement("circle", {
    key: i,
    cx: p[0],
    cy: p[1],
    r: "3.5",
    fill: "var(--navy)"
  }))), highlight != null && tag != null && pts[highlight] && /*#__PURE__*/React.createElement(__ds_scope.Tag, {
    variant: "accent",
    size: "md",
    style: {
      position: 'absolute',
      left: pts[highlight][0] / width * 100 + '%',
      top: pts[highlight][1] / height * 100 + '%',
      transform: 'translate(-50%,-150%)'
    }
  }, tag)), labels.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 6,
      marginTop: 12,
      fontSize: 11,
      color: 'var(--text-secondary)'
    }
  }, labels.map((l, i) => /*#__PURE__*/React.createElement("span", {
    key: i
  }, l))));
}
Object.assign(__ds_scope, { LineChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/charts/LineChart.jsx", error: String((e && e.message) || e) }); }

// components/charts/RangeChart.jsx
try { (() => {
function RangeChart({
  labels = [],
  upper = [],
  lower = [],
  upperLabel,
  lowerLabel,
  highlight,
  tag,
  width = 600,
  height = 150,
  style
}) {
  const pid = 'hatch-' + React.useId().replace(/:/g, '');
  const all = [...upper, ...lower];
  const min = Math.min(...all),
    max = Math.max(...all);
  const n = Math.max(upper.length, 2);
  const padX = 8,
    padY = 10;
  const x = i => padX + i / (n - 1) * (width - padX * 2);
  const y = v => padY + (1 - (v - min) / (max - min || 1)) * (height - padY * 2);
  const top = upper.map((v, i) => [x(i), y(v)]);
  const bot = lower.map((v, i) => [x(i), y(v)]);
  const poly = [...top, ...bot.slice().reverse()].map(p => p.join(',')).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    style: {
      width: '100%',
      height: 'auto',
      display: 'block',
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("pattern", {
    id: pid,
    width: "8",
    height: "8",
    patternUnits: "userSpaceOnUse",
    patternTransform: "rotate(45)"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "8",
    stroke: "var(--chart-hatch)",
    strokeWidth: "2"
  }))), /*#__PURE__*/React.createElement("polygon", {
    points: poly,
    fill: `url(#${pid})`,
    stroke: "var(--chart-line)",
    strokeWidth: "1"
  }), highlight != null && top[highlight] && /*#__PURE__*/React.createElement("line", {
    x1: top[highlight][0],
    y1: top[highlight][1],
    x2: bot[highlight][0],
    y2: bot[highlight][1],
    stroke: "var(--accent)",
    strokeWidth: "1"
  }), [...top, ...bot].map((p, i) => /*#__PURE__*/React.createElement("circle", {
    key: i,
    cx: p[0],
    cy: p[1],
    r: "3",
    fill: "var(--gray-400)"
  }))), upperLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      top: top[0][1] / height * 100 + '%',
      transform: 'translateY(-150%)',
      fontSize: 11,
      color: 'var(--gray-700)'
    }
  }, upperLabel), lowerLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      top: bot[0][1] / height * 100 + '%',
      transform: 'translateY(40%)',
      fontSize: 11,
      color: 'var(--gray-700)'
    }
  }, lowerLabel), highlight != null && tag != null && top[highlight] && /*#__PURE__*/React.createElement(__ds_scope.Tag, {
    variant: "accent",
    size: "md",
    style: {
      position: 'absolute',
      left: x(highlight) / width * 100 + '%',
      top: (top[highlight][1] + bot[highlight][1]) / 2 / height * 100 + '%',
      transform: 'translate(-50%,-50%)'
    }
  }, tag)), labels.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 18,
      fontSize: 12,
      color: 'var(--text-secondary)'
    }
  }, labels.map((l, i) => /*#__PURE__*/React.createElement("span", {
    key: i
  }, l))));
}
Object.assign(__ds_scope, { RangeChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/charts/RangeChart.jsx", error: String((e && e.message) || e) }); }

// components/data/Avatar.jsx
try { (() => {
function Avatar({
  src,
  name = '',
  size = 40,
  ring = true,
  style
}) {
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return /*#__PURE__*/React.createElement("span", {
    title: name,
    style: {
      width: size,
      height: size,
      flex: 'none',
      borderRadius: '50%',
      overflow: 'hidden',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--gray-250)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-sans)',
      fontSize: size * 0.36,
      boxShadow: ring ? '0 0 0 2px var(--bg-canvas)' : 'none',
      ...style
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : initials);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data/AvatarStack.jsx
try { (() => {
function AvatarStack({
  people = [],
  max = 3,
  size = 40,
  overlap = 10,
  style
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      ...style
    }
  }, shown.map((p, i) => /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    key: i,
    src: p.src,
    name: p.name,
    size: size,
    style: {
      marginLeft: i ? -overlap : 0,
      zIndex: i
    }
  })), rest > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      marginLeft: -overlap,
      zIndex: shown.length,
      borderRadius: '50%',
      background: 'var(--navy)',
      color: 'var(--white)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
      fontSize: 11,
      boxShadow: '0 0 0 2px var(--bg-canvas)'
    }
  }, "+", rest));
}
Object.assign(__ds_scope, { AvatarStack });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/AvatarStack.jsx", error: String((e && e.message) || e) }); }

// components/data/Metric.jsx
try { (() => {
const METRIC_SIZES = {
  sm: 28,
  md: 40,
  lg: 56,
  xl: 96
};
function Metric({
  value,
  prefix,
  unit,
  caption,
  sub,
  size = 'md',
  inverse = false,
  style
}) {
  const fs = METRIC_SIZES[size] || METRIC_SIZES.md;
  const muted = inverse ? 'var(--gray-400)' : 'var(--text-secondary)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      fontFamily: 'var(--font-sans)',
      color: inverse ? 'var(--white)' : 'var(--text-primary)',
      ...style
    }
  }, caption && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: inverse ? 'var(--gray-300)' : 'var(--gray-700)'
    }
  }, caption), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      fontSize: fs,
      fontWeight: 400,
      lineHeight: 1,
      letterSpacing: 'var(--tracking-display)',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap'
    }
  }, prefix && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: fs * 0.55,
      alignSelf: 'flex-start',
      marginTop: fs * 0.08,
      marginRight: 1
    }
  }, prefix), /*#__PURE__*/React.createElement("span", null, value), unit && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: fs * 0.55,
      marginLeft: 1
    }
  }, unit)), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: muted
    }
  }, sub));
}
Object.assign(__ds_scope, { Metric });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Metric.jsx", error: String((e && e.message) || e) }); }

// components/data/ProgressRow.jsx
try { (() => {
function ProgressRow({
  label,
  value = 0,
  count,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
      ...style
    }
  }, count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      minWidth: 22
    }
  }, count), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 48,
      color: 'var(--text-secondary)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      flex: 1,
      height: 26,
      borderRadius: 8,
      background: 'var(--gray-150)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      width: Math.max(0, Math.min(100, value)) + '%',
      background: 'var(--white)',
      borderRadius: 8,
      transition: 'width var(--duration-base) var(--ease-standard)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      height: '100%',
      padding: '0 12px',
      color: 'var(--text-primary)'
    }
  }, value, "%")));
}
Object.assign(__ds_scope, { ProgressRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ProgressRow.jsx", error: String((e && e.message) || e) }); }

// components/data/WidgetCard.jsx
try { (() => {
const CARD_VARIANTS = {
  default: {
    bg: 'var(--surface-card)',
    fg: 'var(--text-primary)',
    sub: 'var(--text-secondary)',
    btn: 'light'
  },
  white: {
    bg: 'var(--white)',
    fg: 'var(--text-primary)',
    sub: 'var(--text-secondary)',
    btn: 'light'
  },
  inverse: {
    bg: 'var(--surface-inverse-soft)',
    fg: 'var(--white)',
    sub: 'var(--gray-400)',
    btn: 'white'
  },
  glass: {
    bg: 'var(--surface-glass)',
    fg: 'var(--text-primary)',
    sub: 'var(--text-secondary)',
    btn: 'white'
  }
};
function WidgetCard({
  title,
  subtitle,
  actions = [],
  headerRight,
  variant = 'default',
  padding = 24,
  children,
  style
}) {
  const v = CARD_VARIANTS[variant] || CARD_VARIANTS.default;
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      minWidth: 0,
      background: v.bg,
      color: v.fg,
      borderRadius: 'var(--radius-card)',
      padding,
      backdropFilter: variant === 'glass' ? 'blur(var(--blur-glass))' : undefined,
      WebkitBackdropFilter: variant === 'glass' ? 'blur(var(--blur-glass))' : undefined,
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, (title || actions.length > 0 || headerRight) && /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, title && /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 'var(--text-subtitle)',
      fontWeight: 400,
      letterSpacing: 'var(--tracking-heading)',
      lineHeight: 1.2,
      textWrap: 'pretty'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: v.sub
    }
  }, subtitle)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flex: 'none',
      alignItems: 'center'
    }
  }, headerRight, actions.map((a, i) => /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    key: i,
    icon: a.icon,
    label: a.label,
    variant: a.variant || v.btn,
    size: a.size || 36,
    onClick: a.onClick
  })))), children);
}
Object.assign(__ds_scope, { WidgetCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/WidgetCard.jsx", error: String((e && e.message) || e) }); }

// components/diagram/FlowNode.jsx
try { (() => {
function FlowNode({
  children,
  highlighted = false,
  variant = 'light',
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
      padding: '0 22px',
      borderRadius: 'var(--radius-md)',
      background: variant === 'white' ? 'var(--white)' : 'var(--gray-100)',
      isolation: 'isolate',
      fontFamily: 'var(--font-sans)',
      fontSize: 15,
      color: 'var(--text-primary)',
      whiteSpace: 'nowrap',
      letterSpacing: '-0.01em',
      ...style
    }
  }, highlighted && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      inset: '6px 14px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--accent)',
      filter: 'blur(14px)',
      opacity: 0.55,
      zIndex: -1
    }
  }), children);
}
Object.assign(__ds_scope, { FlowNode });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/diagram/FlowNode.jsx", error: String((e && e.message) || e) }); }

// components/navigation/BottomNav.jsx
try { (() => {
function BottomNav({
  items = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'stretch',
      background: 'var(--white)',
      borderTop: '1px solid var(--border-hairline)',
      padding: '8px 6px 10px',
      ...style
    }
  }, items.map(it => {
    const active = it.id === value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      type: "button",
      onClick: () => onChange && onChange(it.id),
      style: {
        flex: 1,
        minWidth: 0,
        minHeight: 52,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        border: 0,
        background: 'transparent',
        cursor: 'pointer',
        padding: 0,
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        letterSpacing: '-0.01em',
        transition: 'color var(--duration-fast) var(--ease-standard)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 44,
        height: 28,
        borderRadius: 'var(--radius-pill)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'var(--accent-soft)' : 'transparent',
        transition: 'background var(--duration-fast) var(--ease-standard)'
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 20,
      strokeWidth: active ? 1.8 : 1.5
    })), it.label);
  }));
}
Object.assign(__ds_scope, { BottomNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/BottomNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Breadcrumb.jsx
try { (() => {
function Breadcrumb({
  items = [],
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
      color: 'var(--text-secondary)',
      ...style
    }
  }, items.map((it, i) => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: it.href || '#',
    onClick: it.onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      color: i === items.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: it.icon || 'file',
    size: 13
  }), it.label)));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavTabs.jsx
try { (() => {
function NavPill({
  item,
  active,
  onClick
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      height: 40,
      padding: '0 18px 0 14px',
      border: 0,
      borderRadius: 'var(--radius-pill)',
      cursor: 'pointer',
      background: active ? 'var(--button-primary)' : hover ? 'var(--gray-150)' : 'var(--gray-100)',
      color: active ? 'var(--white)' : 'var(--text-primary)',
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      letterSpacing: '-0.01em',
      whiteSpace: 'nowrap',
      transition: 'background var(--duration-fast) var(--ease-standard), color var(--duration-fast)'
    }
  }, item.icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: item.icon,
    size: 15
  }), item.label);
}
function NavTabs({
  items = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      ...style
    }
  }, items.map(it => /*#__PURE__*/React.createElement(NavPill, {
    key: it.id,
    item: it,
    active: it.id === value,
    onClick: () => onChange && onChange(it.id)
  })));
}
Object.assign(__ds_scope, { NavTabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavTabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SideRail.jsx
try { (() => {
function SideRail({
  items = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 10,
      ...style
    }
  }, items.map(it => /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    key: it.id,
    icon: it.icon,
    label: it.label,
    variant: "white",
    active: it.id === value,
    onClick: () => onChange && onChange(it.id)
  })));
}
Object.assign(__ds_scope, { SideRail });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SideRail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/AnalyticsScreen.jsx
try { (() => {
(() => {
  const {
    WidgetCard,
    Metric,
    BarChart,
    Heatmap,
    IconButton,
    Chip,
    Button
  } = window.OrvionDesignSystem_1d6ac1;
  const FUNNEL = ['Visitas', 'Inscritos', 'Presentes', 'Oferta', 'Checkout', 'Compras'];
  const ORDER_ROWS = [{
    label: '',
    lines: [[null, null, null, null, null, null, 0, null, null, null]]
  }, {
    label: 'Facebook',
    lines: [[null, null, null, 0, 0, 0, 3, 0, null, null], [null, null, 1, 0, 1, 2, 4, 1, 0, null]]
  }, {
    label: 'Instagram',
    lines: [[1, 1, 4, 4, 4, 4, 4, 1, 0, null], [null, 0, 2, 1, 2, 4, 4, 0, null, null]]
  }, {
    label: 'Tiktok',
    lines: [[null, null, 0, 1, 2, 4, 0, 0, null, null], [null, null, null, 0, 2, 4, 1, 0, null, null]]
  }, {
    label: 'Whatsapp',
    lines: [[null, null, null, null, 0, 2, 0, null, null, null], [null, null, null, null, null, 0, null, null, null, null]]
  }];
  function RevenueCard({
    inverse
  }) {
    return /*#__PURE__*/React.createElement(WidgetCard, {
      variant: inverse ? 'inverse' : 'default',
      title: "Receita de hoje",
      actions: [{
        icon: 'arrow-up-right',
        variant: inverse ? 'white' : 'light'
      }]
    }, /*#__PURE__*/React.createElement(Metric, {
      inverse: inverse,
      value: "3,7",
      unit: "k\u20AC",
      size: "lg",
      sub: "Pagamento de 4,1 k\u20AC dispon\xEDvel em breve",
      style: {
        marginTop: 10
      }
    }));
  }
  function AnalyticsScreen() {
    const [period, setPeriod] = React.useState('Mensal');
    const cyc = () => setPeriod(p => p === 'Mensal' ? 'Semanal' : 'Mensal');
    const toolbar = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Chip, {
      caption: "Data",
      label: "18 jan \u2013 29 jan 2026",
      icon: "calendar",
      knob: true
    }), /*#__PURE__*/React.createElement(Chip, {
      label: "Funil",
      icon: "sliders-horizontal",
      knob: true
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      iconRight: "arrow-up-right"
    }, "Exportar CSV"));
    const [gridRef, w] = useContainerWidth();
    const narrow = w < 1100;
    const half = narrow ? 'span 6' : 'span 3';
    const third = w < 760 ? 'span 6' : 'span 2';
    const head = /*#__PURE__*/React.createElement(Chip, {
      label: period,
      size: "sm",
      variant: "chip",
      onClick: cyc
    });
    return /*#__PURE__*/React.createElement(PageShell, {
      title: /*#__PURE__*/React.createElement(React.Fragment, null, "A sua an\xE1lise", /*#__PURE__*/React.createElement("br", null), "de vendas"),
      toolbar: toolbar
    }, /*#__PURE__*/React.createElement("div", {
      ref: gridRef,
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(6,minmax(0,1fr))',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        gridColumn: third
      }
    }, /*#__PURE__*/React.createElement(RevenueCard, {
      inverse: true
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        gridColumn: third
      }
    }, /*#__PURE__*/React.createElement(RevenueCard, null)), /*#__PURE__*/React.createElement("div", {
      style: {
        gridColumn: third
      }
    }, /*#__PURE__*/React.createElement(RevenueCard, null)), /*#__PURE__*/React.createElement(WidgetCard, {
      title: "Funil de vendas",
      subtitle: "Da visita \xE0 compra",
      headerRight: head,
      actions: [{
        icon: 'sliders-horizontal'
      }],
      style: {
        gridColumn: half
      }
    }, /*#__PURE__*/React.createElement(BarChart, {
      height: 250,
      highlight: 3,
      tag: "3.012",
      barRadius: 16,
      gap: 14,
      data: [100, 62, 41, 30, 12, 7].map((v, i) => ({
        label: FUNNEL[i],
        value: v
      }))
    })), /*#__PURE__*/React.createElement(WidgetCard, {
      title: "Inscri\xE7\xF5es",
      subtitle: "Por rede social",
      headerRight: head,
      actions: [{
        icon: 'sliders-horizontal'
      }],
      style: {
        gridColumn: half
      }
    }, /*#__PURE__*/React.createElement(Heatmap, {
      rows: ORDER_ROWS,
      cell: 26,
      gap: 4,
      labelWidth: 84
    }))));
  }
  function PlaceholderScreen({
    name
  }) {
    return /*#__PURE__*/React.createElement(PageShell, {
      title: name
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: 420,
        borderRadius: 32,
        background: 'var(--surface-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
        fontSize: 14,
        textAlign: 'center',
        padding: 24
      }
    }, "O ecr\xE3 ", name, " ainda n\xE3o foi definido."));
  }
  Object.assign(window, {
    AnalyticsScreen,
    PlaceholderScreen
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/AnalyticsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/DashboardScreen.jsx
try { (() => {
(() => {
  const {
    WidgetCard,
    Metric,
    BarChart,
    RangeChart,
    LineChart,
    ProgressRow,
    IconButton,
    Icon,
    Chip,
    Button
  } = window.OrvionDesignSystem_1d6ac1;
  const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  function ProVersionCard({
    onClose
  }) {
    return /*#__PURE__*/React.createElement("section", {
      style: {
        position: 'relative',
        gridRow: 'span 2',
        borderRadius: 32,
        background: 'var(--surface-card)',
        overflow: 'hidden',
        minHeight: 520
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: "../../assets/imagery/spheres.png",
      alt: "",
      style: {
        position: 'absolute',
        top: 30,
        right: 0,
        width: '88%',
        objectFit: 'cover',
        objectPosition: 'left top',
        height: 300,
        mixBlendMode: 'multiply',
        WebkitMaskImage: 'linear-gradient(to right, transparent, #000 30%), linear-gradient(to bottom, transparent, #000 25%)',
        WebkitMaskComposite: 'source-in',
        maskImage: 'linear-gradient(to right, transparent, #000 30%), linear-gradient(to bottom, transparent, #000 25%)',
        maskComposite: 'intersect'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 22,
        left: 24,
        fontSize: 18,
        letterSpacing: '-0.02em'
      }
    }, "Vers\xE3o Pro"), /*#__PURE__*/React.createElement(IconButton, {
      icon: "x",
      variant: "white",
      size: 36,
      label: "Fechar",
      onClick: onClose,
      style: {
        position: 'absolute',
        top: 16,
        right: 16
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: 8,
        top: 190,
        borderRadius: 28,
        background: 'var(--surface-glass)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        padding: 18,
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 15
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "chart-no-axes-column",
      size: 15
    }), "Vantagens"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: 'var(--text-secondary)',
        marginTop: 4
      }
    }, "Os seus ganhos com a vers\xE3o Pro")), /*#__PURE__*/React.createElement(IconButton, {
      icon: "arrow-up-right",
      variant: "white",
      size: 34
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 26,
        fontSize: 30,
        letterSpacing: '-0.04em'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        whiteSpace: 'nowrap'
      }
    }, "30-45", /*#__PURE__*/React.createElement("small", {
      style: {
        fontSize: 12,
        color: 'var(--text-secondary)',
        marginLeft: 4
      }
    }, "anos")), /*#__PURE__*/React.createElement("span", {
      style: {
        whiteSpace: 'nowrap'
      }
    }, "12-21", /*#__PURE__*/React.createElement("small", {
      style: {
        fontSize: 12,
        color: 'var(--text-secondary)',
        marginLeft: 4
      }
    }, "anos"))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
        gap: 6,
        alignItems: 'end',
        marginTop: 16,
        fontSize: 13
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: '82%',
        background: 'var(--accent)',
        color: 'var(--white)',
        borderRadius: 16,
        padding: '10px 8px',
        minWidth: 0,
        overflow: 'hidden',
        fontSize: 'clamp(11px,1.1vw,15px)',
        letterSpacing: '-0.03em'
      }
    }, "12.233", /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9
      }
    }, "vendas")), /*#__PURE__*/React.createElement("div", {
      style: {
        height: '36%',
        background: 'var(--overlay-light)',
        borderRadius: 16,
        padding: '10px 8px',
        minWidth: 0,
        overflow: 'hidden',
        fontSize: 'clamp(11px,1.1vw,15px)'
      }
    }, "6%", /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: 'var(--text-secondary)'
      }
    }, "crescimento")), /*#__PURE__*/React.createElement("div", {
      style: {
        height: '64%',
        background: 'var(--accent)',
        color: 'var(--white)',
        borderRadius: 16,
        padding: '10px 8px',
        minWidth: 0,
        overflow: 'hidden',
        fontSize: 'clamp(11px,1.1vw,15px)',
        letterSpacing: '-0.03em'
      }
    }, "33.337", /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9
      }
    }, "vendas")), /*#__PURE__*/React.createElement("div", {
      style: {
        height: '100%',
        background: 'var(--overlay-light)',
        borderRadius: 16,
        padding: '10px 8px',
        minWidth: 0,
        overflow: 'hidden',
        fontSize: 'clamp(11px,1.1vw,15px)'
      }
    }, "9%", /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: 'var(--text-secondary)'
      }
    }, "crescimento")))));
  }
  function DashboardScreen() {
    const [pro, setPro] = React.useState(true);
    const [hl, setHl] = React.useState(4);
    const [gridRef, w] = useContainerWidth();
    const wide = w >= 1180;
    const cols = wide ? pro ? '1.05fr 1fr 1fr 1fr' : 'repeat(3,minmax(0,1fr))' : 'repeat(2,minmax(0,1fr))';
    const actions = [{
      icon: 'sliders-vertical'
    }, {
      icon: 'arrow-up-right'
    }];
    const toolbar = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(IconButton, {
      icon: "search",
      variant: "light"
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "sliders-vertical",
      variant: "light"
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "calendar",
      variant: "accent"
    }), /*#__PURE__*/React.createElement(Chip, {
      label: "22/06/2026"
    }), /*#__PURE__*/React.createElement(Chip, {
      label: "26/06/2026"
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "light",
      icon: "plus"
    }, "Novo widget"), /*#__PURE__*/React.createElement(Button, {
      variant: "light"
    }, "Criar relat\xF3rio"));
    return /*#__PURE__*/React.createElement(PageShell, {
      crumbs: [{
        label: 'Webinars'
      }, {
        label: 'Método Perpétuo'
      }],
      title: "Desempenho dos webinars",
      toolbar: toolbar
    }, /*#__PURE__*/React.createElement("div", {
      ref: gridRef,
      style: {
        display: 'grid',
        gridTemplateColumns: cols,
        gridAutoFlow: 'row dense',
        gap: 12
      }
    }, pro && /*#__PURE__*/React.createElement(ProVersionCard, {
      onClose: () => setPro(false)
    }), /*#__PURE__*/React.createElement(WidgetCard, {
      title: "Inscri\xE7\xF5es",
      actions: actions
    }, /*#__PURE__*/React.createElement(Metric, {
      caption: "Novos inscritos esta semana",
      value: "186"
    }), /*#__PURE__*/React.createElement(BarChart, {
      height: 130,
      highlight: hl,
      tag: "12.464",
      data: [22, 34, 30, 52, 100, 58, 48].map((v, i) => ({
        label: DAYS[i],
        value: v
      }))
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 4
      }
    }, DAYS.map((d, i) => /*#__PURE__*/React.createElement("span", {
      key: d,
      onClick: () => setHl(i),
      style: {
        flex: 1,
        height: 4,
        borderRadius: 4,
        cursor: 'pointer',
        background: i === hl ? 'var(--accent)' : 'transparent'
      }
    })))), /*#__PURE__*/React.createElement(WidgetCard, {
      title: "Compara\xE7\xE3o de receita",
      style: {
        gridColumn: 'span 2'
      },
      actions: [{
        icon: 'sliders-vertical',
        variant: 'accent'
      }, {
        icon: 'message-circle-more'
      }, {
        icon: 'arrow-up-right'
      }]
    }, /*#__PURE__*/React.createElement(Metric, {
      caption: "Desde o in\xEDcio",
      value: "29,48",
      unit: "k\u20AC"
    }), /*#__PURE__*/React.createElement(RangeChart, {
      upperLabel: "2023",
      lowerLabel: "2024",
      highlight: 3,
      tag: "+9%",
      upper: [40, 36, 50, 54, 58, 64, 72],
      lower: [22, 12, 20, 10, 34, 44, 58],
      labels: DAYS,
      height: 130
    })), /*#__PURE__*/React.createElement(WidgetCard, {
      title: "Vendas na oferta",
      style: {
        gridColumn: 'span 2'
      },
      actions: actions
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: w < 700 ? 'minmax(0,1fr)' : '170px minmax(0,1fr)',
        gap: 24,
        alignItems: 'end'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }
    }, /*#__PURE__*/React.createElement(Metric, {
      caption: "Vendas da semana",
      value: "2.788",
      unit: "\u20AC",
      sub: "Meta: 4.320 \u20AC"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }
    }, [['34', 'Compras'], ['28', 'Carrinhos abertos']].map(([n, l]) => /*#__PURE__*/React.createElement("div", {
      key: l,
      style: {
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        height: 32,
        padding: '0 12px',
        borderRadius: 10,
        background: 'var(--gray-150)',
        fontSize: 11
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13
      }
    }, n), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-secondary)'
      }
    }, l))))), /*#__PURE__*/React.createElement(LineChart, {
      values: [18, 30, 22, 46, 38, 62, 80],
      highlight: 3,
      tag: "34.533",
      labels: DAYS,
      height: 130
    }))), /*#__PURE__*/React.createElement(WidgetCard, {
      title: "Presen\xE7a",
      actions: [{
        icon: 'arrow-up-right'
      }]
    }, /*#__PURE__*/React.createElement(Metric, {
      caption: "Tempo m\xE9dio assistido",
      value: "42",
      unit: "min",
      sub: "de 58 min de v\xEDdeo"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginTop: 'auto'
      }
    }, /*#__PURE__*/React.createElement(ProgressRow, {
      label: "Ao vivo",
      value: 72
    }), /*#__PURE__*/React.createElement(ProgressRow, {
      label: "Replay",
      value: 28
    })))));
  }
  Object.assign(window, {
    DashboardScreen
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/PageShell.jsx
try { (() => {
(() => {
  const {
    Breadcrumb,
    IconButton,
    Chip,
    Button,
    SideRail
  } = window.OrvionDesignSystem_1d6ac1;
  const RAIL_ITEMS = [{
    id: 'search',
    icon: 'search',
    label: 'Pesquisar'
  }, {
    id: 'pen',
    icon: 'pen-tool',
    label: 'Editar'
  }, {
    id: 'chat',
    icon: 'message-circle',
    label: 'Comentários'
  }, {
    id: 'clip',
    icon: 'clipboard',
    label: 'Notas'
  }, {
    id: 'settings',
    icon: 'settings',
    label: 'Definições'
  }];
  function PageShell({
    crumbs,
    title,
    toolbar,
    children
  }) {
    const [tool, setTool] = React.useState('search');
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '40px minmax(0,1fr)',
        columnGap: 20,
        rowGap: 20,
        marginTop: 28
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: "arrow-left",
      variant: "white",
      label: "Voltar"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 20,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, crumbs && /*#__PURE__*/React.createElement(Breadcrumb, {
      items: crumbs
    }), /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        fontSize: 34,
        fontWeight: 400,
        letterSpacing: '-0.03em',
        lineHeight: 1.1
      }
    }, title)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap'
      }
    }, toolbar)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement(SideRail, {
      items: RAIL_ITEMS,
      value: tool,
      onChange: setTool
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "headphones",
      variant: "white",
      label: "Suporte"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, children));
  }
  function useContainerWidth() {
    const ref = React.useRef(null);
    const [w, setW] = React.useState(1400);
    React.useEffect(() => {
      if (!ref.current) return;
      const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, []);
    return [ref, w];
  }
  Object.assign(window, {
    PageShell,
    useContainerWidth
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/PageShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/TopBar.jsx
try { (() => {
(() => {
  const {
    NavTabs,
    AvatarStack,
    Button,
    IconButton,
    Avatar
  } = window.OrvionDesignSystem_1d6ac1;
  const NAV_ITEMS = [{
    id: 'dashboard',
    label: 'Painel',
    icon: 'layout-grid'
  }, {
    id: 'analytics',
    label: 'Análises',
    icon: 'square-activity'
  }, {
    id: 'pulse',
    label: 'Ao vivo',
    icon: 'radio'
  }, {
    id: 'data',
    label: 'Dados',
    icon: 'database'
  }];
  const TEAM = [{
    src: '../../assets/avatars/avatar-1.png',
    name: 'Leo Park'
  }, {
    src: '../../assets/avatars/avatar-2.png',
    name: 'Sam Reid'
  }, {
    src: '../../assets/avatars/avatar-3.png',
    name: 'Ana Ito'
  }, {}, {}, {}, {}, {}, {}];
  function TopBar({
    tab,
    onTab
  }) {
    return /*#__PURE__*/React.createElement("header", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '12px 32px',
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 20,
        fontWeight: 600,
        letterSpacing: '-0.04em',
        whiteSpace: 'nowrap'
      }
    }, "Novawebinar"), /*#__PURE__*/React.createElement(NavTabs, {
      items: NAV_ITEMS,
      value: tab,
      onChange: onTab
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginLeft: 'auto'
      }
    }, /*#__PURE__*/React.createElement(AvatarStack, {
      people: TEAM,
      max: 3,
      size: 40
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "light",
      icon: "share"
    }, "Partilhado")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: "bell-ring",
      variant: "light",
      label: "Notifica\xE7\xF5es"
    }), /*#__PURE__*/React.createElement(Avatar, {
      src: "../../assets/avatars/avatar-user.png",
      name: "Voc\xEA",
      size: 40,
      ring: false
    })));
  }
  Object.assign(window, {
    TopBar
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/TopBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/webinar_app/PainelScreen.jsx
try { (() => {
(() => {
  const {
    Button,
    IconButton,
    Icon,
    Avatar,
    Tag,
    WidgetCard
  } = window.OrvionDesignSystem_1d6ac1;
  function AppHeader({
    unread = 1
  }) {
    return /*#__PURE__*/React.createElement("header", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 64,
        padding: '0 16px',
        background: 'var(--white)',
        borderBottom: '1px solid var(--border-hairline)',
        flex: 'none'
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: "menu",
      variant: "ghost",
      size: 44,
      label: "Menu"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: "bell",
      variant: "ghost",
      size: 44,
      label: "Notifica\xE7\xF5es"
    }), unread > 0 && /*#__PURE__*/React.createElement(Tag, {
      variant: "accent",
      pill: true,
      style: {
        position: 'absolute',
        top: 4,
        right: 2,
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        fontWeight: 600,
        boxShadow: '0 0 0 2px var(--white)'
      }
    }, unread)), /*#__PURE__*/React.createElement(Avatar, {
      name: "Amado",
      size: 40,
      ring: false,
      style: {
        background: 'var(--accent)',
        color: 'var(--white)',
        fontWeight: 600,
        fontSize: 16
      }
    })));
  }
  function StudioHero({
    onContinue
  }) {
    return /*#__PURE__*/React.createElement("section", {
      style: {
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
        clipPath: 'inset(0 round 32px)',
        transform: 'translateZ(0)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--accent)',
        color: 'var(--white)',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        position: 'absolute',
        right: -20,
        top: 30,
        width: 180,
        height: 180,
        borderRadius: '50%',
        background: 'var(--accent-200)',
        filter: 'blur(50px)',
        opacity: 0.35,
        zIndex: -1
      }
    }), /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        position: 'absolute',
        right: -30,
        bottom: -50,
        width: 180,
        height: 180,
        borderRadius: '50%',
        background: 'repeating-linear-gradient(-45deg,rgba(255,255,255,.5) 0 1.5px,transparent 1.5px 7px)',
        opacity: 0.35,
        zIndex: -1
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'var(--white)',
        fontWeight: 500
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "radio",
      size: 16,
      color: "var(--white)"
    }), "Est\xFAdio Novawebinar"), /*#__PURE__*/React.createElement("h2", {
      style: {
        margin: 0,
        fontSize: 28,
        fontWeight: 600,
        lineHeight: 1.25,
        letterSpacing: '-0.025em',
        textWrap: 'balance'
      }
    }, "Transforme audi\xEAncia em ", /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        background: 'var(--white)',
        color: 'var(--navy)',
        padding: '1px 10px 3px',
        borderRadius: 12,
        lineHeight: 1.25
      }
    }, "vendas")), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: 0,
        fontSize: 15,
        lineHeight: 1.5,
        color: 'var(--white)',
        opacity: 0.92,
        textWrap: 'pretty'
      }
    }, "Prepare a pr\xF3xima sess\xE3o e mantenha v\xEDdeo, intera\xE7\xF5es e oferta alinhados."), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 6
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "white",
      iconRight: "arrow-right",
      onClick: onContinue,
      style: {
        color: 'var(--accent-deep)',
        fontWeight: 600
      }
    }, "Continuar configura\xE7\xE3o")));
  }
  function StatCard({
    label,
    value,
    unit,
    icon
  }) {
    return /*#__PURE__*/React.createElement(WidgetCard, {
      variant: "white",
      padding: 18,
      style: {
        gap: 14,
        borderRadius: 24
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: 'var(--text-secondary)',
        lineHeight: 1.3
      }
    }, label), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 32,
        height: 32,
        flex: 'none',
        borderRadius: '50%',
        background: 'var(--accent-soft)',
        color: 'var(--accent-strong)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: icon,
      size: 16
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 34,
        lineHeight: 1,
        letterSpacing: '-0.04em',
        fontVariantNumeric: 'tabular-nums'
      }
    }, value, unit && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 16,
        marginLeft: 3,
        color: 'var(--text-secondary)'
      }
    }, unit)));
  }
  function PainelScreen({
    name = 'Amado',
    onNew,
    onContinue
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '24px 16px 96px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        fontSize: 32,
        fontWeight: 600,
        letterSpacing: '-0.035em',
        lineHeight: 1.1
      }
    }, "Ol\xE1, ", name), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: 0,
        fontSize: 16,
        color: 'var(--text-secondary)'
      }
    }, "Resumo operacional dos seus webinars.")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      size: "lg",
      icon: "plus",
      onClick: onNew
    }, "Novo webinar")), /*#__PURE__*/React.createElement(StudioHero, {
      onContinue: onContinue
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement(StatCard, {
      label: "Participantes reais",
      value: "2",
      icon: "users"
    }), /*#__PURE__*/React.createElement(StatCard, {
      label: "Webinars criados",
      value: "3",
      icon: "clapperboard"
    }), /*#__PURE__*/React.createElement(StatCard, {
      label: "Tempo m\xE9dio",
      value: "18",
      unit: "min",
      icon: "trending-up"
    }), /*#__PURE__*/React.createElement(StatCard, {
      label: "Convers\xE3o no CTA",
      value: "4,2",
      unit: "%",
      icon: "mouse-pointer-click"
    })));
  }
  function EmptyTab({
    label
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '24px 16px 96px'
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: '0 0 16px',
        fontSize: 32,
        fontWeight: 600,
        letterSpacing: '-0.035em'
      }
    }, label), /*#__PURE__*/React.createElement("div", {
      style: {
        borderRadius: 24,
        background: 'var(--surface-card)',
        border: '1px dashed var(--gray-300)',
        padding: 24,
        fontSize: 14,
        color: 'var(--text-secondary)',
        textAlign: 'center'
      }
    }, "Ecr\xE3 ainda n\xE3o definido."));
  }
  Object.assign(window, {
    AppHeader,
    PainelScreen,
    EmptyTab
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/webinar_app/PainelScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/webinar_room/RoomParts.jsx
try { (() => {
(() => {
  const {
    Icon,
    IconButton,
    Button,
    Avatar
  } = window.OrvionDesignSystem_1d6ac1;
  function LiveBadge({
    viewers
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 26,
        padding: '0 10px',
        borderRadius: 6,
        background: 'var(--live-red)',
        color: 'var(--white)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.04em'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "live-dot",
      style: {
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: 'var(--white)'
      }
    }), "AO VIVO"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 26,
        padding: '0 10px',
        borderRadius: 6,
        background: 'var(--room-overlay)',
        color: 'var(--white)',
        fontSize: 12,
        fontWeight: 500,
        fontVariantNumeric: 'tabular-nums'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "eye",
      size: 14
    }), viewers.toLocaleString('pt-PT')));
  }
  function Player({
    viewers,
    muted,
    onMute
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        aspectRatio: '16 / 9',
        background: 'var(--room-player)',
        overflow: 'hidden',
        flex: 'none'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 8,
        color: 'var(--gray-500)',
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "video",
      size: 28
    }), "V\xEDdeo do webinar"), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 12,
        left: 12
      }
    }, /*#__PURE__*/React.createElement(LiveBadge, {
      viewers: viewers
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        right: 10,
        bottom: 10,
        display: 'flex',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: muted ? 'volume-x' : 'volume-2',
      variant: "ghost",
      size: 36,
      label: "Som",
      onClick: onMute,
      style: {
        background: 'var(--room-overlay)',
        color: 'var(--white)'
      }
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "maximize",
      variant: "ghost",
      size: 36,
      label: "Ecr\xE3 inteiro",
      style: {
        background: 'var(--room-overlay)',
        color: 'var(--white)'
      }
    })));
  }
  function OfferCard({
    seconds,
    onBuy
  }) {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return /*#__PURE__*/React.createElement("div", {
      className: "slide-up",
      style: {
        margin: '0 12px',
        padding: 14,
        borderRadius: 20,
        background: 'var(--room-offer-bg)',
        color: 'var(--room-offer-ink)',
        boxShadow: 'inset 0 0 0 1px var(--room-offer-line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--accent)',
        letterSpacing: '.04em'
      }
    }, "OFERTA ESPECIAL"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "timer",
      size: 14
    }), m, ":", s)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.3,
        letterSpacing: '-0.02em'
      }
    }, "M\xE9todo Webinar Perp\xE9tuo", /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontSize: 13,
        fontWeight: 400,
        color: 'var(--room-ink-2)',
        marginTop: 2
      }
    }, "de ", /*#__PURE__*/React.createElement("s", null, "497 \u20AC"), " por 197 \u20AC \xB7 s\xF3 durante a live")), /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      size: "lg",
      fullWidth: true,
      iconRight: "arrow-right",
      onClick: onBuy
    }, "Quero garantir a minha vaga"));
  }
  function ChatMessage({
    m
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "msg-in",
      style: {
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start'
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      name: m.name,
      size: 28,
      ring: false,
      style: {
        background: m.host ? 'var(--accent)' : 'var(--room-avatar)',
        color: m.host ? 'var(--white)' : 'var(--room-avatar-ink)',
        fontSize: 11,
        fontWeight: 600
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0,
        fontSize: 13,
        lineHeight: 1.45,
        color: 'var(--room-msg)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600,
        color: m.host ? 'var(--room-host)' : 'var(--room-ink)',
        marginRight: 6
      }
    }, m.name, m.host && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 4,
        background: 'var(--accent)',
        color: 'var(--white)',
        verticalAlign: 1
      }
    }, "Apresentador")), m.text));
  }
  function PurchaseToast({
    item
  }) {
    if (!item) return null;
    return /*#__PURE__*/React.createElement("div", {
      key: item.id,
      className: "toast-in",
      style: {
        position: 'absolute',
        left: 12,
        right: 12,
        top: 50,
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 14,
        background: 'var(--white)',
        color: 'var(--navy)',
        boxShadow: 'var(--shadow-float)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 32,
        height: 32,
        flex: 'none',
        borderRadius: '50%',
        background: 'var(--accent-soft)',
        color: 'var(--accent-strong)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "shopping-bag",
      size: 16
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        lineHeight: 1.35
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontWeight: 600
      }
    }, item.name), " de ", item.city, " acabou de garantir a vaga"));
  }
  Object.assign(window, {
    LiveBadge,
    Player,
    OfferCard,
    ChatMessage,
    PurchaseToast
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/webinar_room/RoomParts.jsx", error: String((e && e.message) || e) }); }

// ui_kits/webinar_room/RoomScreen.jsx
try { (() => {
(() => {
  const {
    Icon,
    IconButton
  } = window.OrvionDesignSystem_1d6ac1;
  const SCRIPT = [{
    name: 'Amado',
    host: true,
    text: 'Bem-vindos! Escrevam de onde estão a assistir 👋'
  }, {
    name: 'Carla M.',
    text: 'Lisboa aqui!'
  }, {
    name: 'Rui P.',
    text: 'Porto 🙌'
  }, {
    name: 'Juliana S.',
    text: 'São Paulo, a acompanhar'
  }, {
    name: 'Tiago F.',
    text: 'Isto funciona para infoprodutos?'
  }, {
    name: 'Amado',
    host: true,
    text: 'Funciona sim, Tiago. Já mostro um caso real.'
  }, {
    name: 'Beatriz L.',
    text: 'Muito bom o conteúdo'
  }, {
    name: 'Marcos A.',
    text: 'Qual é o link da oferta?'
  }, {
    name: 'Amado',
    host: true,
    text: 'O botão da oferta já está abaixo do vídeo 👇'
  }, {
    name: 'Sofia R.',
    text: 'Acabei de entrar, garantido!'
  }];
  const BUYERS = [{
    name: 'Mariana',
    city: 'Lisboa'
  }, {
    name: 'Pedro',
    city: 'Braga'
  }, {
    name: 'Ana',
    city: 'Curitiba'
  }, {
    name: 'João',
    city: 'Coimbra'
  }];
  function RoomScreen({
    theme = 'dark',
    onToggleTheme
  }) {
    const [msgs, setMsgs] = React.useState(SCRIPT.slice(0, 3).map((m, i) => ({
      ...m,
      id: i
    })));
    const [viewers, setViewers] = React.useState(1284);
    const [offer, setOffer] = React.useState(false);
    const [secs, setSecs] = React.useState(15 * 60);
    const [toast, setToast] = React.useState(null);
    const [muted, setMuted] = React.useState(false);
    const [draft, setDraft] = React.useState('');
    const listRef = React.useRef(null);
    const idx = React.useRef(3);
    React.useEffect(() => {
      const t1 = setInterval(() => {
        const m = SCRIPT[idx.current % SCRIPT.length];
        idx.current += 1;
        setMsgs(list => [...list.slice(-30), {
          ...m,
          id: Date.now()
        }]);
        setViewers(v => v + Math.round(Math.random() * 6 - 2));
      }, 2400);
      const t2 = setTimeout(() => setOffer(true), 6000);
      return () => {
        clearInterval(t1);
        clearTimeout(t2);
      };
    }, []);
    React.useEffect(() => {
      if (!offer) return;
      const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
      let b = 0;
      const p = setInterval(() => {
        setToast({
          ...BUYERS[b % BUYERS.length],
          id: Date.now()
        });
        b += 1;
        setTimeout(() => setToast(null), 3200);
      }, 7000);
      return () => {
        clearInterval(t);
        clearInterval(p);
      };
    }, [offer]);
    React.useEffect(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, [msgs]);
    const send = e => {
      e.preventDefault();
      if (!draft.trim()) return;
      setMsgs(list => [...list, {
        name: 'Você',
        text: draft.trim(),
        id: Date.now()
      }]);
      setDraft('');
    };
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--room-bg)',
        color: 'var(--room-ink)',
        transition: 'background var(--duration-base) var(--ease-standard)'
      }
    }, /*#__PURE__*/React.createElement(PurchaseToast, {
      item: toast
    }), /*#__PURE__*/React.createElement(Player, {
      viewers: viewers,
      muted: muted,
      onMute: () => setMuted(m => !m)
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '14px 12px 12px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        borderBottom: '1px solid var(--room-line)',
        flex: 'none'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        fontSize: 17,
        fontWeight: 600,
        lineHeight: 1.3,
        letterSpacing: '-0.02em',
        textWrap: 'pretty'
      }
    }, "Como vender todos os dias com webinars autom\xE1ticos"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--room-ink-2)'
      }
    }, "Amado \xB7 Novawebinar")), /*#__PURE__*/React.createElement(IconButton, {
      icon: theme === 'dark' ? 'sun' : 'moon',
      variant: "ghost",
      size: 40,
      label: theme === 'dark' ? 'Modo claro' : 'Modo escuro',
      onClick: onToggleTheme,
      style: {
        color: 'var(--room-ink)',
        background: 'var(--room-surface)'
      }
    })), offer && /*#__PURE__*/React.createElement("div", {
      style: {
        paddingTop: 12,
        flex: 'none'
      }
    }, /*#__PURE__*/React.createElement(OfferCard, {
      seconds: secs,
      onBuy: () => setToast({
        name: 'Você',
        city: 'aqui',
        id: Date.now()
      })
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '12px 16px 6px',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--room-ink-2)',
        flex: 'none'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "message-circle",
      size: 14
    }), "Chat ao vivo"), /*#__PURE__*/React.createElement("div", {
      ref: listRef,
      style: {
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '4px 16px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }
    }, msgs.map(m => /*#__PURE__*/React.createElement(ChatMessage, {
      key: m.id,
      m: m
    }))), /*#__PURE__*/React.createElement("form", {
      onSubmit: send,
      style: {
        display: 'flex',
        gap: 8,
        padding: '10px 12px 14px',
        borderTop: '1px solid var(--room-line)',
        background: 'var(--room-bg)',
        flex: 'none'
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: draft,
      onChange: e => setDraft(e.target.value),
      placeholder: "Escreva uma mensagem\u2026",
      style: {
        flex: 1,
        minWidth: 0,
        height: 44,
        padding: '0 16px',
        borderRadius: 999,
        border: '1px solid var(--room-line)',
        background: 'var(--room-surface)',
        color: 'var(--room-ink)',
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        outline: 'none'
      }
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "send",
      variant: "accent",
      size: 44,
      label: "Enviar",
      onClick: send
    })));
  }
  Object.assign(window, {
    RoomScreen
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/webinar_room/RoomScreen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.BarChart = __ds_scope.BarChart;

__ds_ns.Heatmap = __ds_scope.Heatmap;

__ds_ns.LineChart = __ds_scope.LineChart;

__ds_ns.RangeChart = __ds_scope.RangeChart;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.AvatarStack = __ds_scope.AvatarStack;

__ds_ns.Metric = __ds_scope.Metric;

__ds_ns.ProgressRow = __ds_scope.ProgressRow;

__ds_ns.WidgetCard = __ds_scope.WidgetCard;

__ds_ns.FlowNode = __ds_scope.FlowNode;

__ds_ns.BottomNav = __ds_scope.BottomNav;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.NavTabs = __ds_scope.NavTabs;

__ds_ns.SideRail = __ds_scope.SideRail;

})();
