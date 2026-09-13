# One project folder for every tool

*A plan. Written 2026-09-13 from an idea of Jared's. Nothing here is built.*

> "if you could open a project folder from the dashboard that all the tools will auto save/connect
> to, so they can all work together through project file structure. Think of a tool for copy writers
> to pitch copy ideas: an uploaded document that auto populates, then feeds that data into each tool
> to use for copy. It could work two ways: it gets changed in the design, it's updated on the doc,
> and vice-versa."

## The idea in one paragraph

Today each tool is its own island. Template Studio opens a folder; ink bleed, riso, split flap and
the image effects editor save to the browser and export by download. The idea is a **project**: one
folder, opened once from the dashboard, that every tool reads from and saves into, in a structure
they agree on. Its centre is the **copy deck**, a document the copywriters own. Every word a tool
shows can be bound to a line of it, so a headline typed in the deck appears in the email, the social
image and the split-flap board, and a headline changed in any of those goes back into the deck.

## Why this is buildable, and the one fact it rests on

Every tool is served from the same origin: the dashboard, the single-file tools and Template Studio
are one site on GitHub Pages. Chrome's File System Access handles are stored per origin in
IndexedDB, and a stored handle can be read by any page on that origin. So the dashboard can pick the
folder once, store the handle, and every tool page can open it without a picker. Each page still has
to ask for write permission once per session from a click, or rely on Chrome's "allow on every
visit"; the ask is one button, the same **Allow editing** Template Studio already has
(learnings 3.58).

Open tools talk to each other with a `BroadcastChannel` on that origin: "copy changed", "file
saved". No server is needed for any of this. The limits are the ones Template Studio already lives
with: Chrome only, a local or synced folder, and no multi-person live editing.

## The folder

```
my-campaign/
  project.json              name, the tools in use, schema version
  copy/
    deck.json               the copy, structured: the source of truth
    deck.md                 the same copy, readable and editable in any text editor
    sources/                uploaded documents, kept as they arrived
  assets/                   pictures every tool can use
  design-systems/           as Template Studio has them now
  templates/                Template Studio's emails
  boards/                   Canvas mode boards (docs in template-studio)
  social/  print/           future tools' files
  exports/                  what each tool hands off
```

Each tool owns its own folder and reads the shared ones. None writes into another tool's folder.

## The copy deck

**Structure.** A deck is a list of *pieces* (the welcome email, the Instagram post, the poster),
each with named *slots*: headline, subhead, body, call to action, legal line. Every slot has an id
that never changes, a label the writer reads, the text, and a status (draft, pitched, approved).
Alternatives are part of a slot, since pitching is offering several: one is marked chosen.

**Getting copy in.** A writer drops a document on the copy tool. Markdown and plain text parse
directly; `.docx` parses through a small in-page reader of its XML; a Google Doc arrives as an export
of either. Headings become pieces and the paragraphs under a bold label become slots, and the writer
confirms the mapping before anything is written. The original is kept in `copy/sources/`.

**Binding.** A text field in any tool can point at a slot instead of holding words: in Template
Studio a heading's text would be `copy:welcome.headline`. The tool shows the slot's chosen text, and
a small chip says the words come from the deck. Unbinding copies the words in and drops the link.

**Both ways.** An edit in the deck updates every bound field in every open tool through the channel,
and the next time a closed tool opens. An edit to a bound field in a tool writes back to the slot.
It goes to `deck.json` and regenerates `deck.md`, and the deck's history records who changed it and
from where. When both sides changed a slot since the last sync, nothing is overwritten: the slot
shows both versions and asks.

**The honest limit on "the doc".** Writing changes back into an uploaded `.docx` or a Google Doc is
the part that is hard. A `.docx` is a zip of XML that can be patched, but a writer's formatting
makes that fragile. A Google Doc needs Google sign-in and its API, which means a small server and is
a hosting decision like the review links in the Canvas mode plan. So the deck's own Markdown is the
two-way document from day one, and export to `.docx` comes next. Live two-way with Google Docs is a
later decision, not a first step.

## What each tool gains

| Tool | Reads | Writes |
|---|---|---|
| Dashboard | `project.json`, recent files | opens the project; shows what changed |
| Copy deck (new) | `copy/` | `copy/deck.json`, `copy/deck.md` |
| Template Studio | copy slots, assets, design systems | templates, exports, slot edits |
| Ink bleed, riso, image effects | copy slots for their text, assets | their files, rendered images into `assets/` |
| Split flap | copy slots for its boards | its boards |

The image tools writing rendered pictures into `assets/` is what joins them to Template Studio's
effects plan: an ink-bleed headline made in ink bleed shows up in the email's Assets panel.

## Phases

| | Builds | Done when |
|---|---|---|
| **0 · A project** | `project.json`; the dashboard opens a folder and stores the handle; a shared `project.js` every tool loads to get it; the Allow editing button in every tool. | Open a folder on the dashboard, open any tool, and it knows the project without a picker. |
| **1 · Tools save into it** | Each single-file tool saves and loads its own folder; rendered images go to `assets/`; Template Studio reads the stored handle. | Close everything, reopen the dashboard, and every tool's work is where it was left. |
| **2 · The copy deck** | The deck tool: pieces, slots, alternatives, status; Markdown and `.docx` import with a mapping step; `deck.md` written alongside. | A writer imports a doc, pitches three headlines, marks one chosen. |
| **3 · Binding** | Slot references in Template Studio fields first, then the other tools; the chip; unbind. | The chosen headline appears in the email and on a split-flap board. |
| **4 · Both ways** | Writes from tools back to slots, the channel for live updates, the both-changed prompt, the history. | Change a headline in the email and watch the deck update in another tab. |
| **5 · Documents out** | `.docx` export of the deck; a decision on Google Docs. | The deck leaves as a document someone can mark up. |

## To decide first

1. **Is the deck its own tool or a panel in every tool?** The plan says its own tool, because
   writers should not have to open a design tool to write, with a small slot picker inside each tool.
2. **Does every tool have to join?** Tools without a project still work as now. A project is an
   addition, never a requirement.
3. **Which document formats matter first?** Markdown and `.docx` are assumed. If the writers live in
   Google Docs, phase 5's hosting decision moves up.
