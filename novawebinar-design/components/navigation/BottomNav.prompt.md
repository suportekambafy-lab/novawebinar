Mobile bottom tab bar for the Novawebinar app (Painel · Webinars · Calendário · Definições); active tab is orange.
```jsx
<BottomNav value="painel" onChange={setTab} items={[
  {id:'painel',label:'Painel',icon:'layout-grid'},
  {id:'webinars',label:'Webinars',icon:'clapperboard'},
  {id:'calendario',label:'Calendário',icon:'calendar-days'},
  {id:'definicoes',label:'Definições',icon:'sliders-horizontal'}]} />
```
- 4 tabs max; hit targets ≥52px tall.
