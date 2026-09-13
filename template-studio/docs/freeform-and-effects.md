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
  the frame's photographs show. With no folder open, the browser now asks before leaving the page with unsaved edits. It shows the print once the
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
