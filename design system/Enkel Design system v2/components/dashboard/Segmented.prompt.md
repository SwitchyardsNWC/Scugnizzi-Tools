Segmented — period / view switch.
```jsx
<Segmented options={['7d','30d','90d']} value={range} onChange={setRange}/>
<Segmented size="sm" options={[{value:'list',label:'List'},{value:'matrix',label:'Matrix'}]} value={view} onChange={setView}/>
```
- Two to five options, one or two words each. More than that is a Select.
- 36 tall (28 at `size="sm"`), built from padding on the sunken ground: 1 + 2 + (9 / 16 / 5) + 2 + 1, small 1 + 2 + (6 / 14 / 2) + 2 + 1. Don't set a height to centre it in.
