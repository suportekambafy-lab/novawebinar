(() => {
const { Breadcrumb, IconButton, Chip, Button, SideRail } = window.OrvionDesignSystem_1d6ac1;

const RAIL_ITEMS = [
  { id: 'search', icon: 'search', label: 'Pesquisar' },
  { id: 'pen', icon: 'pen-tool', label: 'Editar' },
  { id: 'chat', icon: 'message-circle', label: 'Comentários' },
  { id: 'clip', icon: 'clipboard', label: 'Notas' },
  { id: 'settings', icon: 'settings', label: 'Definições' },
];

function PageShell({ crumbs, title, toolbar, children }) {
  const [tool, setTool] = React.useState('search');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr)', columnGap: 20, rowGap: 20, marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <IconButton icon="arrow-left" variant="white" label="Voltar" />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {crumbs && <Breadcrumb items={crumbs} />}
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{title}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{toolbar}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' }}>
        <SideRail items={RAIL_ITEMS} value={tool} onChange={setTool} />
        <IconButton icon="headphones" variant="white" label="Suporte" />
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
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

Object.assign(window, { PageShell, useContainerWidth });
})();
