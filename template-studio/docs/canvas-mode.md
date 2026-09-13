# Canvas mode

*A plan. Written 2026-09-12, after groups, the spacing overlay and frame patching landed (learnings
3.59–3.61). Nothing here is built. The word "board" below is what the code will call it, because
"the canvas" already means the email preview throughout this project; "Canvas mode" is what the
interface will call it, because that is what Jared calls it.*

## What it is

A second way to look at a project folder. Instead of one email at a time, every email in the
folder sits on an endless surface — pan, zoom, arrange — and each one is live: click a block and
you are editing it exactly as you do today, with the same inspector, the same palette, the same
checks. Assets sit beside them. Notes and arrows say what the emails are to each other. Export
checks every email in a flow and packages them for HubSpot as one thing.

The example that drove it: a new-member sign-up flow. First message, welcome, onboarding, about
your club, "how was your first week?". Five emails that are one piece of work, that share a design
system and a tone, that are read in order — and that today are five files opened one at a time.

## What it is not, yet

Not a campaign tool for social and print, and not a review tool with links for stakeholders.
Both are where this points, and the last section says what each would take. The plan is scoped
to emails because emails are what the compiler compiles and what the checks check; the surface
has to be right before a second kind of thing goes on it.

## What stays exactly the same

- **An email is a template file.** `templates/<name>.template.json`, edited by the same editor,
  saved by the same autosave, exported by the same compiler. The board holds *where* it sits and
  *what it is next to*, never its content. One template can sit on two boards and is one file.
- **The design system is the folder's.** Every email on the board follows
  `design-systems/<name>.system.json` the way it does now — which is the feature the board makes
  visible: change a token and five emails move at once, in front of you.
- **Patterns are the folder's.** Save a section from one email, place it in the next.
- **Checks and export per email.** The package is those, run across a flow, with a manifest.
- **The hosting model.** Static site, local folder, Chrome (learnings 3.58). Nothing here needs a
  server. The section on review links says what would.

## Concepts and data

A **project** is a folder — the workspace that exists today. A **board** is a file in it:

```
boards/new-member-flow.board.json
```

```json
{
  "schema": 1,
  "id": "brd_2f1a",
  "name": "New member flow",
  "viewport": { "x": 0, "y": 0, "zoom": 0.6 },
  "items": [
    { "kind": "email", "id": "i1", "template": "tpl_9c0e", "file": "welcome.template.json", "x": 0, "y": 0 },
    { "kind": "email", "id": "i2", "template": "tpl_a44b", "file": "onboarding.template.json", "x": 760, "y": 0 },
    { "kind": "asset", "id": "i3", "path": "assets/hero-club.jpg", "x": 0, "y": -420, "width": 320 },
    { "kind": "note",  "id": "i4", "text": "Warm, short. First names.", "x": 400, "y": -300, "width": 220, "color": "yellow" },
    { "kind": "frame", "id": "f1", "name": "Onboarding", "x": -40, "y": -40, "width": 3900, "height": 1400, "items": ["i1", "i2"] }
  ],
  "connectors": [
    { "id": "c1", "from": "i1", "to": "i2", "label": "3 days later" }
  ]
}
```

Rules that keep it honest:

- **Emails are referenced by the template's own `id`**, with the file name as a hint. A renamed
  file still resolves; a template deleted from the folder shows as a missing card rather than
  silently vanishing from the board. The same shape as a pattern instance (learnings 3.5x).
- **The board stores geometry and relationships only.** Positions, sizes, frames, connectors,
  notes, the viewport. If a value would change what an email *renders*, it does not belong here.
- **A frame is a flow.** An ordered list of email items. Export packages a frame. An email can be
  in one frame at most; emails outside any frame export alone, as today.
- **Deleting a card never deletes a file.** It asks.
- **Schema and migrations** from day one, the same `migrate()` discipline as templates. Boards
  are files in a synced folder; two people will open one.

## Editing on the board

**The surface.** Pan with space-drag, two fingers, or the middle button; zoom with pinch or
⌘-wheel; `1` for 100%, `0` to fit everything, `2` to fit the selection. Rendered as one
transformed container — every card, its overlay and its connector share the transform, so the
Preview component's overlays stay right by construction and only drag *deltas* need dividing by
the zoom.

**Cards are live.** An email card is the Preview component with an editor of its own behind it:
its own undo stack, its own autosave, its own file. Click a block and that email becomes the
*active document*: the inspector shows the block, Layers shows that email, the keyboard goes
there. Drag a card by its title bar to move it. Escape climbs — text, block, card, nothing.

**One policy, routed.** Today's keyboard policy lives in App and the canvas forwards to it. On
the board it stays one policy and gains one question — *which document* — answered by the active
card. Undo is per document, which is what "edit the same as one email" means; a global undo across
five emails is a different promise and not one to make by accident.

**Between emails.** A block dragged from one card to another moves, as it does within an email,
and its HubSpot field names are re-minted on arrival (learnings 1.10 — two emails may share a
name, one email may not). A palette drop lands in whichever card is under it. An asset card dropped
on an image block sets it. Copy and paste already cross files through the clipboard; the board
makes it a drag.

**The shared system.** One design-system store per project, subscribed to by every editor. When
one editor writes the system file, the others re-materialise from it rather than from their own
copy; the toast says which file moved. This is the piece today's single-document editor does not
have, and the one most likely to be wrong the first time.

**Flow furniture.** Frames with a name and an order; connectors from card to card with a label;
sticky notes for direction ("warm, short, first names"). An *Arrange* action lays a frame's emails
out left to right at their natural height, because a flow reads as a row and nobody wants to align
five 600px columns by hand.

**The sidebar.** The same five tabs. Files gains boards. Blocks drops onto any card. Layers is the
active email's. The inspector shows a card's settings when a card is selected — name, subject line,
HubSpot label, which frame — and the block when a block is.

## Export: checks and a package

Export on a frame runs the checks on every email in it and shows one drawer, findings grouped by
email, errors first. An error in any email blocks the package; the same gate as today, five times.

The package, written to the folder or downloaded as a zip when there is none:

```
exports/new-member-flow/
  01-welcome.html
  02-onboarding.html
  03-about-your-club.html
  04-first-week.html
  manifest.json        order, file names, HubSpot labels, subjects, template ids, checked-at
  README.md            what to upload where, in which order
```

Into HubSpot, three ways, all of which the package serves:

1. **Design Manager**, multi-select the files and upload them into one folder. The manual path,
   and the one that exists today for one file.
2. **The HubSpot CLI**: `hs upload exports/new-member-flow @hubspot/emails/new-member-flow`
   pushes the folder in one command for anyone with the CLI configured. The README says the line.
3. **The API**, from the app, is not on this plan: HubSpot's source-code API needs a token that
   must not live in a static page, and its endpoints do not answer browser origins. It needs a
   small proxy, which is a hosting decision (see the last section), not a feature.

The zip is written by us — a store-only writer is sixty lines and adds no dependency. Compression
would save nothing worth having on files this size.

## Rendering many emails at once

Ten live iframes at 600px is fine; fifty is not. Three levels of detail, chosen by zoom and
distance from the viewport:

- **Live**: the Preview iframe, editable. The dozen or so cards nearest the viewport.
- **Still**: the same iframe with listeners off and pointer events none, when zoomed out past the
  point where a block could be aimed at. Cheap to switch, keeps the pixels.
- **Placeholder**: name, size and a tint, for cards far off screen. Upgraded on approach.

Two things already in place make this cheaper than it sounds. A body-only change patches the live
document rather than reloading it (learnings 3.61), so typing in one card does not touch the
others. And compile plus checks are about a millisecond per email, so a design-token change that
recompiles every card is a frame's worth of work, not a wait.

Thumbnails for the placeholder level come later, through `rasterise.ts`, and only for emails whose
images are local assets — a remote image taints the canvas and the picture cannot be read back,
which is the same limit rendering-as-image has now.

## Architecture

```
src/board/            pure, DOM-free, tested under Node (the purity test extends to it)
  board.ts            the file: types, parse, serialise, migrate
  arrange.ts          layout of a frame's emails
  package.ts          the flow export: manifest, README, the zip writer
src/app/board/
  Board.tsx           the surface: transform, pan, zoom, marquee, hit testing
  EmailCard.tsx       an editor + Preview at a position; title bar; active state
  AssetCard.tsx, NoteCard.tsx, FrameShape.tsx, Connectors.tsx (one SVG layer)
  useBoard.ts         board state, undo for the board itself, autosave to boards/
  useDocuments.ts     one editor per open email; the active one; the shared system store
src/workspace/        boards(), writeBoard(), writeExportFolder() alongside what exists
```

`App.tsx` gains a mode — Email, the tool as it is; Canvas, the board — and the two share the
sidebar, the inspector and the keyboard policy. The Preview component gains one prop, the zoom,
for its drag deltas, and nothing else; it already knows nothing about where it is.

## Phases

| | Builds | Done when |
|---|---|---|
| **0 · Surface** | Mode switch. Board file and its workspace calls. Pan, zoom, fit. Email cards with a live Preview, read-only. Positions persist. | Open a folder, see every email laid out, move them, close and reopen to the same board. |
| **1 · Editing** | One editor per card; the active document; inspector, Layers, palette and keyboard routed to it; per-email autosave; the shared design-system store; drags between cards. | Edit five emails without leaving the board, undo in each, change a token and watch all five move. |
| **2 · Flow** | Frames, connectors, notes, arrange. New email and duplicate email from the board. Asset cards, dropped onto image blocks. | Lay out the new-member flow with its arrows and notes, and read it as a flow. |
| **3 · Package** | Checks across a frame, one drawer. The export folder, the manifest, the README, the zip. | Export the flow, upload the folder to HubSpot in one go, send a test. |
| **4 · Scale** | Levels of detail; placeholders; thumbnails for local-asset emails; many boards per folder. | A folder with forty emails opens and pans without a stutter. |

Phase 0 is two or three days; each of the others is about a week. Phase 3 is the one to test
against a real send early, because a manifest that HubSpot does not need is just a file.

## Risks

- **Many iframes and focus.** Every iframe can take keyboard focus; the policy has to know which
  one has it, and clicking between cards must not lose a selection in another. The active-document
  rule above is the answer; it has to hold under drag, paste and the slash menu too.
- **The shared system store** is the first place two editors share live state. Get the direction
  of flow right — the file is the truth, editors read it — or two cards will disagree about a
  colour.
- **Two people, one board file.** The same conflicted-copy risk as templates (learnings 3.58),
  with more to lose: a board is a whole day's arrangement. The same re-stat before write, and a
  board that reloads from disk when the file changes underneath it.
- **The transform and the overlays.** Everything in one transformed container, or the spacing
  overlay and the drop indicator will be off by the zoom on the first day.
- **Scope creep toward a whiteboard.** Miro's feature list is not the goal; the goal is five
  emails on one surface that edit like one. Notes, arrows and frames are enough furniture.

## Later, and what each needs

**A campaign canvas** — social, print and email for one campaign, on one board. The board is
ready for it: an item kind per asset type. What each type needs is a *renderer* of its own — a
social image is a rasterised composition with a size and safe areas, a print piece is a page — and
the design system feeding all three, which it can, since it is already tokens and type roles. The
first non-email type should be the one with the smallest renderer: a social image is a heading, a
picture and a background at a fixed size, and most of that exists in `rasterise.ts`.

**Review links and comments** — a link a stakeholder opens to see the flow and leave comments,
without the tool, the folder or Chrome. This is the one thing on the list that a static site with
a local folder cannot do, and it should be decided as a hosting question rather than built around:

- *Read-only review page*: an export the app writes (the emails rendered, laid out as on the
  board) that anyone can open from a link — needs somewhere to put a static page per review, which
  Pages can be.
- *Comments*: need a place to live that the link's readers can write to. A small backend (a
  worker with a key-value store), or a service that already does this. Whichever it is, comments
  should come back *into the board* as notes on the card they were left on, so the designer sees
  them where the work is.
- *Who is a reviewer*: a link with a token, no accounts. Comments carry a name typed once.

None of that changes the board's data model, which is why it can wait.

## To decide before phase 0

1. **One board per folder, or many?** Many is the general case and costs a Files section; one is
   simpler and probably what a project folder is. The plan assumes many, named, with the first
   created on demand.
2. **Can an email exist only on the board?** A draft card that has not been saved as a file yet.
   The plan says no: a card is a file from the first edit, the way New works today, so nothing is
   ever only in the board.
3. **Does Canvas mode replace the single-email view, or sit beside it?** Beside, for now — the
   single view is the board zoomed to one card, and a switch costs nothing. If the board is what
   gets used, the other view can go later.
4. **What the package is called and where it goes.** `exports/<frame-slug>/` above; the alternative
   is one zip per frame with no folder. The folder is easier to diff and to `hs upload`.
