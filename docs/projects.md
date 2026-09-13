# One project folder for every tool

*A plan. Written 2026-09-13 from an idea of Jared's. Phase 0 and board phases B1 and B2 are built;
see [What is built](#what-is-built).*

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
  board.json                the project board: where each file sits, frames, notes (see below)
  assets/                   pictures every tool can use
    social-media/           a frame's files: one folder per frame
  design-systems/           as Template Studio has them now
  templates/                Template Studio's emails
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

## The project board

*Added 2026-09-13.*

> "the freeform canvas holds all project assets. like I was thinking of doing in the template studio
> (have a canvas view that you can see all the emails in) should really live as it's own way of
> viewing and managing a project … Frames could be made for assets that can be used in tools. I make
> a frame and name it 'social media'."

A project opens onto a board rather than onto a list of files. Every email, picture, freeform page and
copy piece sits on it as a card. Click a card and the view zooms into it and opens the tool that owns
it. Frames group cards, and tools use frames as places to take from and save to. This replaces the
multi-email view planned for Template Studio's Canvas mode: seeing the whole project is the project's
job, not one tool's.

**The folder is the truth; the board is only a view of it.** `board.json` stores where cards sit, the
frames and the notes, and nothing else. The files stay where the folder structure puts them. A file
added in Finder or Drive turns up in an *Unplaced* tray. A file that has been deleted shows as a
missing card rather than vanishing. If the board held the assets itself, the folder and the board
would drift the first time someone dragged a file in outside the app.

**A frame is a folder.** Naming a frame "Social media" creates `assets/social-media/`. Dropping a
picture into the frame puts the file in that folder. A frame knows its folder by a stable id, so
renaming the frame renames the folder without breaking any links to it. What a frame is *for* is set
on the frame, not guessed from its name: an optional size (Instagram post 1080 × 1080, story
1080 × 1920, email hero 600 wide), and which tools offer it. Ink bleed, riso and image effects then
show "Save to frame › Social media" and start at the frame's size, and Template Studio's Assets panel
lists frames as folders.

**One canvas engine, two documents.** The board reuses the Freeform canvas's view: zoom, pan,
selection, the dock, the layers panel and the mini menu. It has its own model, though. Freeform
layers are a recipe that becomes one picture; board cards are references to files. A standalone
Freeform page becomes one more kind of card.

**Cards are pictures until you zoom in.** Twenty live email previews on one canvas would crawl. Each
tool writes a thumbnail when it saves (`exports/thumbs/`). The board draws those, and swaps in a live
render only for the card you are zoomed into.

### Google Drive

There are two ways to reach Drive, and the first needs nothing new.

- **A Drive folder synced to the computer (recommended first).** Google Drive for desktop keeps a
  shared drive in sync with a local folder, and the dashboard opens that folder like any other. There
  is no sign-in and no server. It stays connected through the stored handle and Chrome's "allow on
  every visit", and the whole team sees the same project. The limits: Chrome on desktop only, everyone
  installs Drive for desktop, and two people saving the same file at once leaves a conflicted copy.
- **Drive's API directly from the page.** This is possible without a server: Google sign-in in the
  browser, then read and write through the API. It needs a Google Cloud project with an OAuth client
  allowed for `localhost:8770` and the Pages domain. The narrow permission only sees files the app
  made or the user picked. Seeing a whole existing folder needs the broad Drive permission, which is
  much easier to approve if it is registered as internal to the Workspace organisation.
  "Stay connected" is mostly true: tokens last about an hour and can usually be renewed silently while
  the Google session lasts, but a page with no server cannot hold a long-lived login, so an occasional
  click to reconnect is expected. Every read is also a network call, which the thumbnails help with.

Start with the synced folder. Build the API path only if people need the project without Drive for
desktop, on a machine that doesn't sync.

### Board phases

This is a second track after phase 1 below, and it does not wait on the copy deck.

| | Builds | Done when |
|---|---|---|
| **B1 · See the project** | The board as a view: cards for templates and assets, laid out automatically, thumbnails written on save, click to zoom in and open the tool. | Open a project and see every email; click one and land in Template Studio. |
| **B2 · Arrange it** | Moving cards, notes, the Unplaced tray, missing cards; `board.json`. | A board arranged by hand looks the same tomorrow, and a file dropped in Finder appears. |
| **B3 · Frames** | Frames as folders, with size presets and the tools they are offered to; drop in to file. | Make "Social media", drop three pictures in, and find them in `assets/social-media/`. |
| **B4 · Tools use frames** | Save to frame and open from frame in the image tools; frames in Template Studio's Assets. | An ink-bleed headline saved to Social media is on the board without anyone moving it. |

## Phases

| | Builds | Done when |
|---|---|---|
| **0 · A project** | `project.json`; the dashboard opens a folder and stores the handle; a shared `project.js` every tool loads to get it; the Allow editing button in every tool. | Open a folder on the dashboard, open any tool, and it knows the project without a picker. |
| **1 · Tools save into it** | Each single-file tool saves and loads its own folder; rendered images go to `assets/`; Template Studio reads the stored handle. | Close everything, reopen the dashboard, and every tool's work is where it was left. |
| **2 · The copy deck** | The deck tool: pieces, slots, alternatives, status; Markdown and `.docx` import with a mapping step; `deck.md` written alongside. | A writer imports a doc, pitches three headlines, marks one chosen. |
| **3 · Binding** | Slot references in Template Studio fields first, then the other tools; the chip; unbind. | The chosen headline appears in the email and on a split-flap board. |
| **4 · Both ways** | Writes from tools back to slots, the channel for live updates, the both-changed prompt, the history. | Change a headline in the email and watch the deck update in another tab. |
| **5 · Documents out** | `.docx` export of the deck; a decision on Google Docs. | The deck leaves as a document someone can mark up. |

## What is built

*2026-09-13.*

> "add the project folder - this could be a new tool that starts linking all these projects together
> and can turn into the project canvas that brings everything to one endless canvas."

**Project** is a tool of its own: dashboard card 07, `template-studio/project.html`. It is built from
Template Studio's source tree, so the board draws emails with the real compiler and frames with the real
canvas code. The code is in `template-studio/src/project/`, and the pure rules are in
`src/model/project.ts` and `src/model/frame-file.ts`.

- **One folder, every page.** The folder handle is stored where Template Studio always kept its own.
  Opening a project on the board opens it in Template Studio and Freeform with no picker.
- **Pages keep in step.** Pages tell each other through a `BroadcastChannel` (`scuggnizzi.project`), so
  an open Freeform tab picks up the project at once.
- **When Chrome needs a click.** After a restart Chrome usually wants one click before it opens a
  remembered folder again. Every page offers that click: "Reopen <name>" on the board and in Freeform,
  and a banner in Template Studio.
- **`project.json`** is written the first time a folder is opened for editing. Its id comes from the
  folder's name, so two pages opening a new folder at once agree on it. Once written it stays, whatever
  the folder is later renamed to.
- **The board.**
  - **Cards and lanes.** Every email, frame and picture is a card. Emails are live previews, drawn only
    once they have scrolled into view. Frames show their drawing, printed through Riso when they have it.
    Cards with no place go into lanes by kind.
  - **Arranging.** Dragging a card saves `board.json`. A card whose file has gone shows as missing, with
    a way to forget its place.
  - **Lines.** They show which frame an email's block follows, and which emails and frames each picture
    is in.
  - **Opening.** Double-click a card, or its ↗, to zoom in and open the tool: Template Studio at that
    file (`index.html?open=`), or Freeform at that frame.
  - **Adding.** Drop pictures on the board to add them to `assets/`. New frame opens Freeform with an
    empty frame.
  - **Keeping current.** The board reads the folder again on focus and every five seconds, so work saved
    in another tool, or synced in by Drive, turns up on its own.
- **Frames are files.**
  - **Where.** With a project open, each Freeform frame is also `frames/<name>.frame.json`. It is written
    a moment after each edit, renamed along with the frame, and deleted with it.
  - **Which copy wins.** The browser's copy stays the working copy, and an email follows it through
    storage events as before. Between the two, the later save wins, one frame at a time.
  - **Adoption.** A frame no project has yet, drawn before any folder was open, is written into the
    project that opens next. A frame another project has is left alone, and hidden while this one is open.
    A frame whose file was deleted from the folder leaves the list, but its drawing is kept in the browser.
- **Pictures go into `assets/`.** Pictures dropped on the Freeform canvas go into `assets/` when a
  project is open for editing. Pictures kept only in the browser from before the project are copied in
  too, so the folder has everything its frames are drawn with.

**Not yet:**
- The copy deck (phases 2 to 5).
- Frames as folders on the board (B3, B4).
- The single-file tools saving into the project (phase 1).
- Thumbnails written on save; the board draws live, and only what is in view.
- Two machines editing the same frame at once is last save wins, with no both-changed prompt.
- Template Studio's frame picker still lists every frame the browser keeps, not only the project's.

## To decide first

1. **Is the deck its own tool or a panel in every tool?** The plan says its own tool, because
   writers should not have to open a design tool to write, with a small slot picker inside each tool.
2. **Does every tool have to join?** Tools without a project still work as now. A project is an
   addition, never a requirement.
3. **Which document formats matter first?** Markdown and `.docx` are assumed. If the writers live in
   Google Docs, phase 5's hosting decision moves up.
4. **Does dropping a file into a frame move it or copy it?** The plan says move, so a file lives in
   one place. A picture can be in two frames only as a copy.
5. **Does everyone have Drive for desktop?** If yes, the synced-folder route covers Drive. If not, the
   API route and its Google Cloud setup move up.
6. **Is the board the dashboard?** Opening a project could replace the grid of tools with the board,
   with the tools on its dock.
