The container for every dashboard widget: light-gray card on the gray canvas, no border, no shadow.
```jsx
<WidgetCard title="Activity" actions={[{icon:'sliders-vertical'},{icon:'arrow-up-right'}]}>
  <Metric caption="Worked this week" value="186" />
</WidgetCard>
```
- `inverse` = black hero card ("Today revenue"); `glass` = frosted overlay card over imagery.
