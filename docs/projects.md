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
