Action button — 14px label (13 small), slate iris fill, radius 6 (4 small), 36px tall (28 small). Outline edge is `--border-control`.
```jsx
<Button>Add work</Button>
<Button variant="outline" size="sm">Export</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button variant="outline" count={38}>Show all</Button>
```
- Label is one string: `{'Close ' + phase}`, not `Close {phase}` — sibling children open an 8px gap inside the label.
- Height comes from padding, not centring: md 36 = 1 + 11 / 16 / 7 + 1, sm 28 = 1 + 8 / 14 / 4 + 1; 16px each side at md, 12 at sm. Don't override `padding` or `lineHeight`.
- Long labels truncate; pass `wrap` to let one grow to two lines instead.
- Disabled = `--action-disabled-text` on `--action-disabled-surface`; prefer a Refusal to a disabled button.
- One filled button per view. Sentence-case labels, verb + noun.
