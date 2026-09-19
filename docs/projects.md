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
- **The dashboard leads with it.** Project is a section of its own above the tools, not card 07. It reads
  the open project through `project.js` and shows its name, type and counts, and a map of `board.json` laid
  out the way the board lays it out, groups and lines included. With no project open, the map shows an
  example campaign. It gives Chrome its click to reopen a project, and leaves picking folders and writing
  into them to the board. Below that, a row of project types links to `project.html?create=<type>`, which
  opens Create a project with that type chosen.
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

### Creating a project

> "have a 'create a project' option - prompts to choose a destination and create the project folder
> structure. this could be a template system for different types of projects."

**Create a project** is on the welcome screen and in the project menu. It asks for a type and a name, and
shows exactly what will be written. Then it asks where to put the project, makes the folder, and opens its
board.

- **Types are data.** Each type lives in `template-studio/src/model/project-types.ts`: its folders, the
  frames it starts with at their sizes, and its starter emails. Adding a type is one entry there.
- **Starter content.**
  - A starter frame is a real frame file with its name written on it.
  - A starter email is a short email that follows `design-systems/switchyards.system.json`, which is
    written alongside it.
  - Every project also gets a `README.md` saying what goes in each folder.
- **Where it goes.** The project is made as a new folder, named for the project, inside the folder chosen.
  - If the chosen folder already has the project's name and is empty, it is used as it is. That covers
    making the folder inside the picker first.
  - A folder with that name that already has things in it is never written into.
  - Chrome won't let a page choose Desktop or Documents themselves, so the dialog says to pick a folder
    inside them.
- **The project's id.** A created project gets an id of its own, and `project.json` records its type.
- **It starts clean.** A created project does not take in the loose frames this browser kept from before;
  those wait for an existing folder to be opened. A frame made in Freeform while the project is open belongs
  to it from the start, and so does one made with the board's New frame.

| Type | Folders | Starts with |
|---|---|---|
| Campaign | all five | an email; Email hero 600 × 300, Square post 1080 × 1080, Story 1080 × 1920, Poster 1200 × 1600 |
| Email | all five | an email; Email hero 600 × 300 |
| Social media | frames, assets, exports | Square post 1080 × 1080, Portrait post 1080 × 1350, Story 1080 × 1920, Landscape post 1200 × 628 |
| Print | frames, assets, exports | Poster 1200 × 1600, Flyer 850 × 1100, Postcard 900 × 600 (print proportions, not print resolution) |
| Blank | templates, frames, assets | nothing |

"All five" is `templates/`, `frames/`, `assets/`, `design-systems/` and `exports/`.

### Opening a project from Finder

*Added 2026-09-13.*

> "is there a way to create a .scug file that lives in a project folder that when clicked on launches the
> dashboard in a browser. or better yet a local version of the webtool?"

Every project folder holds `<name>.scug`, and the site installs as a Chrome app that opens that file type.
Double-clicking the file in Finder opens the app on that project's board.

- **The file.** JSON with the project's id, its name, the Project page's URL, and a line saying what it is for.
  Create a project writes it, and a folder opened as it was gets one the first time it is open for editing. A
  file written from the local server still names the live site.
- **Why the id and not the folder.** A page can only reach a folder through a handle Chrome stored for it. So
  every project this browser opens is remembered by id as well as as "the" project, and the launch looks the
  folder up by the file's id. Found: the project opens, with the click Chrome wants after a restart. Not found:
  the page asks for the folder once, and takes it only if its `project.json` carries the id or it holds the
  launched file by name.
- **The app.** `template-studio/public/manifest.webmanifest`, copied into `dist/`, with the whole site as its
  scope, the dashboard as its start page, and `project.html` as the handler for `.scug`. Every page links it.
  **Install as an app** is on the Project welcome and in the project menu when Chrome offers it. No service
  worker: the app is always the site as deployed.
- **Not the local app.** A real local app (Electron) would get the folder from the file's own path with no
  permission clicks. It would need an adapter under every File System Access call and a signed build to
  distribute, so it waits until the clicks are the actual pain.

### Riso and ink bleed save into the project

> "yup and then take whatever the next step is." (after: "Riso and ink bleed save into the project")

The single-file tools load `project.js` from the site's root. It finds the project the board or Template
Studio opened (the same stored handle), shows it in the tool banner with the one click Chrome may need,
reads and writes its files, offers a picker over its pictures, and tells the board when something was saved.

- **Riso.** **From the project…** loads a picture from `assets/`. **Save to project** writes the print into
  `assets/` at the press size, as `<picture>-riso.png`. It writes a recipe beside it,
  `riso/<name>.riso.json`, naming the picture it was printed from and holding the inks, press and seed.
  Saving again writes over the same print, so the button says which file it saves to.
- **Ink bleed.** The project's SVG pictures are stamps. A layer keeps a stamp as `project:assets/…`, so it
  comes back after a reload, which a stamp dropped from the computer cannot. **Save to project** writes the
  PNG into `assets/`, with a recipe in `ink-bleed/` naming the stamps it used and holding every setting.
- **Recipes.** Both are `{ version: 1, tool, output, sources, settings, savedAt }`.
  `template-studio/src/model/tool-recipes.ts` reads them.
- **The board.**
  - **Lines.** A pink line runs from each source picture to its result, and the result's card says which
    tool made it.
  - **Opening a result.** ↗ or a double-click opens it in its tool with its recipe (`?recipe=`), so the
    settings come back.
  - **Opening any other picture.** It opens in Riso (`?picture=`), or in ink bleed as a stamp for an SVG
    (`?stamp=`).
  - **Refreshing.** The board refreshes as soon as a tool saves.
- **Template Studio's frame list** shows the open project's frames only. Loose frames appear only when the
  project takes them in. Any frame the email already follows always stays listed.

### Groups on the board

> "I make a frame and name it 'social media'." (the board plan's B3, called a group on the board so it is not
> mistaken for a Freeform frame)

A group is a named region of the board that is a folder under `assets/`. It belongs to a group because its file
is in the group's folder, whatever the region looks like. `board.json` keeps each group's name, folder, place
and size. The rules are in `template-studio/src/model/project.ts` and `src/model/asset-moves.ts`.

- **Making one.**
  - **New group.** New group in the dock makes `assets/group-n/`, puts the group in the middle of the view,
    and opens its name for typing. While a group is empty, renaming it renames its folder too.
  - **From Finder.** A folder made in Finder or Drive gets a group of its own, sized for its pictures, in a
    row below everything else.
- **Filing a picture.**
  - **Into a group.** Drag the picture over a group; the group lights up, and letting go moves the file into
    the group's folder.
  - **Out of a group.** Dragging it out of every group moves it back into `assets/`.
  - **References follow.** The picture is renamed in every email that shows it (image blocks and freeform
    layers), in every frame file, and in the recipes of whatever made it or was made from it.
  - **A safe order.** The copy is written first and the original removed last, so a move that stops half-way
    leaves two copies rather than none.
  - **Frames update everywhere.** A rewritten frame file is dated now, so every browser that keeps the frame
    takes the new copy.
- **Arranging.**
  - **Moving.** Drag a group's header to move it, with its pictures and anything else sitting inside it.
  - **Resizing.** Drag the corner to resize. A group is always drawn big enough for its members.
- **Removing.** ✕ asks once, then takes the pictures back out into `assets/`, removes the group, and deletes
  its folder if nothing is left in it.
- **Tools.** Riso prints into the folder its picture is in, so a photo in Social media prints into Social
  media.

A type made from an existing project, "save this project as a type", is the natural next step. It needs frames
and the emails that follow them given new keys on the way, so two projects never share a frame.

**Not yet:**
- The copy deck (phases 2 to 5).
- Saving into a chosen group from the tools (B4). Riso prints beside its picture; ink bleed saves into `assets/`.
- Renaming a group's folder once it has pictures. The group takes the new name, and its folder keeps the old one.
- An email open in Template Studio while one of its pictures is moved keeps the old name until it is reopened.
  Saving it first shows the usual "changed on disk" warning.
- Image effects and split flap saving into the project. They can load `project.js` the same way.
- Thumbnails written on save; the board draws live, and only what is in view.
- Two machines editing the same frame at once is last save wins, with no both-changed prompt.
- Riso prints at the press size (900 px on the long side), not the picture's full size.

### The board, second pass

*Added 2026-09-14.*

> "take a pass at the projects canvas to feel more like a project management tool. still as a canvas, but more
> serious with clean ui and modern UX that still hints to the early days of computer interfaces without being
> cliché. … Make it where images are flat until you hover over and they show their chrome. Think about default
> image folder structures to bring with templates."

The board is set in the dashboard's system now (Enkel): one sans for words, mono for figures, hairlines for
structure, square everything but what you press, no shadows, and nothing that bounces. What survives of an older
screen is the drafting grid under everything, a status line along the bottom, corner marks on the selection, and
cards as small windows with a thin title bar. `template-studio/src/project/project.css` carries the tokens; the
board loads no fonts of its own.

- **The bars.** A header across the top holds the project (name, type, the menu) and the verbs: Add + Email, +
  Frame, + Pictures, + Group, + Link, then zoom and Fit. A status line along the bottom says where the project is
  saving, the hint, and the counts in mono. The floating pills and the dock are gone.
- **Cards.** A thin title bar: the name on the left, what it is and its size on the right in mono, ↗ on hover. A
  selected card gets corner marks; a dragged one a firm border. Lines are 1px in the data palette, ink when they
  touch the selection, with a square at the arrow end.
- **Pictures are flat.** A picture is only the picture until the pointer is over it or it is selected; then its
  title bar slides over the top edge and the frame appears. No checkerboard, no card behind it.
- **Groups** are hairline regions on the paper: the name, `assets/<folder>/ · n` in mono, Remove on hover, a
  square resize handle. An empty group says what dropping on it does. Filing and moving are unchanged.
- **Starter folders.** Every type but Blank starts with picture folders under `assets/`, each a group on the
  board from the first look: Campaign has `photos/`, `logos/`, `social/` and `print/`; Email `photos/` and
  `logos/`; Social media `photos/`, `logos/`, `social/`; Print `photos/`, `logos/`, `print/`. They are data in
  `model/project-types.ts` (`groups`), the README explains each, and the create sheet shows them under `assets/`.
  With them, a folder under `assets/` is a group whether or not anything is in it yet, so a folder made in Finder
  shows up before its first picture.
- **Documents** are a fourth kind of card (below). Every type but Blank also gets a `docs/` folder for them.

### Moving around, and drawing, after Canvas Kit

*Added 2026-09-14.*

> "take the good ideas and look at their code for ideas of how to implement some of those features into this
> canvas. also give the canvas some physics so it slides with momentum and feels natural to move around in."

Canvas Kit (github.com/yaye-work/canvas-kit, MIT) is an Obsidian plugin and no backbone for this, but four of its
ideas were worth taking. They are implemented from scratch here in three small modules, credited in their headers.

- **Momentum** (`app/inertia.ts`). Both canvases, the board and the Freeform surface, read the hand's speed from
  the last 120 ms of a pan and keep sliding when it lets go, decaying exponentially (time constant 320 ms) to a
  stop. A drag that had already stopped stays put; a fling is capped so the board is never thrown away. The next
  touch, wheel or flight stops the slide. Off under `prefers-reduced-motion`.
- **Fingers** (`app/gestures.ts`, `tests/gestures.test.ts`). Two fingers pan and pinch either canvas, about their
  midpoint, whatever tool is in hand; the second finger landing abandons whatever the first was doing, a
  half-drawn stroke included. On the Freeform surface a two-finger tap undoes and a three-finger tap redoes.
  Any touch while the pencil is on the glass, or within 400 ms of it lifting, is a palm and is ignored.
- **The pencil draws, the hand moves.** Once a pencil has been seen on the Freeform surface, a finger with a
  drawing tool in hand pans instead of drawing. Before any pencil is seen a finger still draws, so a phone is not
  locked out.
- **Quick shapes** (`model/quick-shape.ts`, `tests/quick-shape.test.ts`). Hold the pen still for 160 ms at the
  end of a stroke and the stroke is classified: a wobbly line becomes a line, level or upright when it nearly was;
  a loop becomes a rectangle or an ellipse at the angle it was drawn; three corners become a triangle. The ghost
  shows the shape dashed while the pen is held, so moving on unsnaps it. Anything uncertain stays freehand: a
  scribble, an open arc, a pentagon, a speck. The shape keeps the pen's colour and width and joins the marker
  session's drawing. The classifier follows Canvas Kit's: a minimum-area *rotated* bounding box, then the radial
  spread and the edge hug to tell a rectangle from an ellipse, and corner counting on a resampled loop for the
  triangle. One correction over the original: a near-round ellipse carries no rotation, since a circle's minimum
  box has the same area at every angle and the angle found is noise.
- **Drag to make a group.** On the board, + Group now arms a crosshair: drag out the region and the group is made
  that size, where the hand put it, with its name open for typing. A click without a drag puts one down the usual
  size at that point. Escape cancels. The old behaviour, a box in the middle of the view that steps clear of
  cards, is kept for the click.
- **The hand, on a thing.** Jared: "if i'm dragging around the canvas and land on an element and click and hold
  or space + click it should act as a hand. if I single click select the element." So on both canvases a press
  that stays still on a card or a layer for a beat (Canvas menu, Hold to pan, 320 ms shipped) becomes the hand,
  and dragging from there moves the view, not the thing; letting go without moving is still a click and selects
  it. Moving before the beat is up drags the thing as before. Space held makes every press the hand at once, on
  the board as it already did on the surface.

### Undo on the board, and the Canvas menu

*Added 2026-09-14.*

> "add the undo stack. pinch to zoom could be a little faster. make a menu with options that can be tweaked to
> dial in the canvas."

- **Undo** (`project/history.ts`, `tests/history.test.ts`). Every arrangement the hand makes on the board is a
  step that knows how to take itself back and do itself again: moving a card, moving or resizing a group, making,
  renaming or removing a group, filing a picture into a folder or taking it out, forgetting a missing card's
  place. ⌘Z and ⇧⌘Z, the Undo and Redo buttons in the header, or a two- and three-finger tap. Steps that move files
  are asynchronous, run one at a time, and a step that fails half-way is dropped from both stacks and reported,
  rather than left to be undone twice. What the board does on its own, placing a new file where there is room, is
  not a step. Adding pictures or links is not undoable either: the files came from outside and are removed in
  Finder.
- **The Canvas menu** (`app/canvas-settings.ts`, `app/CanvasMenu.tsx`). One set of dials for both canvases, kept
  in this browser and heard at once by every open page. Moving: momentum on or off and its glide time; pinch
  zoom speed and wheel zoom speed, as gains on the fingers' own spread, ×1.5 shipped for the pinch since one to
  one felt slow. Board: what lies under it and how strongly (see *What lies under the board*), the grid step, and
  snap to grid for cards and groups let go. Drawing: quick
  shapes on or off and how long to hold; whether a finger draws on the Freeform surface: until a pencil is seen,
  always, or never. Reset puts everything back as shipped. On the board it is the Canvas button by the zoom; on
  the Freeform page the Canvas pill.

### Linked cards sit together, and who else is here

*Added 2026-09-14.*

> "love the way files connect to each other. they need to be grouped closer together. What about adding one of
> these: cursor-party … that way if I have a project open and someone else opens the same project we can see each
> others cursors and interact."

**Layout.** A card with no place yet that is linked to a placed card now sits beside it rather than in its kind's
lane: to the right first, then below, then on along the row. The frame an email follows lands next to the email,
the picture a frame shows lands next to the frame, a Riso print next to the picture it was made from. Pictures in a
group stay in their group, because the folder is the truth. **Tidy** in the header lays an existing board out
afresh this way, groups lined up below with their names kept, as one undoable step. The dashboard's map still
lays new cards out in lanes; the board writes places within a second, so the map reads them.

**Presence.** Cursor Party and its cousin key their rooms by page address and place cursors in window
coordinates, which is wrong for a board every viewer pans and zooms differently. So this uses the same thing
underneath, PartyKit, with a server of its own: `template-studio/party/board.ts`, one room per project id, relaying
three things and keeping nothing: pointers in board coordinates, the card each person has selected, and a nudge
when a file was saved. The folder stays the truth; nothing about the project passes through but its id.

- On the board: the others' pointers as arrows with their names, the same size at every zoom; the card someone else
  has picked outlined in their colour with their name on it; the status line says who is here. A save in one
  browser makes the others look at the folder at once rather than at the next five-second look.
- Names and colours: a two-word name is picked the first time and kept in the Canvas menu (Together › Your name);
  the colour follows the name, so it is the same on every machine.
- **Running it.** `npm run party` in template-studio/ runs the server on `localhost:1999`; put that in Canvas ›
  Together › Server to try it. To have it on the live site: `npx partykit login`, `npm run party:deploy`, and the
  host it prints goes into `src/project/presence-config.ts`. PartyKit is the one hosted piece of this project;
  with no host set, presence is simply off.
- **Not yet.** Live co-editing of a template: two people in the same email is still last save wins, with the
  conflict banner. Presence makes the collision visible; it does not merge it.

*Removed 2026-09-19.* Presence never ran for anyone: it needed a deployed PartyKit host that was never set up, so
the board showed nothing and the server did nothing. Jared: "Currently the party server does nothing … Remove the
partykit." The server, the presence hook and config, the cursors and peer outlines on the board, the Together
section of the Canvas menu, the npm scripts and the dependency are gone. What the folder says is still the truth,
and two people on one project still meet the conflict banner rather than each other's cursors.

### Into a frame, a copy, and breaking a line

*Added 2026-09-14.*

> "If I hold down Option + drag an asset or item duplicate it. if I drag it into a frame or email, add it to that
> item. like i'm dropping it into the frame. make the ability to break a node/link an item"

The board's lines say what is in what; now the board can make and unmake them (`model/board-edits.ts`,
`tests/board-edits.test.ts`). Every one of these changes a file where it lives, so Template Studio and Freeform see
it as they would any save, and every one is a step Undo takes back.

- **Into a frame or an email.** Drag a picture onto a frame and it becomes an image layer, fitted to half the page
  and centred, saved as a new version of the frame so every browser takes it. Drag a picture onto an email and it
  becomes an image block of its own above the footer, with a field name of its own. Drag a frame onto an email and
  the email follows it, the same block Template Studio's panel would add. The target lights up while the pointer is
  over it, the notice says where the thing will go, and the dragged card goes back where it was: the file moved
  into the other file, not the card.
- **Option-drag copies.** Held at any point of the drag, Option leaves the original where it is and carries a copy,
  drawn dashed; letting go writes the copy beside the original, `hero-2.png`, `Spring launch copy`, a frame with a
  key of its own, a link file named for the copy, and places its card where the hand let go. Undo removes the copy.
- **Breaking a line.** Click a line and it is picked, ink among the others, with one verb at its middle: Break link.
  Delete does the same. A picture's line to an email or frame takes the picture out of it, blocks and layers both, and
  any section left empty. A frame's line to an email unlinks the block; it keeps its drawing. A recipe's line
  forgets that picture was part of the print. Escape, or a click on the paper, lets the line go.

*Same day, after a look:*

> "when you shift drag and make a copy. give the box a little duplicate looking icon in a single line drawing like
> the goolg docs icons. for the connecting nodes. use the thicker lines when you select an element to see what it's
> linked too. the reverse of how it is now."

- The copy carried under the hand shows a small two-sheets glyph in its header, one line weight, the way Google
  Docs draws Make a copy; no words.
- Lines rest quiet, at a third of their strength. Pick a card and its lines are the ones drawn full and thick, in
  their own colours, with bigger end squares; every other line fades further, so what a thing is joined to is the
  only thing the lines say at that moment. Before, every line was thick and the picked card's went thin, which
  read as the board shouting and the selection whispering.

### What lies under the board

*Added 2026-09-14.*

> "create a couple other background types. cutting mat, dot grid, and give opacity controls for them all."

Canvas › Board › Background is a four-way switch: Off, Lines, Dots, Mat (`project/ground.ts`, `tests/ground.test.ts`;
the drawing in `project.css` under `.pb-under-*`). The ground is a layer under the cards, a stack of repeating images
sized to the zoom and slid with the view, so it belongs to the paper and not to the window; zooming out, its step
grows ×5 and ×20 so the pattern never crowds.

- **Lines** is the drafting grid as before: a hairline every step, a firm line every fifth.
- **Dots** puts a dot where the lines would cross, and a bigger one every fifth crossing, which is also where snap
  to grid puts things. Quieter than lines under a board full of pictures.
- **Mat** is a self-healing cutting mat: the green, pale lines every step, firmer ones every fifth, and the 45°
  diagonals through their crossings. Shown at 60% or more the ground is dark, and the board's lines lighten a shade
  (a `dark-ground` class on the stage) so blue, green and brick stay seen against it.
- **Opacity** is the dial under the switch, and each background keeps its own: 50% shipped for lines (the same ink
  as before), 60% for dots, 85% for the mat, since a mat wants to be a mat and a grid wants to disappear. The dial
  blends the whole layer with the paper, so a mat at 30% is a hint of green with faint lines, not a green with
  strong lines.

The old `grid` flag in a browser's kept settings still reads: off then is Off now.

### The whole email, and Delete

*Added 2026-09-18.*

> "Show the whole length of an email in this view. allow deleting elements on the project board too"

- **An email card is as tall as the email.** The card used to be one fixed height and cut the email off below the
  fold. Now the preview measures its own document once it has laid out (the bottom of everything in the body, not
  the scroll height, which is never less than the frame it sits in) and tells the board, which sizes the card to
  the whole email at the card's width (`model/project.ts`, `emailCardSize`; a card may now bring its own size to
  the layout, `CardSource.size`). Until the first measurement the card is the old height, then it grows; Tidy lays
  a board out with the full heights.
- **Delete on the board.** Pick a card and press Delete or Backspace, or click the × beside Open in its title bar,
  and its file leaves the project: the email, the frame file, the picture under `assets/`, the board's own link
  file for a document. No question asked, the same rule as breaking a line: it happens, and Undo (⌘Z, or the
  header's button) writes the same bytes back under the same name and puts the card back where it was. What pointed
  at the file keeps pointing: an email that showed a deleted picture shows it as missing, and the notice says how
  many still do. Drive's own files for a Google Doc, Sheet or Slides are not deleted from here, since removing that
  file removes the document for everyone who has it; the notice says to remove it in Drive, whose trash can give
  it back. Nothing is offered when the folder is open view-only.
- **Template Studio's Files panel** got its × back the same day: the panel had always been able to show one, but
  the sidebar between it and the app never passed the delete through, so nothing in Template Studio could remove
  a file. The open file's × now stays visible, and on a screen without hover every row's does.

### One hidden folder for the tools' files

*Added 2026-09-14.*

> "can the file structure be setup in a way the project folder has a 'scug' folder that houses all the backend
> logistics, leaving a well structured folder depending on the project scope? … the goal is to have someone that is
> just looking for a file in drive can easily navigate and make sense of the file structure to find what they need
> and running into a bunch of .json files could cause issues."

A project now reads as work at the top, and everything the tools need to run it sits in one hidden folder
(`template-studio/src/model/layout.ts`):

```
Spring launch/
  Spring launch.scug        double-click in Finder opens the project
  README.md                 what goes where
  assets/                   pictures; each folder in it is a group on the board
  docs/                     briefs, copy, sheets: Google files or links
  exports/                  what ships
  .scug/                    the tools' own, hidden by Finder
    project.json  board.json
    templates/  frames/  design-systems/  patterns/
    rendered/               pictures Template Studio draws from text
    riso/  ink-bleed/       what the image tools made things from
```

- **Scope shapes the top.** Every type makes `assets/`, `docs/` and `exports/`; Blank makes only `assets/`. The
  tools' folders under `.scug/` are made only as a type needs them.
- **Names in documents did not change.** A picture is still `photos/hero.png` to every email and frame, and a
  rendered picture is still `rendered/lede.png`; only where the file sits moved. Board card ids, recipes and links
  are all unchanged.
- **A folder becomes a project when it has `.scug/`.** Template Studio still opens any plain folder as a workspace
  in the old shape, templates at the top or under `templates/`. Once a folder is opened on the board for editing,
  its tools' files are moved into `.scug/` and every tool writes there from then on.
- **Old projects.** The first time an old-shape project is opened for editing, `project/folder.ts` moves
  `project.json`, `board.json`, the tools' folders (only when they look like the tools' own: empty, or holding a
  file of the kind the tool writes) and `assets/rendered/` into `.scug/`. Copy first, remove last, the newer copy
  winning where both have a file. Until then, and for a project open view-only, every reader looks in both places.
- **Everything that reads a project knows both.** The board, Template Studio's workspace, Freeform's frame sync,
  the single-file tools' `project.js`, and the dashboard's own reader. Riso and Ink bleed write their recipes to
  `.scug/riso/` and `.scug/ink-bleed/` through `ScugnizziProject.recipeFolder()`.

### Google Docs, Sheets and Slides

*Added 2026-09-14.*

> "what can we do with google docs, sheets, and slides? can we show and possibly make them editable or pull
> content from them to use? … a project template creates google docs or sheets that someone that has access to
> that google drive can edit. another idea google doc with email copy. can we set that as a variable to use
> across projects?"

**What works today, with nothing to set up.** Google Drive for desktop writes a Google-native file in a synced
folder as a small file of its own, `Brief.gdoc`, `Budget.gsheet`, `Deck.gslides`, holding the document's
address. A project on a synced drive therefore already carries every document the team put beside its emails,
and the board reads them (`model/docs.ts`, `project/folder.ts` `listDocuments`) from the top of the folder and
from `docs/` and `copy/`. Each is a card: the kind's glyph, where it opens, and ↗ or a double-click opens it in
Google in a new tab, where anyone with access edits it as usual. A document that lives elsewhere is added with
**+ Link**, which writes `docs/<name>.link.json`; any address works, and a Google address is recognised for what
it is. Documents are laid out in a lane of their own between emails and frames.

**What each further step needs.** A page with no server can go a long way with Google, but every step past
"open it in Google" needs a Google sign-in in the browser and a Google Cloud project with an OAuth client
allowed for the Pages origin and `localhost:8770`, registered as internal to the Workspace so the consent screen
is the plain one. Tokens last about an hour and renew while the Google session lasts; an occasional click to
reconnect is expected.

| Want | How | Needs |
|---|---|---|
| Show the document on the board | A link card | nothing, done |
| Open and edit it | Open in Google, new tab | nothing, done |
| Show a live preview on the card | Embed the editor in an iframe | Unreliable: the editor in a frame needs third-party cookies, which Chrome is retiring. A document *published to the web* embeds read-only through its `/pub?embedded=true` address; that is a per-document choice in Docs. Not planned. |
| Pull the words out of a Doc | Docs API `documents.get`, walked into headings and paragraphs | sign-in, `documents.readonly` |
| Pull rows out of a Sheet | Sheets API `values.get` | sign-in, `spreadsheets.readonly` |
| Create Docs and Sheets from a template on Create a project | Drive API `files.copy` of template documents into the project's Drive folder | sign-in, `drive.file` for documents the app made or was shown; the template documents are picked once through the Google Picker, which grants them |
| Write words back into a Doc | Docs API `batchUpdate` | sign-in, `documents`; fragile against a writer's formatting, so only into documents the deck made |

**Copy as a variable, across projects.** This is the copy deck in phases 2 to 5 above, and the Google question
folds into it rather than replacing it. A deck is pieces and slots; a slot's text is bound into tools as
`copy:<piece>.<slot>`. A Google Doc becomes a *source* of a deck: the writer names it, the deck reads it through
the Docs API on request (headings are pieces, the bold label before a paragraph is a slot), and shows what
changed before taking it. "Across projects" is then a shared deck: a Library project, or a `library/` folder on
the drive, whose slots any project can bind to as `copy:library/<piece>.<slot>`, so one email footer, one legal
line or one address lives in one Doc and lands in every template. The board would show a bound slot's source
document as a card with lines to the emails that use it, the same way it shows pictures.

The first step is the deck itself with Markdown and `.docx` sources, because it needs no sign-in and settles the
data model. The Google source is the step after, and it is mostly the OAuth client and one API call.

**Recommended order**

1. Link cards (done). Put the brief and the copy Doc in the project folder through Drive, or add them with + Link.
2. The copy deck, phases 2 and 3, with Markdown and `.docx` sources.
3. Google sign-in in the browser, and a Doc as a deck source: read only.
4. Create a project makes the Docs and Sheets the type names, from template documents, in the project's Drive folder.
5. Writing back, only into documents the deck made.

### An email's card shows its frame as it is now

*Added 2026-09-19.*

> "I have a frame with edits on it being used in an email. but the email does not show the correct frame preview."

- **The board follows the frame before it draws.** An email that follows a frame keeps its own copy of the drawing,
  which Template Studio brings up to date while it is open. The board used to draw the email file as saved, so a
  frame edited since showed two ways: current on its own card, old on the email's. Now the board brings every
  followed block up to the project's frame files first, and reads the emails again whenever a frame changes. The
  email file itself is not rewritten from here; it catches up the next time Studio saves it or the board writes it.
- **Effects print on email cards too.** A page with riso or another effect used to draw flat on the email's card
  and printed on the frame's. The board prints every such page it can see and shows the print in the email's
  preview, one print shared by the frame and the emails that follow it.

### Small fixes, 2026-09-19

- **Freeform goes back to the board.** A frame opened from the board, or a new frame made from it, shows "← Board"
  in the canvas and returns to the board; the board comes back to the view it left. Opened from the tools it still
  shows "← Tools".
- **"not in a file".** Template Studio's save badge says so when the open email has no file: after its file is
  deleted from Files, or before a new email's first change. It used to say "saved".
- **The board lets old prints go**, and the Assets panel's thumbnails no longer take the browser's own image drag.
- **A deleted email stays deleted.** A template that sat at the top of a project was copied into `.scug/templates`
  on its first save, and deleting it removed only that copy: the original came back. Saving now moves the file, and
  Delete, in Template Studio and on the board, removes every copy of the name.

### Files first, and pictures into the email

*Added 2026-09-19.*

> "in template studio make the files the index screen and move files above blocks. allow the ability to drag an
> asset into the email and it creates the container needed for it."

- **Template Studio opens on Files.** The rail is Files, Blocks, Layers, Assets, Design.
- **Drag a picture from Assets onto the email.** It becomes an Image block where it lands: beside the block it was
  dropped by, or in a section of its own on a section edge or at the end. A click with no Image block selected adds
  it at the end; with one selected, the click still fills that block. Its alt text starts as the file's name and is
  edited in the Inspector. As with every local picture, Checks asks for a hosted URL before export.

### Follow-ups, 2026-09-19

- **"2 copies" in Files.** A name the folder holds in two places shows a small chip; clicking it removes the copies
  the list does not show, and Undo puts them back.
- **Drop a picture onto an Image block** and it replaces that block's picture; drop it beside and it is a new block.
- **Edit in Freeform opens in the same tab**, and the canvas's arrow goes back to that email in Template Studio.
- **The board** re-reads an email only when a frame it follows changes.

### The board bar, aligned

*Added 2026-09-19.* The bar's arrow, plus, minus and caret are drawn glyphs now, on the same line as the words; the
zoom steps are squares. Nothing moved or changed meaning.

### The board, six small things

*Added 2026-09-19.* The bar lost its Add label; Fit and a new Selection (⇧2) sit in the zoom group. The status line
says "Saves to" and shows one hint for the moment. Pictures carry their names. `?` opens the keys. The ground fades
as the board zooms out. The Canvas menu's segmented buttons and the project menu's rows sit on their line.

### Notes on the board

*Added 2026-09-19.*

> "let's add a 'notes' feature to the project board. so editor notes can be left next to objects."

- **Leave a note** with + Note, or N. With a card selected it is left on that card, to its right, and a dashed line
  joins them; it moves when the card moves, and stays behind if the card's file goes. Otherwise it lands in the
  middle of the window.
- **Write** at once, or double-click a note later. Escape drops the edit, ⌘Enter keeps it. Four paper colours and a
  Delete show on hover; ⌘Z undoes any of it.
- **Saved in board.json**, so everyone who opens the project folder sees the notes.
- **A colour is a kind.** Plain, Idea (yellow), Go (green), Stop (red). The word shows on the note.
- **On an email, a note can point at one section.** Pick it from the note's "on" row, before or after writing; each
  section is outlined on the email as the pointer passes over it in the list. Or drag the pin at the note's edge onto
  a card or a section; onto the paper unpins it. The line joins note and section, and the section is boxed while the
  note is picked.
- **Template Studio shows them.** Open an email that has notes and a "Notes" toggle appears in the tools row; the
  rail lists each note, outlines its section on hover, and selects it on click. Writing happens on the board.

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
