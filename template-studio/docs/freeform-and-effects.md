# The freeform block, and the effects from the other tools

*A plan. Written 2026-09-12, from two ideas in one message. Later the same day the freeform
block's phases 1 and 2 were built, and most of 3 (learnings 3.65, 3.67): the workspace, handles,
rotation, pictures from Assets, text in place. Not yet: guides and snapping. The effects are still
a plan.*

Jared: "A 'freeform' block that allows images, text and simple drawing tools to be used on a
canvas. When the project or file is exported it's saved as a static image for the email, or can
be rendered as an image anytime." And: "bring in the editing capabilities of other scugnizzi
tools. Example: I render a header text as an image and use the ink bleed filters here. When the
project or file is exported it creates that image exactly."

They are one plan because they share a spine: **a recipe that renders to pixels, kept in the
template, re-rendered on demand and on export, and never trusted as a cached picture.** The first
is a new kind of recipe. The second is a step any recipe can end with.

## What exists to build on

- **Render as image** (learnings 3.4x, `src/app/rasterise.ts`). A heading or a paragraph becomes a
  PNG of itself, drawn from what the canvas is showing, written to `assets/rendered/`, and the
  block becomes an image block that remembers the words (`wasText`) so it can go back. Two limits
  it already lives with, which the freeform block inherits: a remote image inside the picture
  taints the canvas and cannot be read back, so only local assets can be drawn; and a rendered
  file is a local asset, which the `local-image` check refuses to export until a hosted URL
  replaces it (learnings 3.36).
- **The image block**, its width, its alt, its HubSpot module or static rendering — the freeform
  block's *output* is exactly one of these.
- **The design system**: type roles, colours, fonts. A freeform block sets text in a role, not in
  a size, so it moves with the rest of the email.
- **The other tools** in this repo — the image effects editor, riso, ink bleed — each a single
  HTML file with the effect written inline against a canvas `ImageData`.

## The freeform block

**What it is.** A fixed-size drawing surface inside a block — the column's width, a height the
designer sets — holding layers: an image from the folder's assets, a piece of text in a type role,
a rectangle, an ellipse, a line, a freehand path. Select, move, resize, reorder; type into text
in place. It renders to one PNG at twice its size, which is what the email carries.

**What it is not.** Not Figma. Six layer kinds and a select tool are the whole vocabulary; no
boolean operations, no components, no vectors from files. The reason for the ceiling: everything
on it has to render to pixels identically on export, and every kind added is a kind that has to
render identically.

**The model** — vector, in the template, alongside the blocks:

```ts
interface FreeformBlock extends BlockBase {
  type: 'freeform';
  lock: Lock;              // the alt, editable or not; the picture itself is never a HubSpot field
  width: number;           // the surface, in the column's pixels
  height: number;
  background: ColorRef;    // null is transparent
  layers: Layer[];         // bottom to top
  effects: EffectStep[];   // applied to the finished picture, in order — see below
  rendered?: { src: string; hash: string; width: number; height: number };
}
type Layer =
  | { kind: 'image'; id: string; src: string; x: number; y: number; width: number; height: number; opacity: number }
  | { kind: 'text'; id: string; text: string; role: string; color: ColorRef; x: number; y: number; width: number; align: Align }
  | { kind: 'rect' | 'ellipse'; id: string; x: number; y: number; width: number; height: number; fill: ColorRef; stroke: ColorRef; strokeWidth: number; radius?: number }
  | { kind: 'line'; id: string; x1: number; y1: number; x2: number; y2: number; stroke: ColorRef; strokeWidth: number }
  | { kind: 'path'; id: string; points: Array<[number, number]>; stroke: ColorRef; strokeWidth: number };
```

`rendered` is a cache with a hash of everything above it. A picture whose hash does not match
its recipe is stale, and a stale picture is a check finding, not something the export ships.

**Rendering** goes recipe → SVG → PNG. The SVG is built by a pure function in `src/compile/`
(so it is testable under Node like the compiler): shapes as SVG elements, text as a `foreignObject`
carrying the same inline style the heading block emits for that role, images inlined as data URLs
from the asset's bytes. The app draws that SVG to a canvas at 2× and reads the PNG back, which is
what `rasterise.ts` does today for a block's markup. Then the effects run (below). Then the file
is written to `assets/rendered/<block>.png` and `rendered` is stamped with the hash.

**In the email** the block compiles as an image block — `<img>` in a padded cell, the width the
surface's, the alt the lock's — with the module or static shape the designer chose. The compiler
never sees layers; it sees a picture and a recipe hash, and `lint` compares the two.

**Editing** is the part that is new: a surface on the canvas, inside the frame, that takes the
pointer for its own tools rather than for block selection. Double-clicking a freeform block enters
it, the way double-clicking a paragraph enters its text; Escape leaves. Inside: a small tool strip
(select, text, image, rectangle, ellipse, line, pen), handles on the selected layer, arrow keys to
nudge, ⌫ to remove, ⌘D to duplicate, and the inspector showing the selected layer's numbers — the
same inspector, generated from a catalog of layer kinds the way it is from block kinds today.
While the surface is entered, the block's keyboard policy is the surface's, and the app's is
suspended, which is the same arrangement inline text editing has.

**Export** re-renders every freeform block whose hash is stale, writes the PNGs, and then runs
the checks. A folder that is not writable falls back to a download of each picture, as rendering
does now. The hosted-URL step is unchanged and unchangeable from here: HubSpot has to be given
the file, and the check says so until it has.

**Phases**

| | Builds | Done when |
|---|---|---|
| **1 · Recipe and render** | The types, the SVG builder, the render path through `rasterise.ts`, the compiler treating it as an image, the stale-picture check. No editor: a freeform block is authored as JSON in a test. | A test template with a freeform block exports a PNG that matches its recipe pixel for pixel across two renders. |
| **2 · The surface** | Enter and leave, select and move, resize handles, text in place, the tool strip for the six kinds, the layer inspector. | Draw the club's logo lockup over a photo with a caption, from nothing, without leaving the canvas. |
| **3 · Finish** | Layer order, alignment guides, snapping to the surface's edges and centre, opacity, duplicate, a swatch for the background. | Somebody who has used a slide tool can use this without being told anything. |

Phase 1 is a few days and is the one that settles whether the picture is exact. Phase 2 is a
week or more; it is a second editor.

## The effects from the other tools

**The idea.** A rendered picture — a heading rendered as an image, or a freeform block — can end
with steps from the other tools: ink bleed, riso, the image effects. The steps are part of the
recipe, with their parameters, so the same picture comes out every time, on every export.

**Where the effects live now.** Inline in each tool's HTML, written against a canvas and its
`ImageData`, sharing only `tool-kit.js`. To be usable from here they have to come out into a
module that takes pixels and parameters and returns pixels, with no DOM and no UI:

```ts
// effects/<name>.ts at the repo root — pure, deterministic, seeded
export function inkBleed(input: ImageData, params: InkBleedParams, seed: number): ImageData;
```

*Deterministic* is the whole requirement. Every effect that uses randomness takes a seed and the
seed is stored in the step, or "creates that image exactly" is not true. Every parameter has a
default and a range, so the studio can draw a dial for it without knowing what it does.

**In the template.** A step is `{ effect: 'ink-bleed', params: {...}, seed: 12345 }` on the block,
under `effects`, in order. Both the rendered heading and the freeform block carry the list; the
renderer runs them after the picture is drawn and before the file is written. The hash covers
them, so a changed slider makes the picture stale like a changed word does.

**In the studio.** An Effects panel on any block that renders to a picture: add a step from the
list, its dials appear, the preview re-renders as they move. The preview *is* the render — there
is no cheaper approximation to show, and the render is fast enough for a 1200px-wide picture.

**In the other tools.** They keep their own interfaces and import the same module, so an effect
tuned there and an effect tuned here are the same code. That is the point of extracting it, and
the reason to do the extraction first: one effect (ink bleed, since Jared named it), moved into
the shared module and imported back into its tool, proves the shape before the studio grows a
panel.

**Round trips to the tools** *(added 2026-09-13)*. Jared: "what about adding a way to take a freeform
frame and editing it in inkbleed or riso. or allowing those effects to be used in freeform?" It is
both, through the same module. The canvas's mini menu gets **Effects**, a few dials for quick
changes, and **Open in Riso** or **Open in Ink bleed** for every dial. The tool opens with the
picture already loaded, and **Back to Freeform** sends back the *settings*, not the pixels. The
settings become a step on the recipe. Sending back a finished PNG would leave pixels that stop
following the canvas the moment a word changes. Until the project folder exists, the hand-off
between tabs is the browser's own storage on the one origin, plus a `BroadcastChannel`.

**What reading the two tools showed.**

- **Both are already seeded** (`mulberry32`, "same seed, same result"), so determinism is mostly
  there already.
- **Riso is the easy one.** Its input is already any picture (`useImage`), and its pipeline is pixels
  in, coverage per ink, pixels out. A rendered freeform page is exactly that input. It caps the
  source at 900px, which has to lift to 2× for a 560px page.
- **Ink bleed is two things, and only half is a filter.** Bleed, smudge, photocopy rows and paper
  work on any ink field, so they can apply to a picture. The per-letter jitter and strike weight
  need to know where each glyph is, which ink bleed only knows because it lays out its own text.
  On a rendered picture those are lost. Keeping them means a canvas type style, say "Typewriter",
  whose letters go through ink bleed's glyph rasteriser, rather than an effect on the page.
- **Both recolour.** Ink bleed turns a picture into one ink, and riso into two or three. That is
  the look, but a colourful page comes back as its inks. The Effects menu shows it before you commit.
- **Neither is instant.** Ink bleed blurs full-size noise fields. With an effect on, the canvas
  draws the plain layers while something is being dragged and runs the effect when it settles.

**Scope.** Start with an effect on the whole page. An effect on a selection comes next: it draws
the selected layers as one picture and keeps them editable underneath.

**Phases** — 1 to 3 are built (2026-09-13).

- **The press** is `effects/riso.js` at the repo root, a plain script that sets `RisoEngine`. The separator loads it with a
  `<script>` tag, and Template Studio imports it through `src/effects/riso.ts`. Moving the code changed nothing: all three
  presets on the sample image fingerprint exactly as they did before the move.
- **On the canvas**, Effects sits at the bottom of the layers panel. It has the three presets, with their screens at half size
  (they were tuned on 900px photographs, and drawn lines lose their detail in dots that coarse). It also has the inks, the
  screen, Misprint, Ink soak, Paper grain, paper, Reshuffle and Open in Riso. The print is laid over the drawing once a change
  settles, and the drawing stays underneath so clicks still find their layers. The PNG export, the SVG export (the print goes
  inside as an image) and Template Studio's Render picture all print through `src/app/picture.ts`.
- **The round trip** stores `scuggnizzi.handoff.riso` (the plain picture at 2×, the settings, a session) and opens the
  separator with `?handoff=`. The separator loads the picture at its own size with `unit: 2`, saves under its own key, and
  Back to Freeform writes `scuggnizzi.handoff.riso.return` and closes its tab. The canvas takes the return from a storage
  event, on focus, or when it opens; it checks every value with `normalizeRiso` and removes both keys.
- **1:1 both ways** *(2026-09-13)*. The first version didn't match. The shared tool kit restores a tool's saved
  state after the document loads, which is after the hand-off had been applied, so the previous session's settings
  overwrote the ones Freeform sent (a 2 px screen came back 4.5 px). A hand-off now clears that session state first. Freeform also sends its
  zoom, and Riso opens at the same on-screen scale ("As in Freeform · 136%"). Checked by fingerprinting the pixels:
  Freeform's print, Riso's print and Freeform's print after Back to Freeform are the same bytes.
- **Saved looks** *(2026-09-13)*. "Save preset" in the Riso tool, or "Save look" on the canvas, writes to
  `scuggnizzi.project.riso-presets` (`{ version: 1, presets: [{ id, name, inks, press, seed, savedAt }] }`). Every tool on
  the site reads that list: the Riso tool beside its built-in presets, where each can be deleted, and Freeform under
  Effects. Freeform refreshes it when the Riso tab saves. Freeform checks each saved look with `normalizeRiso`. Until
  the project folder exists this storage is the project; the list is shaped to move into it as `presets/riso.json`.
- **Invert** *(2026-09-13)*. Any layer, or a whole drawing, can be inverted from the mini menu. Every inverted layer points at
  one `feColorMatrix` filter, set to user space so a straight stroke's box having no height cannot swallow it, and to sRGB so
  white inverts to black. It inverts before the print, so a photo can go into the Riso press as its negative.
- **On the email canvas** *(2026-09-13)*. Every freeform page with effects is printed once its recipe settles, and
  `app/printed-preview.ts` puts the print in the drawing's place on the preview string. It finds the drawing by
  producing it again with the compiler's own `freeformSvg` and design system, so the match is exact. The export never
  passes through it.
- **Linked to a Freeform app frame** *(2026-09-13)*. A freeform block can follow the frame the Freeform app keeps
  (`model/freeform-link.ts`). The block's panel shows the frame, with Link to this frame and Unlink. A linked block
  takes the frame's layers, size, background and effects whenever it changes, one undo step per burst of changes.
  Double-click, or Edit in Freeform, opens the app in a new tab. A frame with effects brings the ground it sits on in
  the app, so its print is the same bytes in any email section; the email print and the app's print were checked
  by pixel fingerprint. Template Studio reads the pictures Freeform keeps in IndexedDB (`app/kept-pictures.ts`), so
  the frame's photographs show. With no folder open, the browser now asks before leaving the page with unsaved edits.
- **Several frames** *(2026-09-13)*. The Freeform app keeps frames, not one canvas (`model/frame-store.ts`). An index
  at `scuggnizzi.freeform.frames` names them and says which is open, and each frame's drawing sits under its own key. The
  canvas kept before frames became Frame 1 under the key it always had, `scuggnizzi.freeform.v1`, so every block already
  linked to it still is. The frames pill beside Tools switches, adds, renames, duplicates and deletes, with thumbnails,
  and a delete can be undone. A copied frame gets block ids of its own, so a Riso hand-off from one can't land on another.
  Template Studio's panel is now a picker of every frame. A block whose frame was deleted keeps its drawing and says so. The
  studio pill and "Edit in Freeform" say which frame they mean. Storage goes through one small `KeyValue` interface,
  so the project folder can take its place.
- **Template Studio keeps the email** *(2026-09-13)*. With no folder open, the email is kept in this browser as it changes
  (`model/draft.ts`, key `scuggnizzi.studio.draft`), and once more as the page closes. It comes back on the next visit
  with a welcome-back note, and the badge reads "kept in this browser". With a writable folder open the draft is cleared,
  since the file is where the email lives. The leave-page warning now shows only if the browser refuses to keep the draft.
- **And back** *(2026-09-13)*. "It pulls in the free form frame. but there is no way to go from freeform -> template
  studio." An open Template Studio writes `scuggnizzi.studio.presence` (its tab id, its email, how many of its blocks
  follow the frame) every 20 seconds, and takes it away when the tab closes. The Freeform app's pill beside Tools reads it:
  **In Standard email** selects the linked block in that tab, **Send to Standard email** adds one above the footer, and
  with no Template Studio open, **Use in Template Studio** opens it with `?freeform=link`, which adds the block on load.
  Requests go through `scuggnizzi.studio.request`, addressed to one tab by id. Opened from Template Studio, Freeform
  closes its own tab so you land back in the email. It shows the print once the
  picture is rendered and hosted, the same way Checks already track every freeform picture.

| | Builds | Done when |
|---|---|---|
| **1 · Extract Riso** | `effects/riso.ts`, pure and seeded, source cap lifted; the riso tool imports it. Riso first rather than ink bleed: it is already pixels in and pixels out, so it proves the module's shape without untangling text layout. | The tool renders exactly what it rendered before the move. |
| **2 · Steps on a recipe** | `effects` on freeform pages (and rendered headings); the renderer runs them; the hash covers them; Effects in the canvas's mini menu with the dials the module declares. | A page with riso, exported twice, is the same bytes. |
| **3 · Round trip** | Open in Riso with the picture loaded; Back to Freeform returns the settings as a step. | Tune an ink in Riso, go back, and the canvas shows it and keeps following edits. |
| **4 · Ink bleed** | The filter half (bleed, smudge, photocopy, paper) as a step and a round trip; then the Typewriter canvas type for per-letter strikes. | A freeform headline looks typed, and a rubber stamp on the page looks inked. |
| **5 · The rest** | Image effects through the same door; effects on a selection. | Every effect in the repo is a step here. |

## What to decide

1. **Where the shared effects module lives.** `effects/` at the repo root, beside the tools, imported by
   the studio as a workspace dependency, or inside the studio and imported by the tools. Beside
   the tools is truer to "one code path"; the studio's tests then reach across the folder.
2. **Whether a freeform block can be editable in HubSpot at all.** As an image module the team
   could replace the picture with any picture, which loses the recipe. The plan says locked by
   default with the alt editable, and says so in the block's In HubSpot panel.
3. **Retina and size.** 2× is right for photos and text; a 560px surface becomes a 1120px PNG,
   about 150–400KB. Worth a check finding above a size, since a heavy picture is a heavy email.

## Layout tool, not whiteboard *(2026-11-10)*

Jared: the freeform tool is "too cute"; it should feel like Figma or Canva, and the built-in filters
need reworking. Decided the same day:

- **Sticky notes go.** The tool is off the strip and out of the Add list. Notes already in a frame
  still draw and edit, so nothing saved breaks.
- **Stamps become brand library assets.** *Not built yet.*
- **The pen stays**, for marking up and drawing in a frame.
- **Text looks go; brand presets take their place**, which can be tweaked, edited, deleted and
  added to. They live in the design system. Built; see below.
- **Effects work on a layer as well as the whole frame.** *Not built yet.*
- **Light and dark.** Built.

**What changed in the chrome.** Every colour on the canvas is a `--fig-*` token in `app.css`, with
light and dark values. The canvas follows the app's theme now, where before it stayed light. A
Theme row (System, Light, Dark) at the top of the Canvas menu sets `data-theme` on the root for
Template Studio and Freeform together (`app/theme.ts`, key `scuggnizzi.theme`). The springy
overshoot, tool wiggle, hover tilts, pop-in and poof are gone: there is one 120ms ease-out, and
fades. The rounded system font and fully rounded pills are gone too: corners are 4–8px. Layer icons
are one colour. Selection is one blue (`#0b6fd8`, medium blue; `#4b9eff`, light blue, on dark) and
always comes with a shape cue as well: handles, a filled tool, a ring on the picked swatch.

**Brand presets** *(2026-11-10)*. Jared: "Put brand presets in the design system." They are
`ds.canvasType`, the same field the old canvas type styles used, so every template and frame on a
design system shares them. A preset is type settings (font, weight, size, line height, tracking,
case, colour) plus four parts, each on or off: **stroke** (width, colour, on or outside the
letters), **shadow** (x, y, blur, colour), **highlight** (colour, how much of the line it covers)
and **curve** (bend). Wobble is gone: it was a novelty. A preset saved with the old single
`effect` reads as the parts that drew it (`normalizePreset`), and wobble's words set straight.

The shipped six keep their old keys, so text that picked one keeps it, but they are rebuilt and
named for use. *(Redrawn 2026-11-11.)* Jared: "Update the saved text presets to be less cheesy.
Dig through mymind for typographic styles I like." His saves kept returning to quiet tracked caps,
typewriter menus, painted shop fascias, script beside clean caps, a high-contrast display serif
and gilded window lettering, and never to outlines, drop shadows or highlighters. So the six are
type alone: **Letterhead** (tracked caps; the PY letterhead, El Bar's section heads), **Display
serif** (Georgia set tight; New Hideaki, the Butte des Morts sign), **Shop sign** (bold caps in the
palette's red; Trust Butchery, 24 HRS), **Supper club** (italic serif for script; El Bar, La
Panetteria), **Typed menu** (Courier caps, open leading; the stamped tasting-menu strips, Index
Monospace) and **Window gilding** (gold `#c9a13b`, antique gold, tracked bold caps on a gentle
arch; Victory Brands). Only the last uses a part, a curve. The fonts are the ones the design system
already has; a true script or a monospace with more character waits on fonts the picture can embed.

- **Design › Brand presets** lists them as samples drawn by the canvas renderer. New preset,
  Duplicate, Delete, a Name field, the type settings, and one row per part. Deleting a preset that
  text uses says how many layers will set back to plain type first. Deleting every preset leaves
  none, not the shipped ones.
- **On the canvas**, the text bar's chip picks a preset. Tune holds size, letter spacing and line
  height. Once the text is tweaked, *Update preset* writes the tweaks into its preset, and every
  text in it follows. *New preset* saves them under a new name and moves the layer onto it. Plain
  words can become a preset too. Either way the tweaks fold in and clear, so the picture does not
  change; one undo step. The code is `model/brand-presets.ts`.
- **Not yet:** in the Freeform app on its own, the design system is the frame's copy, so a preset
  saved there stays with that frame until the frame is in an email. Presets belong to Template
  Studio's design system first.
- A layer's old effect-strength tweak (`amount`) is no longer read.

**Properties and snapping** *(2026-11-11)*. Jared: "build the properties panel and snapping next."

- **Properties.** With a layer picked, the panel under Layers shows its numbers in place of the
  page's: X, Y, W, H, R (degrees) and Op (opacity), and a row of six buttons that align it to the
  page's left, centre, right, top, middle or bottom. A field commits on Enter, on leaving it, or
  on the arrow keys, and follows a drag on the canvas while it is not being typed into. A drawing
  (a group of strokes) shows the box around them and scales them together, and does not turn.
  Text shows its height but does not take one, since it is as tall as its words. Nothing picked
  shows the page, as before (`model/properties.ts`).
- **Opacity on every layer.** `opacity` is now on every kind, not only images, and draws as the
  layer's own `opacity`. At 100% the field is removed, so a recipe nobody fades is unchanged.
- **Snapping.** A layer or drawing being moved snaps its edges and centre to the page's edges and
  centre, and to every other layer's. A layer being resized snaps only the edges its handle moves.
  The pull is six screen pixels at any zoom. The lines it found draw while the drag lasts, in
  red-orange (`#f24822`) so they read apart from selection blue. A turned layer counts by the box
  its turned corners cover; a turned layer's own resize does not snap, and nor does a
  proportional (Shift, or stamp corner) one. Hold ⌘ or Ctrl to place freely, as in Figma. Canvas
  › Drawing › Smart guides turns it off (`model/snap.ts`).
- Arrow keys already nudged 1px, or 10px with Shift.

**The effects stack** *(2026-11-11)*. Jared: "Rework the effects system." Agreed the day before:
"Love the idea of layer effects versus whole image effects."

- **A stack, not one effect.** A page, or any one layer, carries `effects: EffectStep[]`, run top
  first. Each step can be switched off without being removed, has a strength from 0 to 100% (the
  result mixed back with what came in), moves up or down, and is removed on its own. The panel
  shows the stack of whatever is picked: one layer's, or the page's when nothing or a drawing is
  picked. Each row has an eye toggle; an off row is struck through and dimmed, so the state reads
  without colour.
- **The steps.** Adjust (brightness, contrast, saturation), Duotone, Halftone, Posterize, Grain,
  Texture, Blur, Vignette, and Riso. All but Riso and Adjust are the Image Effects tool's filters,
  moved into `effects/image.js` at the repo root beside `effects/riso.js` and typed by
  `src/effects/image.ts`. Two changes on the way: grain was `Math.random` and is now seeded, and
  halftone was drawn with canvas paths and is now computed per pixel. Both changes make the same
  recipe give the same bytes everywhere. Spatial settings are in page pixels at any render scale.
- **Per layer.** A layer with effects is drawn alone on a clear sheet, run through its stack, and
  laid over the layers below it. Every step but Blur keeps the layer's own transparency, so an
  effect stays inside its shape; Blur softens the edges too. The page's stack runs last, on
  everything (`app/picture.ts`). A layer's effects are part of its recipe, so a change makes the
  picture stale like any other edit. Everywhere that asked whether a page had effects now asks
  `hasEffects`, which counts layers and ignores steps that are off or at 0%.
- **Looks** replace a stack in one click: Film noir, Newsprint, Dirty 35mm, Screen print (the
  Image Effects tool's presets, as it tuned them), and the three Riso presets.
- **Riso** is one step among the rest. Its row opens to the controls it had: inks, screen,
  misprint, soak, grain, paper, saved looks, and Open in Riso on the page. Riso is now handed the
  picture as it stands just before its step, and its settings come back into that step, keeping
  where it sits, its strength, and every other step.
- **Not yet:** Looks have no thumbnails. Effects on a drawing (a group) go on the page, not on the
  group.

**One engine, version 2** *(2026-11-11)*. Jared: "Move it into the shared file. Update the effects
engine to get pro level results."

- **One code path.** The Image Effects tool loads `effects/image.js` and runs its settings through
  it as a stack, in the order it always ran them. Its own copy of the filters is gone. A look tuned
  there is the same picture in Freeform.
- **A float pipeline.** A stack is decoded once into 32-bit linear light, every step runs there,
  and it is encoded once with a fraction of a level of fixed dither. Steps no longer round to 8
  bits for each other, so gradients do not band. Freeform runs each group of steps between Riso
  steps as one pass. A step that changes nothing returns the picture byte for byte.
- **Light where light adds.** Blur is an exact gaussian (three boxes past a σ of 12 image pixels)
  in linear light, premultiplied, so a red/green seam does not go muddy and soft layer edges keep
  their colour. Exposure, white balance, the vignette and the halftone's sampling are in linear
  light. Contrast, posterize, grain response and blends are in perceptual sRGB.
- **Halftone.** Dot area comes from the spot function's measured quantiles, and the target is the
  light the original reflected, between this paper and this ink. So a screened flat tone averages
  back to itself: within 3 levels for every dot shape from tone 40 up, and for round, diamond and
  elliptical dots right down to black. Round dots are Euclidean: round in the highlights, a
  checkerboard at 50%, round holes in the shadows, as on a press. Each cell's tone is averaged
  over the cell. Edges are anti-aliased from the spot function's slope inside a cell, and sampled
  in or out at cell borders, where neighbouring dots meet. New: **CMYK** (four screens at 15°, 75°,
  0° and 45°, inks multiplying over the paper) and **dot gain**. About 0.3 s mono and 0.6 s CMYK
  for a 560 × 280 page at 2×.
- **Grain** is gaussian, has a **size**, and responds like film, strongest in the midtones.
- **Duotone** blends through Oklab, so the steps between the two colours are even, with a
  **balance**.
- **Posterize** can dither, **ordered** (Bayer) or **diffusion** (Floyd–Steinberg, serpentine), in
  page pixels.
- **Adjust** adds **exposure** (stops), **vibrance**, **warmth** and **tint**. White balance holds
  overall brightness. Contrast is an S-curve that holds black and white.
- **Vignette** darkens in stops, up to 2½, with **feather** and **roundness**. `spread` 100 reaches
  the corners.
- **Texture** comes from seeded value noise that never repeats, gets a **reshuffle**, and adds
  hard light.
- **Sharpen** is new: an unsharp mask on lightness, with a threshold so flat areas and grain stay
  calm.
- **Compatibility.** Settings new in version 2 are optional, so a step saved before them reads.
  The same settings look different from version 1, by design: tones are now right. The Image
  Effects tool's presets were tuned on version 1; Newsprint and Screen print print darker,
  because a dark sky now gets the ink it should.
- A new Freeform look, **Four-colour print**, shows the CMYK screens.

**Next.** The brand library replacing Stamp. Then per-layer effects, with the Image Effects tool's
effects moved into `effects/` beside Riso.

## Text, selection, pictures, sizes, brand library *(2026-11-11)*

Jared, asked how Freeform could be better and given a list: "do 2, 4, 5, 6. Let's remove text templates
for now and make a solid text tool." That is the brand library, frame sizes and starters, picture
handling, and multi-select.

- **Text tool.** Brand presets are held back (`app/features.ts`, `BRAND_PRESETS = false`): the model and
  renderer keep them, so text already in one draws as before, but no chip, tray, slash command or Design
  panel offers them. New text starts in its type role. The properties panel has a **Type** section:
  font, weight, size, line height, letter spacing, alignment, case (as typed, upper, lower, title),
  italic and colour with its hex, and Reset back to the role. The canvas bar has bold and italic.
  `weight`, `italic` and `textCase` are layer settings, drawn on straight and curved text alike.
- **Multi-select.** Shift-click on the canvas or in the layers list; a selection box on empty canvas (a
  finger, Space or the hand still pans); ⌘A. A multi-selection is a key of its own (`multi:…`,
  `model/selection.ts`), so it moves, scales, colours, copies and deletes as one, and a drawing inside it
  stays whole. The panel adds align to each other, distribute across and down (three or more, the ends
  stay put) and Group; ⌘G groups and ⇧⌘G ungroups. Hand-made groups are named Group, pen sessions Drawing.
  Text is now hit only inside its measured box: its drawing reaches the foot of the page so its words
  can wrap, which had made most of the page count as the text.
- **Pictures.** A picture keeps its own size and sits in its frame by fit (fill, fit, stretch), zoom up to
  500% and a focal point. Double-click it to crop: drag it inside its frame, the whole picture shown
  faintly past the frame. The panel's **Picture** section sets fit, rectangle or ellipse, zoom, corner
  radius, the focal point by clicking a thumbnail, and Frame to picture. Pictures placed before this are
  measured from the canvas the first time a crop setting needs their size. One with nothing set draws
  exactly as before (`model/image-layer.ts`).
- **Frame sizes and starters.** New frame opens a picker: email header and hero, Instagram post,
  portrait and story, LinkedIn, letter flyer, 18 × 24 poster and table tent; then Blank, Headline, Photo
  and caption or Event, laid out from the frame's short side (`model/frame-sizes.ts`). The Page section
  has a Size menu. A Freeform app frame can be up to 2400 × 3600; a page edited inside an email keeps the
  700 × 1200 a column allows.
- **Brand library.** In place of the Stamp tool, a panel docked on the left (the dock button, or E):
  the brand marks, drawn in the chosen colour at a quarter of the page's short side; the project's own
  pictures; and the palette, each colour with its name and hex, which paints what is picked and sets the
  marks' colour. Click to place in the page's middle, or drag onto the page. Placed marks are called Mark.
- **Not yet.** An email block that follows a frame larger than an email column takes the frame's size;
  linking should scale it down, type included. The library has no patterns or approved photography of its
  own yet; it shows what the project holds. Hosted pictures (HubSpot URLs) cannot be drawn into the
  export, since the browser will not read their pixels back, so the library uses the project's files.

## Ink bleed, and the everyday layout moves *(2026-11-11)*

Jared: "add the effects from the ink bleed tool into freeform. add multiple item select and other common
design usage patterns and tools."

- **Ink bleed is an effect step.** The Ink bleed tool's processing moved into `effects/ink.js`
  (`InkBleed`), shared like the Riso and image engines. On a layer, the layer's own shape is the ink; on
  the page, ink is whatever is darker than the paper. Ink settings (spread, rough, soft, worn, grit,
  stamp, smudge), copier settings (stretch, drift) and paper (grain, dust, speckle, streaks). Looks:
  Photocopied, Fax transmission, Fresh ribbon, Rubber stamp.
- **Multi-select** was already in (Shift-click, a box on the page, ⌘A, align, distribute, ⌘G). It now
  leaves out locked and hidden things.
- **Arrange.** ⌘] and ⌘[ one step, ⌥⌘] and ⌥⌘[ to the front or back. Several picked things move
  together and keep their order among themselves; a group moves as one (`model/arrange.ts`).
- **Flip.** ⇧H and ⇧V mirror what is picked across its shared middle; a rotation mirrors with it.
  Stored as `flipX` and `flipY` on the layer, drawn as a scale in the same transform as the rotation.
- **Hide and lock.** An eye and a lock on every row of the layers list, or ⇧⌘H and ⇧⌘L. Both icons stay
  in view while on, so state reads by the icon, not by colour. Hidden layers are not drawn or exported.
  Locked layers let clicks through, stay out of the selection box and ⌘A, have no handles, and do not
  nudge or flip; the list still picks them.
- **Copy and paste style.** ⌥⌘C takes the first picked layer's look; ⌥⌘V lays it onto what is picked,
  each kind taking only what it has (a box takes a fill and corner, text takes type).
- **Alt-drag** moves a copy and leaves the original. One undo step.
- **Right-click menu** on the canvas: cut, copy, paste, duplicate, delete, arrange, group or ungroup,
  flip, hide, lock, copy and paste style, zoom to selection, each with its key.
- **Zoom.** ⇧1 fits the page, ⇧2 fits what is picked.
