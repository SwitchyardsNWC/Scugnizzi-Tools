Photograph shown as captured — never overlaid, tinted or rounded. Placeholder is a hairline box naming what it waits for.
```jsx
<ImageBlock src={work.image} alt={work.title} />
<ImageBlock ratio="1 / 1" placeholder="Item photo" hint="Team knows it by sight" />
<ImageBlock width={42} height={42} placeholder="spec" />
<ImageGrid min={180}>{rows.map(r => <div key={r.id}>…</div>)}</ImageGrid>
```
- Native ratio by default. Force `ratio` only where cells line up: 1:1 gallery, 42px row thumbnail, 4:3 detail.
- Metadata (name, count, source, status) sits under the frame, never over it.
- `ImageGrid` reflows below `min` — it drops a column rather than shrinking a photograph past recognition.
