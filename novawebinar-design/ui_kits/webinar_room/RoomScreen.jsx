(() => {
const { Icon, IconButton } = window.OrvionDesignSystem_1d6ac1;

const SCRIPT = [
  { name: 'Amado', host: true, text: 'Bem-vindos! Escrevam de onde estão a assistir 👋' },
  { name: 'Carla M.', text: 'Lisboa aqui!' },
  { name: 'Rui P.', text: 'Porto 🙌' },
  { name: 'Juliana S.', text: 'São Paulo, a acompanhar' },
  { name: 'Tiago F.', text: 'Isto funciona para infoprodutos?' },
  { name: 'Amado', host: true, text: 'Funciona sim, Tiago. Já mostro um caso real.' },
  { name: 'Beatriz L.', text: 'Muito bom o conteúdo' },
  { name: 'Marcos A.', text: 'Qual é o link da oferta?' },
  { name: 'Amado', host: true, text: 'O botão da oferta já está abaixo do vídeo 👇' },
  { name: 'Sofia R.', text: 'Acabei de entrar, garantido!' },
];
const BUYERS = [{ name: 'Mariana', city: 'Lisboa' }, { name: 'Pedro', city: 'Braga' }, { name: 'Ana', city: 'Curitiba' }, { name: 'João', city: 'Coimbra' }];

function RoomScreen({ theme = 'dark', onToggleTheme }) {
  const [msgs, setMsgs] = React.useState(SCRIPT.slice(0, 3).map((m, i) => ({ ...m, id: i })));
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
      setMsgs(list => [...list.slice(-30), { ...m, id: Date.now() }]);
      setViewers(v => v + Math.round(Math.random() * 6 - 2));
    }, 2400);
    const t2 = setTimeout(() => setOffer(true), 6000);
    return () => { clearInterval(t1); clearTimeout(t2); };
  }, []);

  React.useEffect(() => {
    if (!offer) return;
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    let b = 0;
    const p = setInterval(() => { setToast({ ...BUYERS[b % BUYERS.length], id: Date.now() }); b += 1; setTimeout(() => setToast(null), 3200); }, 7000);
    return () => { clearInterval(t); clearInterval(p); };
  }, [offer]);

  React.useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

  const send = e => {
    e.preventDefault();
    if (!draft.trim()) return;
    setMsgs(list => [...list, { name: 'Você', text: draft.trim(), id: Date.now() }]);
    setDraft('');
  };

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--room-bg)', color: 'var(--room-ink)', transition: 'background var(--duration-base) var(--ease-standard)' }}>
      <PurchaseToast item={toast} />
      <Player viewers={viewers} muted={muted} onMute={() => setMuted(m => !m)} />
      <div style={{ padding: '14px 12px 12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10, borderBottom: '1px solid var(--room-line)', flex: 'none' }}><div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.02em', textWrap: 'pretty' }}>Como vender todos os dias com webinars automáticos</h1>
        <div style={{ fontSize: 12, color: 'var(--room-ink-2)' }}>Amado · Novawebinar</div>
      </div><IconButton icon={theme === 'dark' ? 'sun' : 'moon'} variant="ghost" size={40} label={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} onClick={onToggleTheme} style={{ color: 'var(--room-ink)', background: 'var(--room-surface)' }} /></div>
      {offer && <div style={{ paddingTop: 12, flex: 'none' }}><OfferCard seconds={secs} onBuy={() => setToast({ name: 'Você', city: 'aqui', id: Date.now() })} /></div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px 6px', fontSize: 12, fontWeight: 600, color: 'var(--room-ink-2)', flex: 'none' }}><Icon name="message-circle" size={14} />Chat ao vivo</div>
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msgs.map(m => <ChatMessage key={m.id} m={m} />)}
      </div>
      <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: '10px 12px 14px', borderTop: '1px solid var(--room-line)', background: 'var(--room-bg)', flex: 'none' }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Escreva uma mensagem…" style={{ flex: 1, minWidth: 0, height: 44, padding: '0 16px', borderRadius: 999, border: '1px solid var(--room-line)', background: 'var(--room-surface)', color: 'var(--room-ink)', fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none' }} />
        <IconButton icon="send" variant="accent" size={44} label="Enviar" onClick={send} />
      </form>
    </div>
  );
}

Object.assign(window, { RoomScreen });
})();
