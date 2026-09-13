Card + CardGrid — paper surfaces on the sunken page.
```jsx
<CardGrid min={280}>
  <Card title="Occupancy by club" meta="Today" actions={<Segmented size="sm" options={['Day','Week']} value={r} onChange={setR}/>} footer={<TextLink arrow>All clubs</TextLink>}>
    <BarList items={clubs}/>
  </Card>
</CardGrid>
```
- Square, one `--border-card` hairline, no shadow, no radius. The page ground is `--surface-sunken`; cards are `--surface-card`.
- Title is 13px secondary — the content (a Stat, a BarList, a table) is the loud part, never the title.
- `onClick` for whole-card drills; otherwise put the drill in the footer as a TextLink.
