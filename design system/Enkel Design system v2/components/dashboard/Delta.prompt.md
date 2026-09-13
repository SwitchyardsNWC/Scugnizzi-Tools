Delta and Num — figures in mono.
```jsx
<Delta value={4.2} label="vs last month"/>
<Delta value={-12} invert format={n=>(n>0?'+':'')+n+' open'}/>
<td><Num>12,480</Num></td>
```
- Every figure that changes is mono (`--font-mono`); labels around it stay Helvetica.
- Use `invert` for costs, open items, wait times — anything where down is good.
