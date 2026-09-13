Stat + StatGrid — the KPI row at the top of every dashboard.
```jsx
<StatGrid>
  <Stat label="Occupancy" value="78" unit="%" delta={4.2} deltaLabel="vs last week" spark={[70,72,71,75,78]} onClick={()=>open('occupancy')}/>
  <Stat label="Open tasks" value="38" delta={-6} invert deltaLabel="this week" hint="9 required"/>
  <Stat label="Revenue MTD" value="$412k" delta={1.8} spark={rev} sparkKind="bars" tone={2}/>
</StatGrid>
```
- Four to six Stats max per row; the first is the one the reader came for.
- Value is mono; label is sans. Delta says the direction; the sparkline confirms it. Hint replaces delta when there is no comparison.
- `onClick` opens the drill (drawer or page). Every Stat should go somewhere.
