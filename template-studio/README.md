# Template Studio

Version two of the Switchyards email template builder. Phase 0 is answered, the compiler passes its
contract gate, and the editor works: outline, canvas, inspector, inline text editing, drag to
reorder, multi-column rows, a block palette you drag from, undo, autosave — and a design system
whose tokens actually reach the output.

**Next action:** Patterns — a section saved once and reused across templates, with explicit
updates and detach. Also unblocked and not yet built: one design system per *folder* rather than
per template, multi-column rows, the four footer variants, the city-links block, and a paste
sanitiser so rich text can be edited on the canvas too.
See [`docs/architecture.md`](docs/architecture.md) §4.

```bash
npm install && npm run dev     # the app
npm test                       # 605 tests
```

The built app is checked in at `dist/` so the tools directory can link to it; `npm run build`
refreshes it.

| Command | What it does |
| --- | --- |
| `npm run dev` | The app on a local dev server |
| `npm run build` | Builds to `dist/` |
| `npm test` | 605 tests: the HubSpot contract gate, the v1 import, per-block snapshots in every theme, the linter, branch coverage, migrations, editing, the design system, multi-column rows and groups, the paste sanitiser, local assets, the verified HubSpot facts, and the purity checks |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run compile -- <file.json>` | Compiles a template to a HubSpot coded email template on stdout. `--preview` for the readable version, `--out <file>` to write one. |
| `npm run golden` | Regenerates the golden file by driving v1's own compiler |
| `npm run baseline` | Rebuilds `templates/baseline.template.json` — every block and style on one page — and its two exports |

The compiler is pure and DOM-free, so it runs under plain `node --experimental-strip-types` with no
build step, and its tests need no browser.

- `src/model/` — document types, schema version and migration chain, v1 import, design system
- `src/compile/` — the tree, the serializer, the colour registry, the linter, one file per block
- `src/workspace/` — the folder, via the File System Access API, with a file-picker fallback
- `src/app/` — the editor: outline, inspector, canvas, the design panel, undo, autosave

Adding a block type is a renderer in `src/compile/blocks/` and an entry in `src/model/catalog.ts`.
The inspector builds itself from the second one, which is the thing v1 could not do.
- `templates/` — templates this project owns. Open this folder in the app to edit them.
- `assets/` — images the Assets panel lists. A file name is not a URL, so `Checks` refuses to export
  until a hosted one replaces it; see `assets/README.md`.
- `exports/` — the last export of each template, and its preview
- `KICKOFF.md` — how to start the build, and the prompt to paste
- `docs/brief.md` — what this is and who it is for
- `docs/plan.md` — the proposed data model, editor and phases
- `docs/learnings.md` — every HubSpot and email-rendering fact version one paid for
- `docs/acceptance.md` — definition of done and the HubSpot test protocol
- `docs/architecture.md` — the reply to the kickoff: the read, the chosen architecture, the build order
- `docs/phase-0-checklist.md` — the one afternoon of HubSpot testing that unblocks Phase 1
- `docs/canvas-mode.md` — the plan for the next view: every email of a project on one board, edited live, packaged for HubSpot as a flow
- `docs/freeform-and-effects.md` — the plan for a freeform drawing block that ships as a picture, and for the other tools' effects as steps in a render
- `probe/hubspot-probe.html` — the throwaway template that checklist uploads
- `tools/regenerate-v1-export.js` — drives v1's compiler under Node to produce golden files
- `reference/` — version one, its export, a real saved design, and its readme

`reference/v1-export-example.html` is stale: it came from an older build of v1 and a different
design than `v1-standard-email.design.json`. `reference/v1-export-regenerated.html` is that fixture
compiled by today's v1 and is the file the compiler should be graded against. See
[`docs/architecture.md`](docs/architecture.md) §1.

Version one still lives in `../standard email/` and stays in use until this replaces it.
