(() => {
const { NavTabs, AvatarStack, Button, IconButton, Avatar } = window.OrvionDesignSystem_1d6ac1;

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Painel', icon: 'layout-grid' },
  { id: 'analytics', label: 'Análises', icon: 'square-activity' },
  { id: 'pulse', label: 'Ao vivo', icon: 'radio' },
  { id: 'data', label: 'Dados', icon: 'database' },
];
const TEAM = [
  { src: '../../assets/avatars/avatar-1.png', name: 'Leo Park' },
  { src: '../../assets/avatars/avatar-2.png', name: 'Sam Reid' },
  { src: '../../assets/avatars/avatar-3.png', name: 'Ana Ito' },
  {}, {}, {}, {}, {}, {},
];

function TopBar({ tab, onTab }) {
  return (
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 32px', minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.04em', whiteSpace: 'nowrap' }}>Novawebinar</div>
        <NavTabs items={NAV_ITEMS} value={tab} onChange={onTab} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        <AvatarStack people={TEAM} max={3} size={40} />
        <Button variant="light" icon="share">Partilhado</Button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
        <IconButton icon="bell-ring" variant="light" label="Notificações" />
        <Avatar src="../../assets/avatars/avatar-user.png" name="Você" size={40} ring={false} />
      </div>
    </header>
  );
}

Object.assign(window, { TopBar });
})();
