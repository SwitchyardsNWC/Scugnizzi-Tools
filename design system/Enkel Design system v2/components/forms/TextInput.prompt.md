Form field — underline only, no box, no radius; label in 15px charcoal above; focus thickens the rule to 2px ink; 44px tall.
```jsx
<TextInput label="Title" value={v} onChange={e => setV(e.target.value)} />
<TextInput label="Notes" multiline hint="Provenance, condition, remarks" />
<TextInput label="Inv. no." defaultValue="INV-0041" error="Already used by Atrium Study II" />
```
