BarList — the bar chart, as a list.
```jsx
<BarList items={[{key:'psc',label:'Ponce City',value:92,meta:'cap 120'},{key:'wes',label:'Westside',value:74}]} format={v=>v+'%'} max={100} onSelect={i=>go(i.key)}/>
```
- Sort by value before passing unless the order means something (phases, days).
- One tone per list. A per-row `tone` only to flag the row that matters (e.g. 4 = brick for the one over capacity).
- Pass `max` when values are percentages or share a known ceiling so bars are comparable across cards.
