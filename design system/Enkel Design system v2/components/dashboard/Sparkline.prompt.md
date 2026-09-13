Sparkline — trend without axes.
```jsx
<Sparkline data={[62,64,61,70,72,69,74]} baseline={65}/>
<Sparkline kind="bars" data={weekly} tone={2} height={24}/>
```
- Numbers do the work; the sparkline only says "which way". Never label it, never add a legend.
- Use `baseline` for a target so the reader sees above/below at a glance.
