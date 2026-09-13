Sticky phone-tier header (52px, hairline bottom) replacing the desktop left rail's context; use at the top of any screen below 768px.

```jsx
<TopBar title="Bin A-14" back="Warehouse" onBack={goBack} action={<TextLink>Edit</TextLink>} />
```

- `back` — `true` for arrow only, string for arrow + label. Hit area ≥ 44px.
- Title truncates with an ellipsis; never wraps.
- Respects `--safe-top` (notch) automatically.
