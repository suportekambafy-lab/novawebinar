(() => {
const { Icon, IconButton, Button, Avatar } = window.OrvionDesignSystem_1d6ac1;

function LiveBadge({ viewers }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 6, background: 'var(--live-red)', color: 'var(--white)', fontSize: 11, fontWeight: 700, letterSpacing: '.04em' }}>
        <span className="live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--white)' }}></span>AO VIVO
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 6, background: 'var(--room-overlay)', color: 'var(--white)', fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
        <Icon name="eye" size={14} />{viewers.toLocaleString('pt-PT')}
      </span>
    </div>
  );
}

function Player({ viewers, muted, onMute }) {
  return (
    <div style={{ position: 'relative', aspectRatio: '16 / 9', background: 'var(--room-player)', overflow: 'hidden', flex: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--gray-500)', fontSize: 12 }}>
        <Icon name="video" size={28} />Vídeo do webinar
      </div>
      <div style={{ position: 'absolute', top: 12, left: 12 }}><LiveBadge viewers={viewers} /></div>
      <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 6 }}>
        <IconButton icon={muted ? 'volume-x' : 'volume-2'} variant="ghost" size={36} label="Som" onClick={onMute} style={{ background: 'var(--room-overlay)', color: 'var(--white)' }} />
        <IconButton icon="maximize" variant="ghost" size={36} label="Ecrã inteiro" style={{ background: 'var(--room-overlay)', color: 'var(--white)' }} />
      </div>
    </div>
  );
}

function OfferCard({ seconds, onBuy }) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return (
    <div className="slide-up" style={{ margin: '0 12px', padding: 14, borderRadius: 20, background: 'var(--room-offer-bg)', color: 'var(--room-offer-ink)', boxShadow: 'inset 0 0 0 1px var(--room-offer-line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '.04em' }}>OFERTA ESPECIAL</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}><Icon name="timer" size={14} />{m}:{s}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.02em' }}>Método Webinar Perpétuo<span style={{ display: 'block', fontSize: 13, fontWeight: 400, color: 'var(--room-ink-2)', marginTop: 2 }}>de <s>497 €</s> por 197 € · só durante a live</span></div>
      <Button variant="accent" size="lg" fullWidth iconRight="arrow-right" onClick={onBuy}>Quero garantir a minha vaga</Button>
    </div>
  );
}

function ChatMessage({ m }) {
  return (
    <div className="msg-in" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Avatar name={m.name} size={28} ring={false} style={{ background: m.host ? 'var(--accent)' : 'var(--room-avatar)', color: m.host ? 'var(--white)' : 'var(--room-avatar-ink)', fontSize: 11, fontWeight: 600 }} />
      <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--room-msg)' }}>
        <span style={{ fontWeight: 600, color: m.host ? 'var(--room-host)' : 'var(--room-ink)', marginRight: 6 }}>{m.name}{m.host && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--accent)', color: 'var(--white)', verticalAlign: 1 }}>Apresentador</span>}</span>
        {m.text}
      </div>
    </div>
  );
}

function PurchaseToast({ item }) {
  if (!item) return null;
  return (
    <div key={item.id} className="toast-in" style={{ position: 'absolute', left: 12, right: 12, top: 50, zIndex: 5, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: 'var(--white)', color: 'var(--navy)', boxShadow: 'var(--shadow-float)' }}>
      <span style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="shopping-bag" size={16} /></span>
      <div style={{ fontSize: 12, lineHeight: 1.35 }}><b style={{ fontWeight: 600 }}>{item.name}</b> de {item.city} acabou de garantir a vaga</div>
    </div>
  );
}

Object.assign(window, { LiveBadge, Player, OfferCard, ChatMessage, PurchaseToast });
})();
