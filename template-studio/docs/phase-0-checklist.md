# Phase 0 — the HubSpot checklist

> **Answered by the send of 2026-09-11.** Every question this checklist could settle came back, and
> all of it is recorded in [`learnings.md`](learnings.md) marked verified with that date; the
> consequences are in [`architecture.md`](architecture.md) §4. Two items are still open: **J** (the
> RSS and video module paths, a Design Manager lookup) and **K** (the field-rename check, a
> ten-minute re-upload). Dark-mode screenshots for **H** would also finish that question — the
> layers are confirmed to reach the inbox, but not yet confirmed to be honoured by each client.
>
> **For the next send**, one question this one created: `{% if widget_data.n.html %}` collapses a
> rich text field that is genuinely empty, but HubSpot leaves `<p>&nbsp;</p>` behind when the team
> clears one in the editor, so the block does not disappear. Which filter chain reliably detects
> that — `|striptags|trim`, `|replace("&nbsp;","")|trim`, something else — is worth one labelled
> case rather than a guess.
>
> The filled-in sheet lives at the Phase 0 Probe Sheet artifact. Kept below as the protocol, so the
> next round of HubSpot questions has a template to follow.

One upload, one email, one send. Everything in Phase 1 waits on the answers, so this is worth an
afternoon before anything else happens.

The file to upload is [`probe/hubspot-probe.html`](../probe/hubspot-probe.html). It is a throwaway.
Delete it from Design Manager when you are done.

## Run it

1. **Content → Design Manager**, pick any folder, **File → Upload files**, choose
   `probe/hubspot-probe.html`. Open it once so it validates, then publish.
   - If Design Manager rejects it, stop and send me the error. That is itself an answer.
2. **Marketing → Email → Create email → Custom tab**, pick "ZZ Probe - Template Studio Phase 0".
3. **Screenshot the Contents panel before touching anything.** This one screenshot answers B, C
   and part of D. Expected top-to-bottom order is **A, B, C1, C2, C3, D, E**.
4. Fill in the fields:
   - **A** — pick any image, and **set a link on it inside the image module's own link field**.
     This is the whole point of the send. Do not skip the link.
   - **B** — type anything.
   - **C1, C2, C3** — leave the defaults.
   - **D** — **leave it empty.**
   - **E** — add a heading and a link in the rich text editor.
5. Send to yourself.
6. Open the received email on **iPhone in dark mode** and screenshot. Then open it on desktop and
   screenshot. Then **view source** on the desktop copy and save the HTML.
7. Fill in the answers below and I will fold them into `learnings.md` with today's date.

## The questions

### A — does `@hubspot/image_email` hand its link to the template?
*Learnings 1.6, 1.13. The single most consequential unknown in the project.*

The A box prints every plausible path plus the whole object, so the shape comes back regardless of
which guess is right.

- [ ] `img.src` arrived: **yes / no**
- [ ] `img.alt` arrived: **yes / no**
- [ ] `link` arrived, and under which path: `link` / `link.url` / `link.url.href` / `img.link` / none
- [ ] The rendered 200px image at the bottom of the A box is wrapped in a working link: **yes / no**
- [ ] Paste the "whole object" line here verbatim:

```
```

**If the link arrives:** image blocks are one field, optional, linkable. Build as planned.
**If it does not:** image blocks fall back to a picker plus a separate "paste the URL here" text
field — two fields the team has to find, and worth saying so in the block's own hover text.

### B — does a declared-but-never-printed field register?
*Nothing in learnings covers this. It decides whether the compiler may declare a field whose markup
sits inside a branch that did not render.*

- [ ] `probe_b_unprinted` appears in the Contents panel: **yes / no**
- [ ] Position in the panel: ____

### C — does panel order survive nesting and conditionals?
*Learnings 1.4 verified the flat case. v2 nests everything, so this needs re-proving.*

- [ ] Actual panel order, top to bottom: ______________________
- [ ] C2 (two tables deep) held its place: **yes / no**
- [ ] C3 (inside a true `{% if %}`) held its place: **yes / no**
- [ ] C3 registered at all: **yes / no**

**If C3 registers and holds position**, the compiler may put declarations inside true branches and
gets more freedom. **If it does not**, the invariant is hard: declaration first, conditional second,
markup third, always, and the linter enforces it.

### D — does a blank default still register, and does `|trim` collapse it?

- [ ] `probe_d_blank` appears in the Contents panel despite an empty default: **yes / no**
- [ ] The D box says HIDDEN (correct) or VISIBLE (whitespace counted): **hidden / visible**

### E — can `rich_text` export to the template context?
*v1 never tried it. If it works, v2 can wrap rich text in its own markup and collapse it when empty,
neither of which v1 can do.*

- [ ] The dashed box in E contains the rich text you typed: **yes / no**
- [ ] Paste the "whole object" line here verbatim:

```
```

**If it works:** rich text becomes a normal block — themeable, collapsible, wrappable.
**If not:** rich text stays an in-place `{% rich_text %}` tag and can never collapse. Say so in the
editor rather than letting a designer expect otherwise.

### F — how far does `<style id="hs-inline-css">` reach?
*Learnings 1.9 established it reaches rich text. The open half is whether it also lands on our own
markup, which would fight every inline style the compiler writes.*

- [ ] The E box text came out red and bold (reached the rich text): **yes / no**
- [ ] The F box paragraph came out green and bold (reached template markup): **yes / no**

**If it reaches template markup**, every generated inline style needs to outrank it and the
compiler's scoping has to get narrower than `.sy-rich`.

### G — does `hs_padded` still add padding of its own?
*Learnings 1.11, from the double-padding bug in the legal footer.*

Look at the G box **on a phone**.

- [ ] Yellow row is inset relative to the blue row: **yes / no**
- [ ] Roughly how many pixels: ____

### H — do the dark-mode layers survive the send?
*Never confirmed. v1's dark mode has only ever been checked as a local file.*

Read the H swatch with the device in **dark mode**.

- [ ] Apple Mail iPhone, dark: **white / green / magenta**
- [ ] Outlook app, dark: **white / green / magenta**
- [ ] Gmail app, dark: **white / green / magenta** (expected: white — 2.5 says Gmail ignores all three)
- [ ] The "PHONE-ONLY LINE" appears on a phone and not on desktop: **yes / no**
- [ ] In the saved view-source: the `@media (prefers-color-scheme: dark)` block is still present:
      **yes / no**
- [ ] In the saved view-source: the `[data-ogsb]` rules are still present: **yes / no**

### I — CAN-SPAM

- [ ] The template published without complaining about missing CAN-SPAM variables: **yes / no**
- [ ] Both footer links resolve in the sent email: **yes / no**

## Two things that are not part of the send

### J — stock module paths that vary by account
*Learnings 1.13 lists these as unverified.* In Design Manager, look up and paste the real paths:

- [ ] RSS / blog listing: `________________`
- [ ] Video: `________________`

### K — field renaming orphans content
*Learnings 1.10 states it; it has never been watched happen, and it drives a data-model decision.*

Ten minutes, after the send:

1. In the probe template, change `probe_b_unprinted` to `probe_b_renamed`, leaving the label alone.
2. Re-upload and publish.
3. Open **the email you already created** and look at field B.

- [ ] The value you typed is gone: **yes / no**

**Either way the conclusion holds**: v2 must generate a HubSpot field name once, store it in the
template JSON against the block id, and never re-derive it from the label. Renaming a label in the
editor must not touch the field name. Watching it happen just tells us how loud the warning needs
to be.

## After

Send me the two screenshots, the saved view-source, and this file filled in. I will upgrade each
item in `learnings.md` from unverified to verified with the date, note anything new, and start
Phase 1 against the answers rather than the guesses.
