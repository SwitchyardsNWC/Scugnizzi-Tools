The product's signature idea: a checklist item points at the frame / page / row where the work lives.
```jsx
<LivesIn kind="frame" label="Signage plan" onClick={open} />
<LivesIn kind="page" label="Handoff doc · p.4" />
<LivesIn unlinked required onClick={pick} />
```
- Kinds: page ¶, frame ▢, row ≡, embed ⊞, file ⎘, spec ¶.
