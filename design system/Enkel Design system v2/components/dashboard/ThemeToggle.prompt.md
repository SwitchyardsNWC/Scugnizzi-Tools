ThemeToggle — light / dark.
```jsx
<ThemeToggle/>   // in the rail footer or FilterBar trailing slot
ApplyTheme(GetTheme()) // on boot, before first paint, to avoid a flash
```
- Everything themes through tokens; components never hard-code a hex. If something doesn't flip, it's using a raw colour — fix the token use, not the toggle.
