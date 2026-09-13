Peek — hover to see a little, click to go.
```jsx
<Peek content={<><b>Ponce City</b><Field label="Occupancy">92%</Field><Field label="Lead">Jared</Field></>}>
  <TextLink onClick={()=>go('psc')}>Ponce City</TextLink>
</Peek>
```
- Content is 3–5 fields or one Stat; if it needs a scrollbar it should be a drawer.
- The trigger must also work on click/touch — peek is a shortcut, not a route.
