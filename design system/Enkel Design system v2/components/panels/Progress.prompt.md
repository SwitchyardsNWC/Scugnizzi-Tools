Progress bar per phase and KPI strip cells.
```jsx
<Progress done={9} total={14} required={2} />
<KpiStrip><Kpi value="7" label="Active projects" /><Kpi value="3" label="Blocked" tone="blocked" hint="2 on you" /></KpiStrip>
```
- Always wrap cells in `KpiStrip` — it reflows to fewer columns instead of squeezing, and aligns value / label / hint across cells so a two-line label can't knock its neighbours out of line.
- `columns={4}` pins a count; default reflows at 150px per cell.
