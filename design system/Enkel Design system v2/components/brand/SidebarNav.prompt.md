Primary navigation: a stacked typographic index in the 200px left rail — never tabs, never a top bar.
```jsx
<SidebarNav items={[{id:'works',label:'All works'},{id:'artists',label:'Artists'}]} activeId="works" onSelect={setSection} />
```
- Active item is black, inactive fossil (#b2b4b1). Hover shifts to black. No icons.
