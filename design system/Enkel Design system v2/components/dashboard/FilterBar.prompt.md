FilterBar + FilterChip — the control row under the header.
```jsx
<FilterBar summary="24 clubs · updated 2 min ago" trailing={<Button size="sm" variant="outline">Export</Button>}>
  <Segmented size="sm" options={['7d','30d','90d']} value={r} onChange={setR}/>
  <FilterChip label="Market" value="Atlanta" onRemove={()=>setMarket(null)}/>
</FilterBar>
```
- Put it in AppShell's `header` slot (below ShellHeader) so it stays put while the page scrolls.
- Summary is the honest count of what's on screen after filters.
