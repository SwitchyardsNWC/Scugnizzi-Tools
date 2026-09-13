# Template Builder v2 — plan

Date: 2026-09-10. Owner: Jared (jared@switchyards.com). Status: ready to start.
Companion document: [learnings.md](learnings.md) — everything v1 taught us, marked by
confidence. Read it before writing any code.

v2 is built as a **new project** in a fresh folder, from a written brief, by Claude Opus 5 with
maximum reasoning. The kickoff bundle lives at this folder. This document is the
plan; `../KICKOFF.md` is what gets pasted into that session.

## What v2 is

A visual, drag-and-drop editor for building Switchyards email templates. A designer lays out
sections, rows and columns on a canvas, fills them with blocks, decides which parts the team may
edit, and exports a HubSpot coded email template. The team creates emails in HubSpot and fills
in fields. Exported HTML meets email standards without the designer knowing any of them.

Decisions already made, still standing:

| Question | Answer | What it means |
| --- | --- | --- |
| Delivery | Local app with a shared folder | No server, no login. The app opens a workspace folder (Dropbox, Drive or a git repo) and reads and writes JSON there. Everyone on the folder sees the same templates, modules and design system. |
| Design freedom | System-guided | Any layout from layout primitives. Colors, type and spacing come from an editable design system. Literal values are allowed but flagged. |
| HubSpot editing | Fields only | Layout is fixed by the template. The team edits text, images, links and HubSpot modules in the fields the designer unlocks. No HubSpot drag-and-drop areas. |
| Users | Jared plus a couple of designers | The shared library must be reliable. No roles or permissions. |

Non-goals: HubSpot drag-and-drop email areas, multi-brand, direct API publishing, non-designers
building templates, any server or login.

## What changed in this revision

Everything below the line was in the first draft. This revision adds:

1. **A learnings document** that the v2 compiler must satisfy, item by item. Roughly half of
   v1's development time went into the facts in it. None of it should be rediscovered.
2. **Two architectural rules promoted to requirements**, because they were the decisions that
   worked: one render path with a preview/HubL mode flag, and a color registry that generates
   dark-mode overrides automatically.
3. **A verification phase before Phase 1.** Several HubSpot behaviors v2 depends on are still
   unproven, chiefly whether `@hubspot/image_email` exports its link. One test send answers
   them all and changes what gets built.
4. **Stack choices demoted to suggestions.** v1's plan named Vite, Preact and dnd-kit. The
   implementer should choose, with those as a starting point rather than a decision.
5. **Acceptance criteria and a test protocol**, so "done" is checkable rather than argued.

---

## Concepts and data model

Everything is a JSON file in the workspace folder, so it diffs, syncs and backs up like any
other file.

```
<workspace>/
  design-system.json          tokens: colors, type, spacing, buttons, container, page bg
  templates/<name>.template.json
  modules/<name>.module.json  reusable sections
  blocks/<name>.block.json    custom block definitions
  exports/<name>.html         last export of each template
  assets/                     optional local copies of images for previews
```

Every document carries a schema version and passes through a migration chain on load. This is
not optional; v1 needed six migrations in three weeks (learnings 3.6).

**Design system (tokens).** Named roles, not raw values: `color.brand`, `color.page`,
`color.accent`, `type.h1` (size, line height, weight, mobile size), `space.s/m/l`, button
variants, container width, page background, dark-mode policy, link style. Templates and modules
reference tokens by name and resolve at export. A block may override with a literal; the
inspector flags it so overrides stay deliberate.

**Layout tree.** `Template → Section → Row → Column → Block`. A column holding more than one block
is a *group* — one cell, one box, one gap between the blocks — and a section holding one column of
one block is the ordinary case (learnings 3.59, decided 2026-09-12).

- Section: full-width background, inner 600px container, vertical padding, zero horizontal
  padding so phones get full bleed (learnings 2.4).
- Row: 1, 2 or 3 columns, or custom ratios. Mobile behavior per row: stack in order, stack
  reversed, stay side by side, hide.
- Column: alignment, padding, background.
- Block: the content element. Blocks are the only things the team can edit.

**Blocks.** Native blocks rendered by our compiler: Heading, Text (rich), Image, Button,
Divider, Spacer, Stripes, Social row, City links, Legal footer, Tagline bar, Card, Quote, Stat,
Personalization line. Plus HubSpot stock modules rendered by HubSpot at send (learnings 1.13).

**Editability.** Every block field has a lock. Locked bakes the value in. Editable turns it into
a HubSpot field with a label. Panel order follows canvas order, which the compiler achieves by
emitting each declaration immediately before its markup (learnings 1.4). Blank text and button
fields collapse their block entirely (learnings 2.11). Footer, legal and anything that must stay
current across sends defaults to locked (learnings 1.7).

**Modules (reusable sections).** A saved subtree with token references, author-declared slots
and labels, and pinned versions. Templates show an "update available" badge; updating is
explicit. "Detach" makes a private copy.

**Custom block builder.** Compose tier with no code: pick fields (text, rich text, image, link,
choice, number, color token, repeater), assemble from primitives, set defaults. Advanced tier:
an HTML snippet with `{{field}}` placeholders, validated against an email-safe allowlist. Both
produce a `.block.json` that flows through the same compiler and field mapping.

## Editor UX

Three panes and a top bar.

- **Left: palette.** Layouts, native blocks, HubSpot modules, shared modules, custom blocks.
  Searchable. Drag onto the canvas.
- **Center: canvas.** The real compiled email at 600px or 375px, with a dark-mode simulation
  toggle. Drop zones between and inside sections, rows and columns. Click selects, double-click
  edits text inline. Selection shows move, duplicate and delete. Empty columns show a labeled
  placeholder.
- **Right: inspector.** Content, spacing from the scale, colors and type from tokens, alignment,
  mobile behavior, and the editability lock with its HubSpot label.
- **Outline.** A collapsible tree for precise selection and reordering, like a layers panel.
- **Top bar.** Template name, design system, undo and redo, save state, export size, Validate,
  Export, Preview.

Interaction rules carried from v1 (learnings 3.2 to 3.4, 3.9):

- Pointer-based drag, not the HTML5 drag API, with keyboard equivalents.
- Undo and redo cover everything including drags. Destructive actions just happen and offer
  Undo; they do not ask first.
- No native `confirm`, `prompt` or `alert` anywhere.
- The canvas never loses scroll position when a field changes.
- Autosave on change, debounced. "Save version" snapshots under `templates/history/`.
- Every control has a one-line explanation on hover.
- An editability view that dims locked content and lists every HubSpot field in panel order with
  inline renaming. This is where a designer checks what the team will see.

## Export and email standards

The compiler resolves tokens, lays out nested tables with MSO conditionals and per-row mobile
classes, renders blocks with inline styles and fixed image widths, and emits HubL. It must
satisfy every item in section 2 of the learnings document.

Two rules are requirements, not choices:

1. **One render path, two modes.** Preview and HubL output come from the same code with a
   context flag, so the canvas is the compiled email and the two cannot drift (learnings 3.1).
2. **A color registry drives dark mode.** Every color used gets a generated class and an entry
   in a registry; the registry writes the `prefers-color-scheme` and `[data-ogsc]` layers. No
   color can be used without gaining an override (learnings 2.6).

The compiler is pure and DOM-free so it runs under unit tests. Snapshot tests per block and per
layout combination, plus a HubL linter for balanced tags, unique field names and valid paths.

Outputs: the HubSpot template HTML, a plain HTML preview with sample content, and the template
JSON.

Validation panel: total size against Gmail's 102KB clip, alt text and fixed width on every
image, no image wider than its column, absolute links, no unsupported CSS, CAN-SPAM block
present, dark-mode coverage for every color, no unlabeled editable field, balanced HubL, every
`{% ... %}` tag reachable (learnings 1.5).

Publishing stays manual: Design Manager upload, with `hs upload` notes for CLI users.

## Technical approach

The implementer chooses the stack. v1's suggestion, offered as a starting point and not a
decision: a static single-page app in TypeScript with a small React-compatible framework, an
immutable document tree with a command log for undo, a pointer-based drag library, and the File
System Access API for the workspace folder with an import and export fallback for Safari and
Firefox.

What is fixed regardless of stack:

- No backend, no login, runs from disk or a local static server.
- The compiler is a pure module with no DOM dependency and full test coverage.
- Documents are versioned JSON with a migration chain.
- Files carry a modified timestamp and author; the app warns before overwriting a file that
  changed on disk. Last save wins, with history snapshots as the safety net. Three users does
  not justify more.
- v1 designs (`*.design.json`) import into the v2 tree, and v1's values seed the first design
  system.

## Phases

| Phase | Scope | Rough effort |
| --- | --- | --- |
| 0. Verify | One HubSpot test send that answers the open questions in learnings 1.6 and 1.13. Nothing else is built until these are answered | 1–2 days |
| 1. Foundations | Data model, tokens, compiler with tests, workspace folder I/O, v1 import, plain HTML preview, validation core | 2 weeks |
| 2. Canvas editor | Palette, canvas, drag and drop, inspector, outline, undo and redo, inline text editing, desktop, phone and dark preview | 3 weeks |
| 3. Modules and design system | Design-system editor, token references with override flags, module save, place, update, detach, versions | 2 weeks |
| 4. HubSpot modules and block builder | Stock modules with style wrappers, compose-tier block builder, advanced tier with validation | 2 weeks |
| 5. Validation and pilot | Validation panel, export polish, docs, migrate current templates, pilot with the designers, fixes | 1–2 weeks |

Ten to eleven weeks of focused work. Phase 1 alone replaces v1's export, so value lands early.

## Risks

- **HubSpot cannot be rendered locally.** Keep a test-send checklist per phase and validate HubL
  locally before every upload.
- **`image_email` link export may not work.** Phase 0 answers this. If it fails, image blocks
  render the module directly and lose the ability to hide when empty.
- **File System Access API is Chromium-only.** Import and export fallback; Chrome is the
  supported browser.
- **Module versioning conflicts.** Explicit update, detach, and history snapshots. Never
  propagate silently.
- **Freeform layouts break in Outlook.** Layouts are built only from primitives the compiler
  knows how to render, and hard validation errors block export.
- **Gmail clipping.** Size shown live, warning at 90KB.

## Later

**Canvas mode** — every email in a project folder on one endless surface, each live, exported
together as a flow. Planned in [`canvas-mode.md`](canvas-mode.md) (2026-09-12).

Direct publish through a HubSpot private app. HubSpot drag-and-drop areas as an alternative
export. Litmus or Email on Acid screenshots from the Validate panel. Multi-brand design systems.

## Open items

> Item 1 is settled, along with several stack and scope choices this document proposes. This plan
> stands as the original proposal; the current decisions and the reasoning for anything that
> departs from it are in [architecture.md](architecture.md).

1. ~~Workspace location: shared Drive or Dropbox folder, or a git repo.~~ **Settled 2026-09-10:**
   synced folder via the File System Access API, with a git-clean file layout so a repo stays an
   option later.
2. Confirm the RSS listing and video module paths in the account's Design Manager.
3. Whether current templates are migrated in Phase 1 or rebuilt on the canvas in Phase 2 as the
   first real test of the editor.
