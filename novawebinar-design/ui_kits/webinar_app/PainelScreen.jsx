(() => {
const { Button, IconButton, Icon, Avatar, Tag, WidgetCard } = window.OrvionDesignSystem_1d6ac1;

function AppHeader({ unread = 1 }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 16px', background: 'var(--white)', borderBottom: '1px solid var(--border-hairline)', flex: 'none' }}>
      <IconButton icon="menu" variant="ghost" size={44} label="Menu" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <IconButton icon="bell" variant="ghost" size={44} label="Notificações" />
          {unread > 0 && <Tag variant="accent" pill style={{ position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, padding: '0 5px', fontWeight: 600, boxShadow: '0 0 0 2px var(--white)' }}>{unread}</Tag>}
        </div>
        <Avatar name="Amado" size={40} ring={false} style={{ background: 'var(--accent)', color: 'var(--white)', fontWeight: 600, fontSize: 16 }} />
      </div>
    </header>
  );
}

function StudioHero({ onContinue }) {
  return (
    <section style={{ position: 'relative', overflow: 'hidden', isolation: 'isolate', clipPath: 'inset(0 round 32px)', transform: 'translateZ(0)', borderRadius: 'var(--radius-card)', background: 'var(--accent)', color: 'var(--white)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span aria-hidden="true" style={{ position: 'absolute', right: -20, top: 30, width: 180, height: 180, borderRadius: '50%', background: 'var(--accent-200)', filter: 'blur(50px)', opacity: 0.35, zIndex: -1 }} />
      <span aria-hidden="true" style={{ position: 'absolute', right: -30, bottom: -50, width: 180, height: 180, borderRadius: '50%', background: 'repeating-linear-gradient(-45deg,rgba(255,255,255,.5) 0 1.5px,transparent 1.5px 7px)', opacity: 0.35, zIndex: -1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--white)', fontWeight: 500 }}>
        <Icon name="radio" size={16} color="var(--white)" />Estúdio Novawebinar
      </div>
      <h2 style={{ margin: 0, fontSize: 28, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.025em', textWrap: 'balance' }}>Transforme audiência em <span style={{ display: 'inline-block', background: 'var(--white)', color: 'var(--navy)', padding: '1px 10px 3px', borderRadius: 12, lineHeight: 1.25 }}>vendas</span></h2>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--white)', opacity: 0.92, textWrap: 'pretty' }}>Prepare a próxima sessão e mantenha vídeo, interações e oferta alinhados.</p>
      <div style={{ marginTop: 6 }}><Button variant="white" iconRight="arrow-right" onClick={onContinue} style={{ color: 'var(--accent-deep)', fontWeight: 600 }}>Continuar configuração</Button></div>
    </section>
  );
}

function StatCard({ label, value, unit, icon }) {
  return (
    <WidgetCard variant="white" padding={18} style={{ gap: 14, borderRadius: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{label}</span>
        <span style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={16} /></span>
      </div>
      <div style={{ fontSize: 34, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>{value}{unit && <span style={{ fontSize: 16, marginLeft: 3, color: 'var(--text-secondary)' }}>{unit}</span>}</div>
    </WidgetCard>
  );
}

function PainelScreen({ name = 'Amado', onNew, onContinue }) {
  return (
    <div style={{ padding: '24px 16px 96px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.1 }}>Olá, {name}</h1>
        <p style={{ margin: 0, fontSize: 16, color: 'var(--text-secondary)' }}>Resumo operacional dos seus webinars.</p>
      </div>
      <div><Button variant="accent" size="lg" icon="plus" onClick={onNew}>Novo webinar</Button></div>
      <StudioHero onContinue={onContinue} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        <StatCard label="Participantes reais" value="2" icon="users" />
        <StatCard label="Webinars criados" value="3" icon="clapperboard" />
        <StatCard label="Tempo médio" value="18" unit="min" icon="trending-up" />
        <StatCard label="Conversão no CTA" value="4,2" unit="%" icon="mouse-pointer-click" />
      </div>
    </div>
  );
}

function EmptyTab({ label }) {
  return (
    <div style={{ padding: '24px 16px 96px' }}>
      <h1 style={{ margin: '0 0 16px', fontSize: 32, fontWeight: 600, letterSpacing: '-0.035em' }}>{label}</h1>
      <div style={{ borderRadius: 24, background: 'var(--surface-card)', border: '1px dashed var(--gray-300)', padding: 24, fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>Ecrã ainda não definido.</div>
    </div>
  );
}

Object.assign(window, { AppHeader, PainelScreen, EmptyTab });
})();
