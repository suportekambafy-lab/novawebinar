(() => {
const { WidgetCard, Metric, BarChart, RangeChart, LineChart, ProgressRow, IconButton, Icon, Chip, Button } = window.OrvionDesignSystem_1d6ac1;

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function ProVersionCard({ onClose }) {
  return (
    <section style={{ position: 'relative', gridRow: 'span 2', borderRadius: 32, background: 'var(--surface-card)', overflow: 'hidden', minHeight: 520 }}>
      <img src="../../assets/imagery/spheres.png" alt="" style={{ position: 'absolute', top: 30, right: 0, width: '88%', objectFit: 'cover', objectPosition: 'left top', height: 300, mixBlendMode: 'multiply', WebkitMaskImage: 'linear-gradient(to right, transparent, #000 30%), linear-gradient(to bottom, transparent, #000 25%)', WebkitMaskComposite: 'source-in', maskImage: 'linear-gradient(to right, transparent, #000 30%), linear-gradient(to bottom, transparent, #000 25%)', maskComposite: 'intersect' }} />
      <div style={{ position: 'absolute', top: 22, left: 24, fontSize: 18, letterSpacing: '-0.02em' }}>Versão Pro</div>
      <IconButton icon="x" variant="white" size={36} label="Fechar" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }} />
      <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, top: 190, borderRadius: 28, background: 'var(--surface-glass)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', padding: 18, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}><Icon name="chart-no-axes-column" size={15} />Vantagens</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>Os seus ganhos com a versão Pro</div>
          </div>
          <IconButton icon="arrow-up-right" variant="white" size={34} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26, fontSize: 30, letterSpacing: '-0.04em' }}>
          <span style={{ whiteSpace: 'nowrap' }}>30-45<small style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>anos</small></span>
          <span style={{ whiteSpace: 'nowrap' }}>12-21<small style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>anos</small></span>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 6, alignItems: 'end', marginTop: 16, fontSize: 13 }}>
          <div style={{ height: '82%', background: 'var(--accent)', color: 'var(--white)', borderRadius: 16, padding: '10px 8px', minWidth: 0, overflow: 'hidden', fontSize: 'clamp(11px,1.1vw,15px)', letterSpacing: '-0.03em' }}>12.233<div style={{ fontSize: 9 }}>vendas</div></div>
          <div style={{ height: '36%', background: 'var(--overlay-light)', borderRadius: 16, padding: '10px 8px', minWidth: 0, overflow: 'hidden', fontSize: 'clamp(11px,1.1vw,15px)' }}>6%<div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>crescimento</div></div>
          <div style={{ height: '64%', background: 'var(--accent)', color: 'var(--white)', borderRadius: 16, padding: '10px 8px', minWidth: 0, overflow: 'hidden', fontSize: 'clamp(11px,1.1vw,15px)', letterSpacing: '-0.03em' }}>33.337<div style={{ fontSize: 9 }}>vendas</div></div>
          <div style={{ height: '100%', background: 'var(--overlay-light)', borderRadius: 16, padding: '10px 8px', minWidth: 0, overflow: 'hidden', fontSize: 'clamp(11px,1.1vw,15px)' }}>9%<div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>crescimento</div></div>
        </div>
      </div>
    </section>
  );
}

function DashboardScreen() {
  const [pro, setPro] = React.useState(true);
  const [hl, setHl] = React.useState(4);
  const [gridRef, w] = useContainerWidth();
  const wide = w >= 1180;
  const cols = wide ? (pro ? '1.05fr 1fr 1fr 1fr' : 'repeat(3,minmax(0,1fr))') : 'repeat(2,minmax(0,1fr))';
  const actions = [{ icon: 'sliders-vertical' }, { icon: 'arrow-up-right' }];
  const toolbar = (
    <>
      <IconButton icon="search" variant="light" />
      <IconButton icon="sliders-vertical" variant="light" />
      <IconButton icon="calendar" variant="accent" />
      <Chip label="22/06/2026" />
      <Chip label="26/06/2026" />
      <Button variant="light" icon="plus">Novo widget</Button>
      <Button variant="light">Criar relatório</Button>
    </>
  );
  return (
    <PageShell crumbs={[{ label: 'Webinars' }, { label: 'Método Perpétuo' }]} title="Desempenho dos webinars" toolbar={toolbar}>
      <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: cols, gridAutoFlow: 'row dense', gap: 12 }}>
        {pro && <ProVersionCard onClose={() => setPro(false)} />}
        <WidgetCard title="Inscrições" actions={actions}>
          <Metric caption="Novos inscritos esta semana" value="186" />
          <BarChart height={130} highlight={hl} tag="12.464" data={[22, 34, 30, 52, 100, 58, 48].map((v, i) => ({ label: DAYS[i], value: v }))} />
          <div style={{ display: 'flex', gap: 4 }}>{DAYS.map((d, i) => <span key={d} onClick={() => setHl(i)} style={{ flex: 1, height: 4, borderRadius: 4, cursor: 'pointer', background: i === hl ? 'var(--accent)' : 'transparent' }} />)}</div>
        </WidgetCard>
        <WidgetCard title="Comparação de receita" style={{ gridColumn: 'span 2' }} actions={[{ icon: 'sliders-vertical', variant: 'accent' }, { icon: 'message-circle-more' }, { icon: 'arrow-up-right' }]}>
          <Metric caption="Desde o início" value="29,48" unit="k€" />
          <RangeChart upperLabel="2023" lowerLabel="2024" highlight={3} tag="+9%" upper={[40, 36, 50, 54, 58, 64, 72]} lower={[22, 12, 20, 10, 34, 44, 58]} labels={DAYS} height={130} />
        </WidgetCard>
        <WidgetCard title="Vendas na oferta" style={{ gridColumn: 'span 2' }} actions={actions}>
          <div style={{ display: 'grid', gridTemplateColumns: w < 700 ? 'minmax(0,1fr)' : '170px minmax(0,1fr)', gap: 24, alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Metric caption="Vendas da semana" value="2.788" unit="€" sub="Meta: 4.320 €" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[['34', 'Compras'], ['28', 'Carrinhos abertos']].map(([n, l]) => (
                  <div key={l} style={{ display: 'flex', gap: 10, alignItems: 'center', height: 32, padding: '0 12px', borderRadius: 10, background: 'var(--gray-150)', fontSize: 11 }}><span style={{ fontSize: 13 }}>{n}</span><span style={{ color: 'var(--text-secondary)' }}>{l}</span></div>
                ))}
              </div>
            </div>
            <LineChart values={[18, 30, 22, 46, 38, 62, 80]} highlight={3} tag="34.533" labels={DAYS} height={130} />
          </div>
        </WidgetCard>
        <WidgetCard title="Presença" actions={[{ icon: 'arrow-up-right' }]}>
          <Metric caption="Tempo médio assistido" value="42" unit="min" sub="de 58 min de vídeo" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
            <ProgressRow label="Ao vivo" value={72} />
            <ProgressRow label="Replay" value={28} />
          </div>
        </WidgetCard>
      </div>
    </PageShell>
  );
}

Object.assign(window, { DashboardScreen });
})();
