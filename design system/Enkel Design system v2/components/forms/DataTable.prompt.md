Data table — hairline rows, no zebra, mono figures right-aligned, optional inline drill-down.
```jsx
<DataTable columns={[{key:'club',label:'Club'},{key:'occ',label:'Occupancy',numeric:true},{key:'status',label:'Status',render:r=><StatusBadge status={r.status} size="chip"/>}]}
  rows={clubs} onRowClick={r=>setOpen(open===r.id?null:r.id)} expandedKey={open} renderExpanded={r=><ClubDetail club={r}/>} />
```
- `numeric:true` for every figure column; `muted:true` for codes/ids.
- Inline expand for "a little more"; drawer for "a lot more"; a full page (with Breadcrumb) when the thing has its own URL.
- `density="compact"` for long operational lists, default `balanced` for dashboards.
