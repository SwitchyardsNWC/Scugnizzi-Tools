Bottom sheet for phone/tablet — use wherever desktop would open a side Panel (filters, item detail, quick edit).

```jsx
<Sheet open={open} title="Filter" onClose={() => setOpen(false)}>
  <Field label="Status"><Select …/></Field>
</Sheet>
```

- Content padding 21px; scrolls internally past 85vh.
- Tap the scrim or "Close" to dismiss. No swipe handle, no rounded top.
