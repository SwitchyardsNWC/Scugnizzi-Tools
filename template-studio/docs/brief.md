# Template Studio — product brief

Owner: Jared Erickson, jared@switchyards.com. Marketing and design, Switchyards.
Date: 2026-09-10.

You are building the second version of a tool that already exists and is in daily use. Read
[learnings.md](learnings.md) first. It contains every fact about HubSpot and email client
rendering that version one paid for, marked by how confident we are in each. Rediscovering any
of it is wasted work.

## The problem

Switchyards sends marketing email through HubSpot. The design team owns how those emails look.
The marketing team writes the copy. HubSpot's own drag-and-drop editor gives the copy writers
too much control and the designers too little, and the resulting emails drift off brand and
break on phones.

The fix is a **HubSpot coded email template**: one HTML file, uploaded to Design Manager, where
the layout and styling are fixed and only the parts the designer unlocks are editable. The team
then creates emails in HubSpot's normal editor and fills in fields.

Hand-writing those templates requires knowing nested tables, Outlook conditional comments,
three-layer dark mode handling and HubSpot's template language. Designers do not and should not.

## What you are building

A desktop-class visual editor where a designer assembles an email template out of blocks on a
canvas, marks which parts the team can edit in HubSpot, and exports the coded template file.

The full plan, including the data model, the editor layout, phases and risks, is in
[plan.md](plan.md). Read it as a strong proposal, not a specification. Where it names a
technology, that is a starting point and the choice is yours. Where it names a behavior or a
constraint, treat it as a requirement.

## Who uses it

Jared plus two designers. No other users, no roles, no permissions, no login. They are on Mac,
in Chrome. They are fluent in design tools and not in code.

## What version one is and why it is being replaced

`reference/v1-template-builder.html` is a single 116KB HTML file with no build step and no
dependencies. It works. The Switchyards standard email ships from it today. Its export is
`reference/v1-export-example.html` and a saved design is
`reference/v1-standard-email.design.json`.

It is being replaced because:

- Designs live in one browser's local storage and move between people as exported JSON files.
- Blocks are a fixed list in a stacked column. There is no way to build a two-column row, or to
  save a section and reuse it in another template.
- There is no design system. Colors and sizes are set per block.
- Adding a block type means editing the source.

Everything it does well is captured in the learnings document. Read version one's code for the
compiler, not for the architecture.

## Success

A designer who has never seen HubSpot's template language builds a new email template in under
an hour, exports it, uploads it to Design Manager, and the team sends a real email from it that
looks correct in Gmail on a phone, Gmail on desktop, Apple Mail, Outlook on Windows and
Outlook's app in dark mode.

The detailed definition of done is in [acceptance.md](acceptance.md).

## Constraints

- **No backend.** No server, no database, no accounts. The app runs from disk or a local static
  server. Templates live as JSON files in a shared folder the users already sync.
- **The exported HTML is the product.** Everything else exists to produce it. If a feature would
  make the app nicer and the export worse, the export wins.
- **The team edits fields, not layout.** This decision is settled.
- **Chrome is the supported browser.** Other browsers should degrade to file import and export
  rather than break.
- **HubSpot cannot be simulated locally.** Some behavior is only observable in a real send.
  Where the learnings document marks something unverified, design so that finding out it is
  wrong costs one afternoon, not one phase.

## How to work

1. Start with a verification pass. Several things this depends on are marked unverified in the
   learnings document, chiefly whether HubSpot's image module exports its link to the template.
   Write down exactly what needs testing in HubSpot, hand Jared a single checklist, and build
   around whichever answer comes back.
2. Build the compiler before the editor. It is pure, testable, and it is the part that has to be
   right. Prove it by reproducing `reference/v1-export-regenerated.html` from
   `reference/v1-standard-email.design.json` through the new data model. *(Originally this said
   `v1-export-example.html`; that file turned out to come from an older build of v1 and a different
   design, so it cannot be reproduced from this fixture. See `architecture.md` §1.)*
3. Then build the editor on top of it.
4. Keep a running list of what you verified in a real send versus what you assume.

## What Jared cares about, in his own words

From three weeks of feedback on version one:

- "All I wanted was the template to be turned into one I can set up as a template to reuse in
  HubSpot."
- Mobile footers must not wrap badly. Each line stays on one line.
- The email should run edge to edge on phones.
- Headings in body copy need industry-standard margins and line height.
- Controls need a hover explanation.
- Things that are broken should be obvious and fixable, not silent. A dropdown that does
  nothing when clicked is the worst outcome.
