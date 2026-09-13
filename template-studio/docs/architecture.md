# Architecture — the reply to the kickoff

Date: 2026-09-10, updated 2026-09-11. Written against `brief.md`, `plan.md`, `learnings.md`,
`acceptance.md` and v1's source.

**Status:** Phase 0 is answered (send of 2026-09-11 — see §4), both decisions it opened are taken,
and build-order steps 1–4 are done: the compiler and its HubSpot contract gate, the workspace app, the
editor, and the canvas. The design system editor and multi-column rows have landed since. What is
left of the original plan is Patterns, HubSpot stock modules and the compose-tier block builder,
plus the four footer variants and the city-links block, none of which are blocked by anything.

Inline editing now covers rich text as well as plain: the paste sanitiser it waited on is
`src/app/sanitise.ts` (learnings 3.5, 3.18).

---

## 1. My read on the brief

### The brief is unusually good, and one thing in it does not work

`acceptance.md` §1 makes this the first automated gate:

> `reference/v1-standard-email.design.json`, imported into the v2 data model and compiled, produces
> HTML that matches `reference/v1-export-example.html`.

Those two files do not correspond, and no correct compiler could make them. Three separate drifts:

| | The fixture | The export example |
| --- | --- | --- |
| Heading block | none | `{% text "headline" %}` |
| Footer | none | two-column stacking footer, four editable fields |
| Legal note | `noteEditable: false` | `{% text "legal_note" %}` |
| Hero image | `hsMode: "module"` | `{% linked_image %}`, no companion link field |

The last row dates it: today's v1 emits either a `@hubspot/image_email` module or a
`linked_image` **plus** a "paste the URL here" text field. The export example has neither shape, so
it predates both. The rich-text scale in its `<style id="hs-inline-css">` is also the older one, and
its footer fields are editable, which v1 stopped defaulting to (learnings 1.7).

So the export example is a stale artifact from an older build of v1 and a different design. It is
still useful as a reading reference. It cannot be a golden file.

**Resolved, not just reported.** v1's whole script is a single `'use strict'` IIFE in one
`<script>`, so it can be driven headlessly: inject an export hook before the IIFE closes and give it
a permissive DOM proxy the compiler never actually touches.
[`tools/regenerate-v1-export.js`](../tools/regenerate-v1-export.js) does that, and
[`reference/v1-export-regenerated.html`](../reference/v1-export-regenerated.html) is the fixture
compiled by today's v1 — 32,941 bytes, fields in exactly the fixture's block order:

```
top_bar_tagline → hero_image → body → button_text → button_link → secondary_image → closing_text
```

**Decided: that is the golden file.** `acceptance.md` §1 now names it. `v1-export-example.html` is
untouched and stays as a reading reference, marked stale in the README.

### What else was underspecified — all four now settled

**Workspace location** (plan, Open items 1) changes the architecture, not just a setting.
**Decided: a synced folder now, opened with the File System Access API, with the file layout kept
git-clean so moving to a repo later is a decision rather than a migration.** Concretely that means
stable key order on serialize, one document per file, and no timestamps or generated ids inside file
content — the modified-time and author metadata the plan calls for lives in a sidecar, not in the
document. Designers should not need a CLI for the tool to work, and `templates/history/` snapshots
cover what git would give us day to day.

The real hazard is not named in the plan: Dropbox and Drive resolve concurrent writes by creating
*conflicted copies* silently, which is worse than a merge conflict because nobody is told. So the
mtime guard has to re-stat immediately before every write, not on load, and the app has to notice
`foo (Jared's conflicted copy).template.json` appearing in the folder and surface it.

**"Module" means two different things** — `*.module.json` reusable sections, and HubSpot's
`{% module %}` stock modules. In a tool whose entire interface is labels people read, that collision
would outlive the project. **Decided: reusable sections are Patterns** (`*.pattern.json`) everywhere
in the UI and on disk; "module" only ever means HubSpot's.

**One design system or one per template?** `plan.md` names a single workspace-level
`design-system.json`, but the top bar lists "design system" as a thing you pick. I am going with one
per workspace, templates pinning a version, and no picker. Say if you meant otherwise — this is the
one I decided without asking.

**Per-field locks.** The plan says "every block field has a lock." A button has text, link, style,
alignment and two padding values — locks on all six is a lot of interface for a decision that
learnings 3.10 already settled. **Decided: editability covers content fields only** — text, rich
text, image, link. Style, spacing and alignment are permanently designer-only and have no lock UI at
all. Fewer controls, same outcome, and it removes a category of template where the team can quietly
break the layout.

### What I pushed back on

**The advanced tier of the custom block builder** — an HTML snippet with `{{field}}` placeholders,
validated against an email-safe allowlist. It was the highest-risk feature per unit of value in the
plan. It reintroduces exactly the hand-written-HTML problem the product exists to remove, and a
validator strict enough to make pasted HTML safe in Outlook's Word engine is a larger job than the
compiler itself. **Decided: cut.** Compose tier only, which I agree with entirely. If a designer
hits its ceiling, the answer is a new native block in the compiler — where it gets snapshot tests
and the linter — not an escape hatch that ships unchecked markup to Outlook.

**Phase 2's three weeks.** Phases 1 and 3–5 look about right. Phase 2 is the whole canvas — pointer
drag over a nested tree, undo covering drags, inline rich-text editing, an outline panel, three
preview modes — and it is the one I would expect to run long. Section 4 below splits it so that
*editing* ships before *dragging*, which means a slip costs drag polish rather than usability.

### The hardest part

Not the nested tables, and not the drag and drop.

**The canvas has to be the compiled email, but in HubL mode the compiled email is a program, not a
document.** Its output contains branches — `{% if widget_data.hero.img.src %}` wrapping a whole
section, `{% if ...|trim %}` collapsing a blank heading — whose truth values are only known inside
HubSpot. The preview must pick a branch, which means the canvas shows one *possible* email. v1 got
away with this because it had one optional block type and painted a dashed placeholder. v2 has
optional images, blank-collapses-block, per-row mobile behavior and four mobile modes, so one
template describes 2ⁿ emails and the designer is looking at one of them.

Two consequences I am designing for from the start:

1. **Preview state is a first-class concept.** A small strip of toggles — "hero image: set / unset",
   "button label: filled / blank" — so the designer can walk the branches deliberately. Not a hidden
   default that happens to be "everything filled in."
2. **Validate checks every branch, not the one on screen.** The branch set is finite and known at
   compile time, so the validator enumerates it. This is the difference between the tool being
   trustworthy and the tool producing the failure you named as the worst outcome: something broken,
   silently.

The second-hardest thing is a genuine three-way tension in the learnings that no one has written
down as one rule:

- 1.4 — panel order follows source order, so declarations must interleave with markup.
- 1.5 — a tag inside a false conditional never registers, so declarations must sit outside
  conditionals.
- 2.11 — blank content must collapse the whole block, so conditionals must wrap the markup.

Exactly one shape satisfies all three, per block, always:

```
declaration  →  conditional  →  markup
```

with no declaration ever inside a conditional. That is an invariant, and convention will not hold
it across twenty block types. §2 makes it structurally checkable.

---

## 2. The architecture

### The one real departure: the compiler emits a tree, then serializes it

v1's `generate()` concatenates strings, and the color registry is a side effect that happens during
concatenation. That is why v1 cannot lint its own output, and it is why half of `acceptance.md` §1
reads as hard work — "parse the output and check every color has an override", "balanced HubL",
"field order matches canvas order".

v2's compiler produces an intermediate tree instead:

```
Node = { tag, attrs, style, children }
     | { hubl: 'decl',  field }          a {% text %} / {% module %} declaration
     | { hubl: 'if',    test, children } a conditional
     | { hubl: 'print', path }           a {{ widget_data... }} reference
     | { text }
```

then one serializer walks it in `preview` or `hubl` mode. Three things fall out for free:

- **The invariant above becomes a structural check.** "No `decl` node may have an `if` ancestor" is
  four lines in the linter and cannot be defeated by string formatting. So can "declaration order
  equals document order" and "every `path` refers to a declared field".
- **"One render path" becomes literally one path.** The brief asks me to keep v1's mode flag, and I
  am — but v1 achieves it with `if (ctx.mode !== 'hubl')` scattered through every block renderer,
  which is two code paths sharing a function body. Here the blocks emit one tree with no knowledge
  of mode, and `preview` is the serializer *evaluating* the branches against a preview state rather
  than emitting them. The two cannot drift because there is nothing to drift.
- **The color registry becomes a tree walk**, not a side effect. It cannot miss a color, cannot
  double-register, and runs after the tree is complete, so the dark-mode layers are a pure function
  of the document. This is the rule from learnings 2.6, strengthened.

This is the claim I would defend hardest. Everything else below is ordinary.

### Stack

| | Choice | Why |
| --- | --- | --- |
| Build | Vite + TypeScript | As proposed. A typed document tree is what makes migrations safe. |
| UI | Preact | As proposed. Three users, no ecosystem needs, and the built app is a folder you can double-click. |
| Tests | Vitest | Compiler snapshots, plus the golden-file gate above. |
| State | Immutable document + a command log | Not a generic undo library. |
| Drag | ~200 lines of pointer handling | **Departing from dnd-kit.** |

**Why not dnd-kit**, as asked, in one paragraph: our drop targets are positions in a nested tree —
between sections, between rows, inside a column, inside an empty column — not entries in a flat
sortable list, and dnd-kit's sortable model has to be bent into nested containers to express that.
Meanwhile learnings 3.2 and 3.3 require that every drag be a single undoable command and that
component identity stay stable through it. A pointer-based drag that computes an insertion point and
emits one `move(nodeId, newParentId, index)` command is less code than configuring dnd-kit for
nested sortables, it makes the undo story trivial rather than an integration problem, and it gives
the keyboard path (`acceptance.md` §2) for free because the keyboard emits the same command. The
HTML5 drag API stays out of it, per 3.2.

**Command log, not patches.** Every mutation is a named command with a `do` and an `undo`. The log
*is* the undo stack, and it is also the autosave unit and the input to "Save version". Fifty steps
is free, drags are included because a drag is one command, and a bug in undo is visible as a bad
command rather than as a corrupted patch.

### Layout

```
src/
  model/       document types, schema version, migration chain, v1 .design.json import
  compile/     pure, DOM-free, runs under Node
    blocks/    one file per block type; each returns a Node tree, knows nothing about mode
    serialize.ts   tree → string, mode: preview | hubl
    colors.ts      registry → prefers-color-scheme + [data-ogsc] layers
    tokens.ts      design system → resolved values + the hs-inline-css scale
    lint.ts        tree-level HubL and email checks
    branches.ts    enumerate the branch set for a document
  app/         preact editor
  workspace/   File System Access, mtime guard, history snapshots, conflicted-copy detection,
               git-clean serialization (stable key order, metadata in sidecars)
tools/         regenerate-v1-export.js and friends
tests/fixtures/
```

### Carried from the learnings without argument

Schema version and a migration chain in the first commit (3.6). No native `confirm`/`prompt`/`alert`
anywhere; deletion happens and offers Undo (3.2). Field names generated once, stored against the
block id, never re-derived from a label (1.10 — see checklist item K). The canvas keeps its scroll
position and measures with `getBoundingClientRect().height`, not `scrollHeight` (3.4). Rich text
sanitized to an allowlist with inline styles stripped (3.5). The app opens with the Switchyards
standard email already assembled (3.8). Every control has a one-line explanation on hover.

---

## 3. HubSpot verification

See [`phase-0-checklist.md`](phase-0-checklist.md) — eight questions answered by one send, plus two
that are a Design Manager lookup and a ten-minute re-upload. The template to upload is
[`probe/hubspot-probe.html`](../probe/hubspot-probe.html): 18KB, every case labeled in the body,
HubL balanced, field names unique and in a documented order so one screenshot of the Contents panel
answers the ordering question for all of them.

Two of the eight are not in the brief's list and I think they earn their place. **E** asks whether
`rich_text` can export to the template context — v1 never tried, and if it can, rich text becomes a
block that can be wrapped and collapsed like any other instead of a tag that renders where it
stands. **H** asks whether the dark-mode layers survive HubSpot's processing at all; v1's dark mode
has only ever been verified as a local file, which means the three-layer mechanism in learnings 2.5
is load-bearing and unproven end to end.

---

## 3a. Importing a design system from Claude Design

Not built. Written down because the shape of the model has to allow for it, and two decisions were
taken this week specifically so that it can land later without a rewrite.

**What is on the other end.** A Claude Design project (`claude.ai/design`) is a folder of HTML
component previews, not a token file. The `DesignSync` tool reads one: `list_projects` finds the
projects the user can write to, `list_files` lists paths, `get_file` returns one file's content, and
the Design System pane builds its card index from a `@dsCard` comment on each preview's first line.
So an importer is not "parse tokens.json" — it is "read the previews and recover the values they are
built from", most plausibly from the CSS custom properties they declare.

**The seam.** One function, and nothing else in the project needs to know it exists:

```ts
function fromClaudeDesign(files: Array<{ path: string; content: string }>): Partial<DesignSystem>
```

Everything downstream already works on whatever it returns, because of two things:

- **The panel is key-driven.** It renders `Object.keys(ds.colors)` and `Object.keys(ds.type)`, not a
  list of Switchyards' own five colours and seven levels. An imported brand with `display`,
  `eyebrow` and `caption` roles, or eleven colours, shows all of them. A hard-coded panel would have
  been the worst outcome: the tokens would reach the output and be invisible in the interface.
- **A preset names a colour rather than repeating one** (`ColorRef`, learnings 3.12). An import
  replaces the palette; presets that name `brand` keep working, and one that had baked in `#d10000`
  would not.

**What is left to decide, and should not be guessed at now:**

| | |
| --- | --- |
| Where the values come from | CSS custom properties in the previews is the likely answer, but no Claude Design project has been read to check. That is an afternoon, like Phase 0 was. |
| What happens to presets | An import brings colours, not background presets. Mapping `cream`/`navy`/`offwhite` onto an unfamiliar palette is a judgement, so it should be a step the designer confirms rather than something the importer decides. |
| Per template, or per folder | Same question as the design system itself has today, and it should get the same answer — see below. |

The one thing the importer must not do is replace the system wholesale and silently. A brand kit has
no opinion about a 600px column or a 639px breakpoint, and overwriting those with defaults would
break every template in the folder.

---

## 3b. On Unlayer, and what was taken from it

`unlayer/react-email-editor` wraps Unlayer's hosted builder in a React component: `loadDesign`,
`saveDesign` and `exportHtml` against an iframe served from Unlayer, configured through a `tools`
registry that can enable, reposition, limit and re-icon each built-in block, plus custom tools.

**What it gets right, and this project has now copied:** a row is the layout unit, columns live
inside a row, and the mobile behaviour is a property of the row rather than of a block. Adding a
block means choosing a column to put it in. That is the model in step 5's columns, arrived at from
the same direction.

**What it cannot give us, and is the reason v2 exists at all:** Unlayer emits HTML. Switchyards
needs a *HubSpot coded template* — HubL field declarations in panel order, `export_to_template_context`,
conditionals that collapse an empty field and its spacing, and the CAN-SPAM variables. That is not a
rendering difference; a template is a program with 2ⁿ outputs and Unlayer's design JSON has nowhere
to put the branches. The hosted iframe also puts the output outside our control, which is the one
thing forty learnings' worth of Outlook and Gmail workarounds cannot survive.

Two ideas still worth stealing and not yet taken:

- **Drag a block from a palette into a column**, rather than adding it from a menu and then moving
  it. The pointer-drag machinery for reordering already exists; this is the same code with a
  different source.
- **A usage limit per block type.** One legal footer per template is a rule this project enforces
  nowhere and should.

---

## 4. Build order

Each step ends with something that runs.

| Step | Scope | Usable at the end |
| --- | --- | --- |
| **0** | The probe and the checklist. **Done.** | An afternoon's work that unblocks everything else. |
| **1** | Model, migrations, v1 import, the node tree, serializer, color registry, linter, branch enumeration. Pure, under Node. **Done, apart from what waits on Phase 0 — see below.** | `npm run compile -- foo.design.json` reproduces the standard email, and the golden-file diff guards every change after. |
| **2** | Read-only app: open a workspace folder, list templates, compiled preview at 600 / 375 / dark, size readout, Validate panel, Export. No editing. **Done.** | v1 is replaceable for everything except editing, and templates come out of a shared folder for the first time. |
| **3** | The inspector. Select through the outline tree, edit every field, lock and label, undo/redo, autosave. No canvas drag. **Done.** | **A designer can build a real template end to end.** Slower than dragging. Complete. |
| **4** | The canvas. Click-select on the preview, pointer drag, drop zones, inline text editing, the editability view. **Done**, rich text included — the paste sanitiser it waited on is `src/app/sanitise.ts`. | The tool as described in the plan. |
| **5** | Design system editor, Patterns (reusable sections), token overrides with flags, versions and detach. **Design system editor and multi-column rows done**; Patterns not started. | A section saved once and reused across templates, with explicit updates. |
| **6** | HubSpot stock modules, compose-tier custom blocks. | The palette is extensible without editing source, which was v1's fourth complaint. |
| **7** | Migrate the live templates, pilot with the designers, fixes. | v1 is retired. |

The reordering against `plan.md`'s phases is steps 2–4. The plan has the entire canvas editor as one
three-week phase, so nothing is editable until all of it lands. Splitting it puts a working,
if plodding, editor in your hands roughly a week earlier and makes the expensive half — drag —
the thing that absorbs a slip.

---

### What Phase 0 answered — send of 2026-09-11

Every question the send could answer came back, and all of it is now in `learnings.md` marked
verified with the date. The three things step 1 had written to v1's shape:

| | Answer | Effect on the compiler |
| --- | --- | --- |
| **A** — does `image_email` export its link? | **Yes**, as a bare URL at `widget_data.<n>.link`. `.link.url`, `.link.url.href` and `.img.link` are all empty. | None. That is the path already written. The hedges are gone and there are tests pinning it. |
| **E** — can `rich_text` export? | **Yes.** `widget_data.<n>.html` carries the team's markup. | A capability v1 never had, and a decision — see below. |
| **C** — does a declaration inside a true `{% if %}` register? | **Yes**, and it holds its position. | None, deliberately. See below. |

Three findings nobody asked for, which is the usual return on a probe that prints raw values:

- **The module reports the file's natural width, not the declared one.** A 1080px upload came back
  as `img.width: 1080` against a declared 400. A compiler that trusted it would reproduce the bug
  v1 actually shipped (learnings 2.9). This one has a regression test now.
- **`hs-inline-css` reaches the template's own markup**, not just rich text, and HubSpot *prepends*
  the matched declarations — so the compiler's inline styles win, which is the useful direction.
- **HubSpot injects `margin-bottom: 1em` onto every `<p>`.** See the decision below.
- **All three dark-mode layers survive the send byte for byte.** The mechanism was load-bearing and
  had never been checked end to end; it reaches the inbox. Whether each client then honours it
  still needs the dark-mode screenshots.

And one correction: in a *coded* template HubSpot injects **no stylesheet of its own** — the
received source carries only the two style blocks the template shipped. So `hs_padded` has no rule
unless we write one, and v1's phone padding comes from v1's own head CSS. The double-padding bug in
learnings 1.11 was self-inflicted.

### Two decisions the answers opened — both taken, 2026-09-11

1. **Rich text now exports.** `export_to_template_context` works on `rich_text` (learnings 1.14), so
   a rich text block is wrapped in the template's own section and collapses when the field is
   empty — neither of which v1 can do. The compiler's own `{% rich_text %}` tag no longer has to
   render where it stands, which is what made the block untheme-able.
   **One caveat, deliberately not guessed at:** the collapse tests `{% if widget_data.n.html %}`,
   the shape the probe actually proved. That collapses a genuinely empty field, but *not* one the
   team cleared in the editor, because HubSpot leaves `<p>&nbsp;</p>` behind. Stripping that needs a
   filter chain nothing has verified, so it is on the list for the next send.
2. **Every `<p>` the compiler emits states its own margin.** HubSpot inlines a default
   `margin-bottom: 1em` onto paragraphs at send, and Gmail strips the `p { margin:0 }` reset that
   would otherwise cover it. `paragraph-margin` is now an **error**, not a warning — the compiler
   always states one, so an omission is a defect rather than a caveat.

### The gate, and why it is no longer the golden file — 2026-09-11

Both decisions above were taken against a `v1Parity` flag, so the byte diff could keep passing while
the compiler did the right thing by default. That arrangement lasted about a day. Jared's direction:

> depart from V1 of the builder. as long as the hubspot integration and handoff stays correct.

So the flag is gone and the byte diff with it. What replaced it is a split between **shape** and
**contract** — see learnings 3.24 for the full reasoning and the list of things it had been holding
back.

| File | What it guards | Status |
| --- | --- | --- |
| `tests/hubspot-contract.test.ts` | Fields, names, labels, panel order, `export_to_template_context`, no declaration inside a conditional, the annotation header, CAN-SPAM, balanced branches, the verified image path, the Gmail size limit | **The gate.** Asserted against what the compiler actually emits. |
| `tests/v1-import.test.ts` | A v1 design imports with every block, setting and field name intact — and a record of what departing from v1 changed | Hard test |
| `tests/blocks.test.ts` | Markup regressions, per block, per theme, against v2's own output | Hard test |
| `reference/v1-export-regenerated.html` | Where this came from | Documentation |

The golden file did its job: it proved the data model carries a real design across without loss and
caught four genuine mistakes doing it. Keeping it past that point would have meant treating v1's
typos as requirements.

Not built, and not blocked — just not reached: the four footer variants, the city-links block, and
multi-column rows beyond the single full-width column the standard email uses. The importer names
any block it cannot carry across rather than dropping it silently.

## Decisions taken

Settled 2026-09-10, by Jared unless marked otherwise.

| | Decision |
| --- | --- |
| Golden file | `reference/v1-export-regenerated.html`. `acceptance.md` §1 names it. |
| Workspace | Synced folder via the File System Access API, with a git-clean file layout so a repo stays an option later. |
| Editability | Content fields only — text, rich text, image, link. No locks on style or spacing. |
| Custom blocks | Compose tier only. The advanced raw-HTML tier is cut. |
| Naming | Reusable sections are **Patterns**; "module" means HubSpot's. *(My call, flagged.)* |
| Design system | One per workspace, templates pin a version, no picker. *(My call, flagged — say if you meant a picker.)* |

Still open, and not blocking: `plan.md` Open items 2 (RSS and video module paths — checklist item J)
and 3 (whether the live templates are migrated in step 1 or rebuilt on the canvas in step 4 as the
editor's first real test). I lean towards rebuilding: it is the only honest test of the editor, and
the compiler gate already proves the output.
