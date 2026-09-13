Segmented — period / view switch.
```jsx
<Segmented options={['7d','30d','90d']} value={range} onChange={setRange}/>
<Segmented size="sm" options={[{value:'list',label:'List'},{value:'matrix',label:'Matrix'}]} value={view} onChange={setView}/>
```
- Two to five options, one or two words each. More than that is a Select.
