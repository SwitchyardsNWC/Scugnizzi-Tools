Small badge on live document sections that pull from the board, schedule or checklist.
```jsx
<Freshness state="stale" when="3 days ago" onRefresh={refresh} onFreeze={freeze} />
```
- Frozen = hollow dot; live = moss; stale = amber.
