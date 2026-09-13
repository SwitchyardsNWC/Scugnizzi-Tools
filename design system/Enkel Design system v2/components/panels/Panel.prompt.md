One inspector for every screen — the selected project, item, frame, material or row.
```jsx
<Panel kicker="Checklist item" title="Signage plan" onClose={close} footer={<Button size="sm">Mark done</Button>}>
  <PanelSection title="Details"><Field label="Owner">Jared</Field><Field label="Due"><DateStamp date="2026-09-12" /></Field></PanelSection>
</Panel>
```
