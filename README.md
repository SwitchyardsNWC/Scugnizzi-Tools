# Scugnizzi tools

A folder of small browser tools for the Switchyards design team, with an index page that opens
each one in place. Five of them are single HTML files with no build step. The sixth, Template
Studio, is a real application with a compiler, a test suite and its own documentation.

Everything runs locally. Nothing is uploaded anywhere.

## Running it

```bash
node serve.js
```

Then open <http://localhost:8770>. The server is thirty lines of Node and serves this folder as
it is. Two tools need it rather than a double-clicked file: the image effects editor reads pixels
back from a canvas, which a `file://` page is not allowed to do, and Ink bleed asks the server for
`assets/index.json` to discover the SVG stamps dropped into its folder.

There is a `.claude/launch.json` so the Claude desktop app can start the same server by name.

## Installing it as an app

The site is also a Chrome app. Open the **Project** tool and choose **Install as an app** (or the
install icon in Chrome's address bar). It gets a dock icon and a window of its own, and it registers
`.scug` as a file type it opens.

Every project folder holds a `<name>.scug` file: Create a project writes one, and a folder opened as
it was gets one the first time it is open for editing. Double-click it in Finder and the app opens
that project's board. The file carries the project's id, not its folder, because a web page can only
reach a folder through a handle Chrome already stored for it. So on a machine that has opened the
project before, the file opens it straight away, with the one click Chrome wants before it reopens a
remembered folder. On a machine that has never seen it, the page asks for the folder once, checks
it is the right one, and remembers it from then on.

The pieces: `template-studio/public/manifest.webmanifest` (copied into `dist/` on build) names the
app, its icons and the file type; every page links it; `src/project/launch.ts` reads the launched
file and offers the install prompt. There is no service worker, so nothing is cached and the app
is always the site as it is on Pages. Chrome and Edge on a computer only, as with folders.

## The tools

| # | Tool | What it does | Where |
|---|------|--------------|-------|
| 01 | **Ink bleed** | Typewriter and photocopy text on paper. Layers of text and SVG stamps, each with its own bleed, smudge and copier drift. Receipt tears, dark paper, six-frame GIF export. | `text bleed/ink-bleed.html` |
| 02 | **Image effects editor** | Photo treatments in the browser: halftone screens, grain, paper and fibre textures, blend modes. Dirty 35mm, film noir, newsprint, screen print. | `image effects/image-effects-editor.html` |
| 03 | **Split-flap board** | A Solari departure board. Every letter clatters through its alphabet and lands in place, staggered across the board. PNG of the rest state, animated GIF of one flip. | `split flap/split-flap.html` |
| 04 | **Riso separator** | Splits a picture into two or three Riso inks: real drum colours, per-ink source and curve, dot, line or grain screens, misregistration, ink soak, paper grain. Exports the print and one separation per ink. | `riso/riso.html` |
| 05 | **Template Studio** | Builds HubSpot coded email templates. See below. | `template-studio/` |
| 08 | **HUB-MOD** | Designs HubSpot custom email modules, the blocks the team drags into drag-and-drop emails. See below. | `hub-mod/hub-mod.html` |

### What the single-file tools share

- **`theme.js`** keeps one light or dark pick for the dashboard, every tool and Template Studio. It
  sets `data-theme` on `<html>` and keeps the pick in `localStorage` under `scuggnizzi.theme`. With
  nothing picked, the dashboard and the tools are dark; Template Studio follows the system. Load it
  first in `<head>`, before any stylesheet, so a page paints in the right theme the first time.
- **`tool-banner.js`** draws the 32px strip at the top of every tool with the link back to the
  index and the light/dark switch. Include it right after `<body>` with `data-tool="Name"`.
- **`tool-kit.js`** gives every tool the same keyboard: ⌘Z undo, ⇧⌘Z redo, `?` for the shortcut
  sheet, Esc to close, ⌥⌘R to reset. It also keeps each tool's state in `localStorage` under
  `scuggnizzi.<tool>.*` (the original spelling, kept so saved state survives), so a page reload does not lose work. A tool registers its own shortcuts
  with `ToolKit.register('mod+s', 'Download PNG', fn)`.
- **`project.js`** finds the open project, the folder the board and Template Studio opened, so a
  tool can read pictures from it and save its result and recipe into it without asking for a
  folder again. Load it after `tool-kit.js`. It never picks a folder itself; the board does that.
- **`design system/Enkel Design system v2/`** is the design system the dashboard and every tool
  are set in. *Enkel* is Swedish for simple: one sans for words, one mono for figures, a sunken
  page with paper cards, hairlines instead of shadows. `styles.css` carries the tokens, `readme.md`
  the rules, `SKILL.md` the instructions for building with it. A tool links `tools.css` after
  `styles.css` for its side panel, 28px controls, stage and export bar;
  `guidelines/controls-tools.html` shows every part of it in light and dark.

### Adding a tool

One folder beside `index.html`, one entry in the `TOOLS` array at the bottom of `index.html`.
Number it, give it a kicker and a one-line description, point `href` at the file. The index draws
the card.

**Project** is not in that list. It has its own section at the top of the dashboard: the project
that is open, drawn from its folder (name, counts, a map of its board), and a row of project types
that open Create a project on the board (`project.html?create=<type>`). The dashboard only reads the
folder; the board writes it.

## Template Studio

The one tool with a build. It replaces the first email template builder, whose export the
Switchyards standard email ships from today.

A designer assembles an email out of blocks on a canvas, marks which parts the marketing team may
edit in HubSpot, and exports one HTML file for HubSpot's Design Manager. The team then writes each
email by filling in fields; the layout and styling stay fixed. The exported file is the product;
everything else exists to produce it.

What is in it:

- **A pure compiler** (`src/compile`) from the document to the HubSpot template: nested tables,
  Outlook conditionals, three-layer dark mode, the CAN-SPAM footer, and every field declared where
  HubSpot will register it. It runs under Node with no browser and is tested to the byte.
- **An editor** (`src/app`, Preact) with a canvas that shows the real compiled output at desktop,
  phone and dark; inline editing with a `/` menu; a design system panel where one change moves
  every block that follows it; a layer tree; drag and drop.
- **A workspace**: a folder the team already syncs, holding `templates/`, `design-systems/`,
  `patterns/`, `assets/` and `exports/`. Two designers on the same folder see each other's work.
- **A validator** that checks a template against every rule a real send has taught us, before
  Export will write the file.

Running it:

```bash
cd template-studio
npm install
npm run dev        # the editor, with hot reload
npm run build      # writes dist/, which the index page links to
npm test           # the suite: the HubSpot contract, the compiler, the model, the sanitiser
npm run workspace  # regenerates the example folder: two design systems and a template on each
```

The `dist/` folder is a build output. Either commit it so the index page works straight from a
checkout, or run `npm run build` after cloning.

**Hosting.** Template Studio is a static site with no server, so it can be served from GitHub
Pages as it is; `vite.config.ts` builds with relative paths for exactly that. The templates live
in a local folder the browser is granted access to, which is how a team on one synced Drive or
Dropbox folder shares them. Two things follow: it is Chrome only, because only Chrome's File
System Access API can open a folder; and when Chrome's picker asks "Edit files" or "View files",
choose Edit, or nothing saves back. If the folder is on Google Drive, set Drive to mirror it
rather than stream it.

Its documentation is in `template-studio/docs/`: the product brief, the plan, the architecture,
the acceptance list, and `learnings.md`, which records every fact about HubSpot and email
rendering the project has paid for and how confident we are in each. Read that one before
changing the compiler.

## HUB-MOD

Template Studio makes whole coded templates. HUB-MOD makes the piece below that: a **custom email module**, the
block the marketing team drags into a drag-and-drop email and fills in through fields. A designer stacks parts
(eyebrow, heading, text, rich text, image, button, divider, spacer, columns, a repeating group), marks which
ones the team may edit, and exports the module.

- **One render path.** `hub-mod/compile.js` writes module.html in HubL mode and the canvas in preview mode, from
  the same function (learnings 3.1). The test renders module.html through a Jinja engine with the defaults from
  fields.json and checks it is the preview, byte for byte after whitespace.
- **Three files, no CSS file.** HubSpot refuses module.css and module.js on an email module, so the folder is
  module.html, fields.json and meta.json. Everything that has to hold is inline; module.html carries two small
  style blocks for what cannot be (rich text rules, which HubSpot is expected to inline at send, and the phone
  and dark rules, which Gmail strips). Columns and grids stack on a phone without any of it.
- **Two ways in.** The zip goes up with `hs cms upload` (HubSpot CLI 8; `hs upload` is gone). Or the Hand build
  tab walks Design Manager field by field, with the code to paste.
- **The Switchyards system** is read from `template-studio/design-systems/switchyards.system.json` when served,
  so the themes, type scale and buttons are Template Studio's. A double-clicked file uses a built-in copy.
- **Checks** refuse the download for anything HubSpot would reject or the team would trip on (bad or duplicate
  field names, a picture that is not a hosted https address, a group whose items would all be identical) and
  warn on the rest, contrast included.

```bash
node --test hub-mod/test.mjs                      # structure and behaviour, nothing to install
npm i --no-save nunjucks && node --test hub-mod/test.mjs   # adds the render-equals-preview checks
```

What a module has learned about HubSpot, and what is still unverified until the first test send, is in
`template-studio/docs/learnings.md` §1.18.

## Layout

```
Scugnizzi-Tools/
├── index.html                      the dashboard
├── serve.js                        static server on :8770
├── theme.js                        one light/dark pick for every page
├── tool-banner.js  tool-kit.js     shared by the single-file tools
├── project.js                      the open project, for the single-file tools
├── version.js                      the suite's version, the one place it is written
├── CHANGELOG.md                    what changed in each version
├── design system/                  Enkel, the design system every page is set in
├── text bleed/  image effects/  split flap/  riso/  hub-mod/
└── template-studio/                the email template builder (Vite + TypeScript + Preact)
```

## Where this is going

[`docs/projects.md`](docs/projects.md) plans one project folder, opened once from the dashboard, that
every tool saves into, with a copy document that feeds words to every tool and takes changes back.

