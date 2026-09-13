HeatGrid — a cell map (bin map, day map) when a list would hide the shape of the problem.
```jsx
<HeatGrid columns={12} cells={bins.map(b=>({key:b.id,label:b.id,meta:b.item||'Empty',tone:b.item?(b.low?4:5):'var(--data-track)'}))} legend={[{label:'Stocked',tone:5},{label:'Low',tone:4}]} onSelect={b=>open(b.key)}/>
```
- Use categorical `tone` per cell for states (stocked/low/empty); use `value`+`max` shading only for one continuous measure.
- Always pair with a legend and a drill; the peek is a courtesy, never the only route to the detail.
