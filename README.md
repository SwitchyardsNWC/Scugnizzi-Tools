# Scugnizzi tools

A folder of small browser tools for the Switchyards design team, with an index page that opens
each one in place. Four of them are single HTML files with no build step. The fifth, Template
Studio, is a real application with a compiler, a test suite and its own documentation.

Everything runs locally. Nothing is uploaded anywhere.

## Running it

```bash
node serve.js
```

Then open <http://localhost:8770>. The server is thirty lines of Node and serves this folder as
it is. Two tools need it rather than a double-clicked file: the image effects editor reads pixels
back from a canvas, which a `file://` page is not allowed to do, and Ink bleed asks the server for
`assets/index.json` to discover the SVG stamps dropped into its folder. On the live site that
file is written at deploy time (see Hosting below), so a stamp dropped into the folder shows up
on Pages after the next push.

Template Studio has to be built once before the index page can open it:

```bash
cd template-studio && npm install && npm run build
```

There is a `.claude/launch.json` so the Claude desktop app can start the same server by name.
It reads `PORT` if one is set.

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

### What the single-file tools share

- **`tool-banner.js`** draws the 32px strip at the top of every tool with the link back to the
  index. Include it right after `<body>` with `data-tool="Name"`.
- **`tool-kit.js`** gives every tool the same keyboard: ⌘Z undo, ⇧⌘Z redo, `?` for the shortcut
  sheet, Esc to close, ⌥⌘R to reset. It also keeps each tool's state in `localStorage` under
  `scuggnizzi.<tool>.*` (the original spelling, kept so saved state survives), so a page reload does not lose work. A tool registers its own shortcuts
  with `ToolKit.register('mod+s', 'Download PNG', fn)`.
- **`design system/Enkel Design system v2/`** is the design system the index page is set in.
  *Enkel* is Swedish for simple: one sans for words, one mono for figures, a sunken page with
  paper cards, hairlines instead of shadows. `styles.css` carries the tokens, `readme.md` the
  rules, `SKILL.md` the instructions for building with it.

### Adding a tool

One folder beside `index.html`, one entry in the `TOOLS` array at the bottom of `index.html`.
Number it, give it a kicker and a one-line description, point `href` at the file. The index draws
the card.

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
  `patterns/`, `assets/` and `exports/`. Two designers on the same folder see each other's work,
  one save at a time: there is no merging, so if both edit the same template the later save wins.
  The editor notices when the file changed under it and refuses to write over the other person's
  save, but the fix is a human one — save a copy, or reload theirs.
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

The `dist/` folder is a build output and is not committed. Run `npm run build` after cloning,
and again after changing anything under `src/`; the index page opens `dist/`, not the source.

**Hosting.** The whole site is served from GitHub Pages by `.github/workflows/static.yml`. On
every push to `main` it installs Template Studio's dependencies, runs the tests, builds `dist/`,
writes each tool's `assets/index.json`, and uploads the site without the source, tests, docs,
reference files or the HubSpot probe. Because the build happens there, the live site is always
the source as pushed; a failing test stops the deploy.

Template Studio itself is static, with no server; `vite.config.ts` builds with relative paths for
exactly that. The templates live in a local folder the browser is granted access to, which is
how a team on one synced Drive or Dropbox folder shares them. Two things follow: it is Chrome
only, because only Chrome's File System Access API can open a folder; and when Chrome's picker
asks "Edit files" or "View files", choose Edit, or nothing saves back. If the folder is on
Google Drive, set Drive to mirror it rather than stream it.

Its documentation is in `template-studio/docs/`: the product brief, the plan, the architecture,
the acceptance list, and `learnings.md`, which records every fact about HubSpot and email
rendering the project has paid for and how confident we are in each. Read that one before
changing the compiler.

## Layout

```
Scugnizzi-Tools/
├── index.html                      the dashboard
├── serve.js                        static server on :8770
├── tool-banner.js  tool-kit.js     shared by the single-file tools
├── design system/                  Enkel, the index page's design system
├── text bleed/  image effects/  split flap/  riso/
└── template-studio/                the email template builder (Vite + TypeScript + Preact)
```

## Where this is going

[`docs/projects.md`](docs/projects.md) plans one project folder, opened once from the dashboard, that
every tool saves into, with a copy document that feeds words to every tool and takes changes back.

