(() => {
const { WidgetCard, Metric, BarChart, Heatmap, IconButton, Chip, Button } = window.OrvionDesignSystem_1d6ac1;

const FUNNEL = ['Visitas', 'Inscritos', 'Presentes', 'Oferta', 'Checkout', 'Compras'];
const ORDER_ROWS = [
  { label: '', lines: [[null, null, null, null, null, null, 0, null, null, null]] },
  { label: 'Facebook', lines: [[null, null, null, 0, 0, 0, 3, 0, null, null], [null, null, 1, 0, 1, 2, 4, 1, 0, null]] },
  { label: 'Instagram', lines: [[1, 1, 4, 4, 4, 4, 4, 1, 0, null], [null, 0, 2, 1, 2, 4, 4, 0, null, null]] },
  { label: 'Tiktok', lines: [[null, null, 0, 1, 2, 4, 0, 0, null, null], [null, null, null, 0, 2, 4, 1, 0, null, null]] },
  { label: 'Whatsapp', lines: [[null, null, null, null, 0, 2, 0, null, null, null], [null, null, null, null, null, 0, null, null, null, null]] },
];

function RevenueCard({ inverse }) {
  return (
    <WidgetCard variant={inverse ? 'inverse' : 'default'} title="Receita de hoje" actions={[{ icon: 'arrow-up-right', variant: inverse ? 'white' : 'light' }]}>
      <Metric inverse={inverse} value="3,7" unit="k€" size="lg" sub="Pagamento de 4,1 k€ disponível em breve" style={{ marginTop: 10 }} />
    </WidgetCard>
  );
}

function AnalyticsScreen() {
  const [period, setPeriod] = React.useState('Mensal');
  const cyc = () => setPeriod(p => (p === 'Mensal' ? 'Semanal' : 'Mensal'));
  const toolbar = (
    <>
      <Chip caption="Data" label="18 jan – 29 jan 2026" icon="calendar" knob />
      <Chip label="Funil" icon="sliders-horizontal" knob />
      <Button variant="accent" iconRight="arrow-up-right">Exportar CSV</Button>
    </>
  );
  const [gridRef, w] = useContainerWidth();
  const narrow = w < 1100;
  const half = narrow ? 'span 6' : 'span 3';
  const third = w < 760 ? 'span 6' : 'span 2';
  const head = <Chip label={period} size="sm" variant="chip" onClick={cyc} />;
  return (
    <PageShell title={<>A sua análise<br />de vendas</>} toolbar={toolbar}>
      <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 12 }}>
        <div style={{ gridColumn: third }}><RevenueCard inverse /></div>
        <div style={{ gridColumn: third }}><RevenueCard /></div>
        <div style={{ gridColumn: third }}><RevenueCard /></div>
        <WidgetCard title="Funil de vendas" subtitle="Da visita à compra" headerRight={head} actions={[{ icon: 'sliders-horizontal' }]} style={{ gridColumn: half }}>
          <BarChart height={250} highlight={3} tag="3.012" barRadius={16} gap={14} data={[100, 62, 41, 30, 12, 7].map((v, i) => ({ label: FUNNEL[i], value: v }))} />
        </WidgetCard>
        <WidgetCard title="Inscrições" subtitle="Por rede social" headerRight={head} actions={[{ icon: 'sliders-horizontal' }]} style={{ gridColumn: half }}>
          <Heatmap rows={ORDER_ROWS} cell={26} gap={4} labelWidth={84} />
        </WidgetCard>
      </div>
    </PageShell>
  );
}

function PlaceholderScreen({ name }) {
  return (
    <PageShell title={name}>
      <div style={{ height: 420, borderRadius: 32, background: 'var(--surface-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', padding: 24 }}>
        O ecrã {name} ainda não foi definido.
      </div>
    </PageShell>
  );
}

Object.assign(window, { AnalyticsScreen, PlaceholderScreen });
})();
