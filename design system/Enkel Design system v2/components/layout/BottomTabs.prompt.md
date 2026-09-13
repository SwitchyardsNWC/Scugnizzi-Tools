Phone-tier primary navigation — the SidebarNav's items as 3–5 equal text tabs pinned to the bottom edge.

```jsx
<BottomTabs items={[{id:'work',label:'My work'},{id:'projects',label:'Projects'},{id:'warehouse',label:'Warehouse'}]} activeId="work" onSelect={setTab} />
```

- Max 5 items; put the rest behind a "More" tab that opens a Sheet.
- Same id/label shape as SidebarNav so one array drives both tiers.
