Top navigation as individual pills (not a segmented track); active = orange pill with white text.
```jsx
<NavTabs value="dashboard" onChange={setTab} items={[
  {id:'dashboard',label:'Dashboard',icon:'layout-grid'},
  {id:'analytics',label:'Analytics',icon:'square-activity'},
  {id:'pulse',label:'Pulse',icon:'activity'},
  {id:'data',label:'Data',icon:'database'}]} />
```
