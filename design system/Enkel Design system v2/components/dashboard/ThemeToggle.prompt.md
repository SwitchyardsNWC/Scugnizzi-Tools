ThemeToggle — light / dark.
```jsx
<ThemeToggle/>   // in the rail footer or FilterBar trailing slot
ApplyTheme(GetTheme()) // on boot, before first paint, to avoid a flash
```
- Everything themes through tokens; components never hard-code a hex. If something doesn't flip, it's using a raw colour — fix the token use, not the toggle.
- Built like `Segmented` and the dashboard header's switch: 28 by default (1 + 2 + (6 / 14 / 2) + 2 + 1), 36 at `size="md"` (1 + 2 + (9 / 16 / 5) + 2 + 1), on `--surface-sunken`.
