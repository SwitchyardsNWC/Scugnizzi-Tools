Page frame that owns the viewport. Rail on the left, a static header above a scrolling main, and any right-hand inspector as a drawer laid over the main. Wrap every screen in it.

```jsx
<AppShell width="full"
  rail={<><Wordmark/><SidebarNav items={nav} activeId={id} onSelect={go}/></>}
  header={<ShellHeader kicker="Ponce City club" title="Schedule" actions={<Button size="sm">Add row</Button>}/>}
  drawer={sel ? <Panel title={sel.item} onClose={()=>setSel(null)}>…</Panel> : null}
  drawerTitle="Row details" onDrawerClose={()=>setSel(null)}
  top={<TopBar title="Schedule" />}
  tabs={<BottomTabs items={nav.slice(0,4)} activeId={id} onSelect={go}/>}>
  <DataTable stickyHeader pinFirst … />
</AppShell>
```

- The shell is `100vh`; `main` scrolls, so `header` stays put and `DataTable stickyHeader` pins column labels under it (the shell publishes `--shell-sticky-top` = measured header height; with `stickyHeader` the main also carries the table's sideways scroll). `style={{height:'auto'}}` returns to page scroll — sticky labels then need `maxHeight` on the table.
- `width="full"` for tables, schedules, galleries (42px gutter, no max); default `page` caps reading layouts at 1200px.
- `drawer` non-null = open. Desktop/tablet: overlays the main from the right (default 420px), hairline left edge, Escape closes. Phone: same Panel inside a bottom sheet with scrim. Never a permanent right column.
- `tier="phone"` pins a tier for mocks/cards regardless of viewport.
