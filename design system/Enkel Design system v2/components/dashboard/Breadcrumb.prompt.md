Breadcrumb — the way back from a full-page drill.
```jsx
<ShellHeader title="Ponce City" kicker={<Breadcrumb items={[{label:'Overview',onClick:home},{label:'Clubs',onClick:clubs},{label:'Ponce City'}]}/>}/>
```
- Only for full-page drills. Drawers and inline expands close with × / a second click; they don't need a trail.
