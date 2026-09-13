Primary action button — quiet, 0 radius, 15px label, slate iris fill, 44px tall (34px sm).
```jsx
<Button>Add work</Button>
<Button variant="outline" size="sm">Export</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button variant="outline" count={38}>Show all</Button>
```
- Label is one string: `{'Close ' + phase}`, not `Close {phase}` — sibling children open a 10px gap inside the label.
- Height comes from padding, not centring: 13/11 at md, 8/6 at sm. Don't override `padding` or `lineHeight`.
- Long labels truncate; pass `wrap` to let one grow to two lines instead.
- Disabled = fossil on fossil-soft; prefer a Refusal to a disabled button.
- One filled button per view. Sentence-case labels, verb + noun.
