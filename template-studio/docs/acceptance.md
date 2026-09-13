# Definition of done

Three layers: the compiler is correct, the editor is usable, the email actually renders.

## 1. Compiler

Automated. These run in CI or on every commit.

- [x] **The HubSpot contract holds**, asserted against what the compiler actually emits: the same
      fields with the same names and labels in the same order as v1, every one exporting to the
      template context, no declaration inside a conditional, the annotation header, the CAN-SPAM
      variables, balanced markup in every branch, the verified image module path.
      *(`tests/hubspot-contract.test.ts` — this is the gate.)*
- [x] `reference/v1-standard-email.design.json` imports into the v2 model with every block, every
      setting and every field name intact. *(`tests/v1-import.test.ts`, which also records what
      departing from v1 changed.)*
- [ ] ~~Byte-for-byte parity with v1's compiled output.~~ **Retired 2026-09-11** at Jared's
      direction: depart from v1 freely as long as the HubSpot handoff stays correct. It was the
      right gate for steps 1–4 and had started protecting v1's shape rather than the contract —
      learnings 3.24. The golden file stays in `reference/` as documentation.
- [x] Every `<p>` in the output states its own margin, so HubSpot's injected `margin-bottom: 1em`
      cannot apply to it (learnings 1.9).
- [x] A baseline template containing every block, every style and every edge case, built from the
      model rather than hand-written. *(`tools/make-baseline.ts` → `templates/baseline.template.json`,
      with `tests/baseline.test.ts` asserting the coverage the type system cannot see. It found a
      real defect on its first compile — learnings 3.33.)*
- [x] Lists, block quotes, horizontal rules and image framing are design-system tokens, not
      hard-coded numbers in the stylesheet. *(`ds.richText` and `ds.image`. They were the last
      literals left in the emitted CSS.)*
- [x] Snapshot test per block type, in every theme, at desktop and phone widths. *(`tests/blocks.test.ts` — 24 snapshots, each covering the block's markup and the phone-width rules it contributes.)*
- [x] Snapshot test per row layout: one column, two equal, two uneven, three, and each mobile
      behaviour. *(`tests/columns.test.ts`. Two behaviours, not four: `hide` became a per-column
      switch, because that is how it is used — a decorative image goes and the copy beside it
      stays, and the row has no opinion about which is which. `stack-reverse` is deliberately not
      built; learnings 3.14 says why.)*
- [x] HubL linter passes on every snapshot: balanced tags, unique field names, no field declared
      inside a conditional that could prevent registration, every `path=` resolvable. *(Each block
      is linted alone as well as in a whole template, so a broken declaration cannot hide behind a
      neighbour that happens to satisfy the rule.)*
- [x] Field declaration order in the output matches canvas order for a template with at least
      eight editable fields in a non-obvious arrangement. *(Eight fields across six block types,
      whose names in document order are nothing like their alphabetical order.)*
- [x] No style rule in the output matches nothing in the email, allowing for classes a client or
      HubSpot adds at render. *(`unused-css`, asserted on the standard email, the baseline and both
      starters; ~1.2KB of v1 boilerplate came out — learnings 3.57.)*
- [x] Every color that appears in the output has a matching `prefers-color-scheme` rule and a
      matching `[data-ogsc]` rule. Test by parsing the output, not by inspection. *(`lint.ts`,
      rule `dark-mode-coverage` — it reads the emitted CSS rather than trusting the generator that
      just wrote it.)*
- [x] A blank editable heading, a blank button label and an unset image each remove their whole
      block including surrounding spacing. *(And every branch of the standard email is rendered and
      checked for unclosed tags — `tests/branches.test.ts`.)*
- [x] Compiled output of the standard email is under 102KB, and the size is reported. *(32.3KB; `npm run compile` prints it.)*
- [x] The compiler module has no DOM dependency and runs under Node. *(It runs under plain `node --experimental-strip-types` with no build step; the tests use the `node` environment.)*

## 2. Editor

Manual, checked by Jared.

- [x] The sidebar is five destinations, each answering a different question: what can I add, what
      do I have, what is in this email, what pictures are around, what rules does the whole thing
      follow. *(Files and Assets used to be a list wedged above the layer tree, so opening a folder
      pushed the structure you were reading down the pane. Design sits apart at the foot of the
      rail — the four above it are contents, it is the rules they are drawn with.)*
- [x] Any block that renders a padded cell — heading, paragraph, image, button — can have a box
      drawn round it, with a width, a palette colour, a corner and an inset. *(One dial until the
      width is above zero, then four; a real table inside the cell's padding, so it is a callout
      and not a rule across the email — learnings 3.47. This is what makes the Phase 0 probe's
      look buildable in the editor.)*
- [x] Rendered text is written to `assets/rendered/`, and the Assets panel lists images in folders
      inside `assets/` as well as at the top of it. *(The path is the name: what the document
      stores, what the canvas matches on, and what `local-image` reports.)*
- [x] Every picker reads its options from the design system. *(The button's Style list still said
      Red and White, three schema versions after those variants were renamed — learnings 3.48.)*
- [x] The right pane is the selection and nothing else. *(Its last global panel — the template's
      two names, the page background, force light — moved left: the names into Files, the page into
      Design › Page / layout, where the palette supplies the background rather than four hard-coded
      hexes.)*
- [x] Rendering works on ordinary copy — line breaks, rules, ampersands, bold, links — and on a
      template with no folder open. *(Serialised as XHTML, because a `<foreignObject>` is parsed as
      XML and `<br>` is fatal there; and with no folder it downloads and shows the picture from a
      blob rather than naming a file it never wrote — learnings 3.49.)*
- [x] A heading or a paragraph can be rendered as a picture of itself, and turned back. *(For the
      one thing every client renders differently: Word rounds line heights, drops letter spacing
      and substitutes fonts. Drawn from what the canvas is actually showing, at 2×, into the
      folder's `assets/`. The original block is kept whole, so going back restores the HubSpot
      field with its own name rather than minting a second one. `local-image` refuses the export
      until it is hosted, and `text-as-image` says what the trade is — learnings 3.45.)*
- [x] The inbox view is a window, not a scroll of paper. *(Fixed height, and the message scrolls
      inside it — the only honest way to answer "what arrives above the fold".)*
- [x] The desktop inbox is shaped like the client most of these emails are read in: a folder list,
      a toolbar, a subject with its label chip, an avatar, a sender and address, "to me", a
      timestamp. A layout, not a brand — no logo and no wordmark, because a preview imitates a
      rendering and nothing else. Its palette is the client's rather than this app's, in both
      themes, so it never reads as part of the editor. The folder list collapses to its icon rail
      below 1500px, which is what the real one does and what keeps the message the widest thing
      on screen.*
- [x] The compiled template can be read and copied without exporting a file. *(Code, beside Fields
      and Checks: the same bytes Export writes, a copy button with a clipboard fallback for a
      browser that refuses it, and a size that matches the header's.)*
- [x] The email can be previewed inside a message, not only on a screen. *(Inbox: sender, subject
      and timestamp are stand-ins; the gutter below them is not — it is what a mail app draws
      around every message and where the page background shows.)*
- [x] Typing a number into a dial produces that number. *(It holds the text while you type and
      commits on blur or Enter; clamping per keystroke turned a typed 100 into 220 —
      learnings 3.43.)*
- [x] Checks reports markup a block carries that the template does not use, and Clean up removes
      it from every block as one undo step. *(Empty paragraphs, pasted inline styles, `target` on
      links, lists nested outside their item — learnings 3.57.)*
- [x] Images in the Assets panel are grouped by the folder they sit in.
- [x] The strip above the canvas holds only tools: glyphs for the views and the dark override, a
      count for the preview state, and `?`. Every explanation is on hover. *(learnings 3.56.)*
- [x] The top bar holds only what is true of the export — its size, whether it passes, and writing
      it. *(Opening a folder and opening the design system both moved into the rail, where the
      panels they belong to live; a control in two places is a control whose state has to agree in
      two places — learnings 3.39.)*
- [x] A new template can be started from nothing, from the standard email, or from the card
      look, and the open one can be duplicated as its own file. *(Files › New and Duplicate. A new
      template's first save never lands on an existing file, and once it has a file every save goes
      there — renaming it does not leave a trail. "Blank" is the legal footer alone, because HubSpot
      will not publish without it — learnings 3.51.)*
- [x] A block added to a template lands on that template's own presets, and the top bar and the
      footer draw their section's preset like every other block. *(They read the shipped defaults
      and a preset called navy respectively, so a template on another palette could not be built —
      learnings 3.50. The footer honours its column's alignment now, and the top bar its role's
      tracking and font.)*
- [x] A rule can be drawn inside the gutter, in a palette colour, at a width and an alignment.
      *(Divider: a bar rather than a border so Word draws it; follows the system's rule colour by
      default so it matches an `<hr>` the team types.)*
- [x] A font stack can be added to the design system and named by a role; one a role names cannot
      be removed until the role is pointed elsewhere.
- [x] Headings offer all six levels, and the phone block sizes all six.
- [x] Clicking a palette card selects the block it adds, so the inspector's dials move it. *(It
      selected the section; the panel showed the block and every control read undefined — a dead
      panel on the most common way a block arrives. learnings 3.50.)*
- [x] A block can depart from the page gutter on either side, and keeps its own sides on a phone.
      *(One row per side: a dial reading the inherited number until you drag it, and a chain to
      hand it back. A departing cell gets its own `!important` rule in the later phone block, or
      `.hs_padded` would drag it back to the gutter on every phone — learnings 3.42.)*
- [x] The page is a set of tokens read together: width, the gutter inside it, a frame around it,
      the space outside it, and the phone breakpoint. *(First panel in Design, because a 38px H1 is
      a different decision in a 600px email and a 320px one. The frame is drawn outside every band
      — top bar and footer included — and sits outside the width, the way an image's border does,
      because the desktop rules force the content column to the full width with `!important`
      (learnings 3.41). Both the frame and the margin emit nothing at all at their defaults, so every
      template written before they existed still compiles byte for byte.)*
- [x] The design system and the selected block are visible at the same time. *(Design used to take
      the right pane, so opening it hid the heading whose size you were changing — learnings 3.37.
      The left pane widens to 380px for it and the right pane is the selection, always.)*
- [x] A palette card, the ghost you carry, and the layer row it lands as all draw the same glyph.
      *(One `glyphFor` rather than a lookup per call site; the repetition is the point — it is what
      makes the three read as one object moving.)*
- [x] The layer tree can be scanned rather than read. *(A glyph per block type, a rail for depth,
      and structure set apart from content by weight — learnings 3.35.)*
- [x] Images in the folder's `assets/` directory are listed with thumbnails and can be put into an
      image block. *(Paired with `local-image`, which refuses the export until a hosted URL replaces
      the file name — learnings 3.36. Either half alone is a trap.)*
- [x] A folder Chrome opened view-only says so, downloads instead of failing, and offers one click
      that asks for edit access. *(Chrome's picker asks "Edit files" or "View files"; the second
      gave a folder that listed and previewed and threw on every write — learnings 3.58.)*
- [x] Opens a workspace folder and lists the templates in it. Two people on the same synced
      folder see each other's templates. *(Autosave re-stats the file immediately before writing and
      refuses rather than producing a silent conflicted copy.)*
- [x] Builds a two-column row with uneven ratios, puts blocks in both columns, and sets the phone
      behaviour per row. *(Columns are **dropped** from the palette as an empty row, not applied to
      a block that happens to sit in one — learnings 3.20. Each empty column draws a slot on the
      canvas so there is something to aim at; the slot is editor-only and a test asserts it never
      reaches an export. Selecting the columns shows the row's own settings.)* *(From any block in the row — count, then ratio, then what happens on a
      phone, which is the order the decisions are made in. Each column has its own add menu, listing
      only the blocks that can live in one: the top bar, the stripes and the legal footer each draw
      their own full-width band, so the compiler refuses them there too. Dropping a block into a
      column by dragging it is not built — it is added from the menu and can be moved between
      columns.)*
- [x] Several blocks share one column — a heading, its copy and its button inside one card — and
      the export draws one band, one gutter and one box around all of them. *(Learnings 3.59. A
      drop on the middle of a block joins its column; the top or bottom edge makes a section. ⌘G
      groups a selection, ⇧⌘G splits it back keeping the look. The gap between them is a design
      token, `Design › Between blocks`, overridable per column; a Spacer replaces it. The standard
      email's export is byte-identical.)*
- [x] Hovering a block, or working its Spacing panel, draws its padding, gap, box inset and
      section space on the canvas with their numbers, and leaves while a block is being typed
      into. *(Learnings 3.60. Measured from the live document, so a phone width shows the phone
      gutter. Dragging the numbers was built and pulled the same day; it returns when the rest of
      the spacing story is settled.)*
- [x] A row of columns or a group can be selected, moved and reshaped from the canvas: the selected
      row has the same bar a block has — its name, which opens the type menu; ⋯ for phones and
      background; up, down, duplicate, delete — and a click on a column's gap or an empty slot
      selects the row. A block's bar name turns it into another kind of block. The selected row's
      column dividers drag to a custom split, and the split can be typed in the Columns panel.
      *(Learnings 3.62–3.64.)*
- [x] The top bar can sit in a row of columns, align left, centre or right, and carry a link, and
      renders byte for byte as before when alone. *(Learnings 3.65.)*
- [x] A freeform block — text, images and shapes on a surface — draws live on the canvas, is edited
      there and in its panel, renders to a PNG through the same path as text, and ships in the
      file only as that picture; the checks refuse an unrendered one and warn about a stale one.
      *(Learnings 3.65, docs/freeform-and-effects.md phases 1 and most of 2.)*
- [x] A freeform block opens as a workspace: pan and zoom on an endless field, handles to resize and
      rotate, shapes dragged out, text edited in place, the pen, the page resized by its corner, and
      pictures dropped in from the Assets panel. *(Learnings 3.67.)*
- [x] A brand block shows one of the bundled marks at a width, in a colour that follows the section's
      text unless set, and ships as a rendered picture with the same check as a freeform block.
      *(Learnings 3.66.)*
- [x] A preview switch hides every control — bars, outlines, slots, overlays and the panes — so the
      email can be judged as itself, and Escape brings them back. *(Learnings 3.64.)*
- [x] An edit that changes only the body reaches the canvas without the frame going blank: the
      body is patched into the live document, and only a head change reloads it. *(Learnings 3.61.
      A duplicate used to reload the frame twice, three-quarters of a second each with images.)*
- [x] A type role can differ from the rest of the email. *(Font and colour per role: a Georgia H1
      over Helvetica body copy, with the colour named from the palette rather than typed as a hex.
      A role states a font or a colour in the output only when it departs from the default, so the
      shipped values still compile byte-for-byte.)*
- [x] A block can be deleted, duplicated and moved wherever it lives, including inside a column.
      *(It could not, until Jared reported it: the only delete removed a whole section and the
      outline drew actions on sections only. Every outline row carries its own now, and the block
      selected on the canvas carries a bar — name, move, duplicate, delete — attached to itself.
      learnings 3.15.)*
- [x] A block is dragged from a palette to where it goes, rather than added at the end and then
      moved. *(The left sidebar leads with the blocks; drag one onto the email, or click to append.
      Drop targets are the edges of existing blocks and the inside of a column, with the indicator
      drawn over the canvas rather than injected into it. Pointer capture is what lets a drag cross
      into the preview iframe at all — learnings 3.17.)*
- [x] Drag and drop works by pointer, works from the outline, and has a keyboard path. *(Pointer
      events with capture, not the HTML5 drag API — learnings 3.2. A movement threshold keeps rows
      and blocks clickable, so selecting and moving never have to be told apart by the user.
      Alt+↑ / Alt+↓ on a focused outline row is the keyboard path; the ↑ ↓ buttons are the
      discoverable one. Dragging works on the canvas too, with a drop indicator drawn between
      sections.)*
- [x] Undo and redo cover every action including drags, at least fifty steps deep. *(Eighty, and it
      covers every action by construction: the stack holds whole documents, so there is no way to
      change the template that undo does not already know about. Typing coalesces, so a word is one
      step rather than seven. Drags do not exist yet — when they do, they are one command like any
      other.)*
- [x] Deleting anything offers Undo rather than asking first. No native `confirm`, `prompt` or
      `alert` appears anywhere in the app. *(Enforced by `tests/purity.test.ts`, not by discipline —
      in this environment those dialogs silently do nothing, which is how v1 produced "I'm unable to
      delete blocks".)*
- [x] Typing in any field never moves focus and never scrolls the canvas. *(Checked in the running
      app: focus survived thirteen keystrokes, and the canvas lags the document by 180ms so it
      catches up without reloading under the typist.)*
- [x] The canvas holds its scroll position across every edit, including edits to the footer.
      *(Checked in the running app, on the legal note specifically, which is the case learnings 3.4
      names: four consecutive edits, scroll pinned at 120px, frame height stable throughout.)*
- [x] Desktop, phone and dark-mode previews all render the real compiled output. *(The dark preview
      shows the prefers-color-scheme layer applied unconditionally, against a dark surround — it is
      your override, not a simulation of Gmail, which cannot be simulated.)*
- [x] The editability view lists every HubSpot field in panel order with its label, and labels
      can be renamed there. *(And it dims every block with nothing editable, so what the team can
      reach is what stands out. The order is taken from the document rather than the compiled
      output, which is sound because the compiler emits each declaration immediately before its
      markup — there is a test asserting the two agree.)*
- [x] The palette can be edited: colours added, renamed, removed and reset to the brand.
      *(Renaming carries every reference — presets, type roles, button variants — in one commit,
      because a reference left pointing at a name nothing defines resolves to null and quietly
      removes a background rather than failing. Removing is refused while anything still names it,
      and says which things. learnings 3.27.)*
- [x] Desktop and phone values are edited behind one switch, which also sets what the canvas shows.
      *(Tuning a phone size next to a desktop preview was half the panel editing numbers nobody
      could see — learnings 3.26. The canvas sits in a mail-client window or a phone shell, so the
      preview answers "how big is this really".)*
- [x] Changing a design-system token moves everything that follows it, live on the canvas and in
      the exported template. *(Type scale, font stack, palette, background presets, column width
      and the phone breakpoint. A preset names a palette role rather than repeating its hex, so
      changing Red once reaches the buttons, the links, the rule and the quote bar together —
      learnings 3.12. Every token change is an ordinary document edit: one undo step, coalesced
      while dragging, autosaved. **The system belongs to the template, not the folder** — a shared
      one every template resolves against is not built.)*
- [x] Threading the tokens through the compiler changed no output at the shipped values.
      *(`tests/design-system.test.ts`, and the block snapshots diff every block in every theme.
      The point of doing it in that order is learnings 3.11: a panel built first would have been
      dials wired to nothing.)*
- [x] Numbers are dragged as well as typed. *(The whole row is the control — a track, a fill that
      reads the value, a hairline at the position, name left and number right. The drag is
      one-to-one with the fill, so reaching the right-hand edge reaches the maximum; Shift is fine
      control; a click without movement opens a field to type into. Borrowed from DialKit's panels,
      which Jared pointed at, without the dependency — see `Dial.tsx` for why.)*
- [x] Saving a section as a Pattern, placing it in a second template, changing the Pattern, and
      seeing the update badge all work. Detach produces an independent copy. *(`patterns/` in the
      folder; a placement is a copy with a version marker; Apply keeps the HubSpot field names
      whose labels match — learnings 3.54.)*
- [x] One design system in the workspace folder, which every template resolves against.
      *(`design-systems/<name>.system.json`, one file per system; a template names the one it
      follows and carries no copy. `npm run workspace` writes the example folder: the brand system,
      the card system, and a template on each — learnings 3.53. The system file has no conflict
      check yet.)*
- [x] Blocks can be copied and pasted between templates, a run of blocks can be selected with
      shift and moved, copied or deleted together, and the slash menu leads with the last four
      blocks added. *(learnings 3.55.)*
- [x] Only content fields — text, rich text, image, link — offer a HubSpot lock. No style, spacing
      or alignment field does. *(Structural: `Lock` only exists on content in `types.ts`, so there is
      no padding value that could carry one.)*
- [x] A block's Appearance panel offers alignment and nothing else. *(Size, line height and colour
      are design-system roles — set once for the template, so every block of a kind moves together.
      What stays on a block is what it *is* — a heading's level, a button's variant — and where it
      sits. learnings 3.25. The one exception is an image's width, because there is no role it could
      belong to: every image is a different shape.)*
- [x] The formatting toolbar is legible over the email it floats on. *(Near-black rather than the
      green it was, which came from the editing outline and could not be read. Deliberately not
      theme-aware: it sits over a document with its own colours — cream here, navy two blocks down,
      and whatever a dark override does to both.)*
- [ ] A custom block created in the compose tier appears in the palette and exports correctly.
- [x] No horizontal scroll at any window width down to 900px. *(Checked at 900. It did not pass
      first time — the row actions were hidden with `opacity: 0`, which still contributes to scroll
      width, exactly the bug in learnings 3.9.)*
- [ ] Every control has a one-line explanation on hover. *(Most do — the catalog carries `help` per
      control and the app renders it as a title. The ones still missing are the self-evident fields
      like "Name"; they should get one anyway.)*
- [x] Double-clicking text on the canvas edits it in place. *(Headings, the top bar tagline and
      button labels. Enter commits, Escape reverts, and the whole edit is one undo step.
      **Rich text included**, which needed the paste sanitiser it waited two rounds for: content
      from Word, Docs or a web page arrives carrying inline styles that beat the block's own size,
      colour and line height — learnings 3.5, which cost v1 a round of feedback. `sanitise.ts`
      reduces it to an allowlist, keeps `href` and nothing else, and recovers the bold and italic
      that Word expresses as styled spans. 21 tests, written against what real clipboards produce.
      In rich text Return makes a paragraph rather than committing; clicking away finishes.)*
- [x] Dragging a block on the canvas carries a translucent copy of it, and the original dims in
      place. *(A clone inside the preview document rather than a label over it, so the email's own
      stylesheet renders it and what you are carrying looks like what you picked up.)*
- [x] Inline editing has formatting, from a menu at the caret rather than a bar over the block.
      *(Type `/`: paragraph, H1–H6, lists, quote, rule, bold, italic, underline, strikethrough,
      super- and subscript, small print, code, link, clear — HubSpot's editor minus what the design
      system owns, and every tag it can produce survives the sanitiser. The same menu adds a block
      below, and opens it for typing. `- `, `1. `, `# ` and `> ` at the start of a line do what they
      do everywhere; Tab indents a list item; ⌘K links. `execCommand` underneath, which is deprecated
      and still the only thing that formats a contenteditable without shipping an editor framework.
      learnings 3.52.)*
- [x] The canvas has a keyboard: `/` and ⌘K add a block below the selected one, Enter edits it,
      ↑↓ select the neighbour, ⌥↑↓ move it, ⌘D duplicates, Delete removes it with Undo offered,
      Escape deselects, ⌘S saves, ⇧⌘E exports, `?` lists all of it. *(One policy in the app; the
      preview frame forwards what it does not own.)*
- [x] The email can be any width, including narrow, and the width means the whole email — the
      bands, the stripes and the footer, not just the text column. *(A 320px receipt is a template,
      not a mistake. `max-width` on the section bounds without forcing, so a 600px email still fills
      a phone; Outlook's band table is bounded the same way. There is no unbounded mode — learnings
      3.22 and 3.24.)*
- [x] The gutter between the email's edge and its content is one setting. *(`pagePadding`, read by
      every content cell and restated in the phone rules — a token that only reached the desktop
      styles would look like it worked and quietly revert on a phone, which is where most of these
      are read. learnings 3.23.)*
- [x] A drag says what is in your hand. *(A ghost follows the pointer with the block's name on it,
      the card it came from dims and goes dashed, and the drop indicator slides between positions
      rather than jumping. In the layer tree a real gap opens and the rows move out of the way —
      learnings 3.19.)*
- [x] Importing a v1 `.design.json` produces a working template. *(The app opens on one.)*

## 3. Real send

The part that actually decides it. Run this for every template before calling a phase done.

- [ ] The exported file uploads to HubSpot Design Manager without validation errors and
      publishes.
- [ ] Creating an email from it shows every editable field in the Contents panel, in the right
      order, with the right label, and each one does something when changed.
- [ ] Optional image blocks are absent from the send when no image is picked, and present with a
      working link when one is.
- [ ] Test send checked in: Gmail on iPhone, Gmail on Android, Gmail on desktop web, Apple Mail
      on macOS, Apple Mail on iPhone in dark mode, Outlook on Windows, Outlook app in dark mode.
- [ ] On phones the email is edge to edge, apart from the inset Gmail draws itself, and that
      inset shows the intended page background color.
- [ ] Footer lines do not wrap mid-word and each intended one-liner stays on one line.
- [ ] The address in the legal footer is not restyled blue by any client.
- [ ] Nothing is clipped in Gmail.

## Test protocol for HubSpot questions

HubSpot behavior cannot be checked locally, and each round trip costs a day. Batch them.

1. Keep one running list of open HubSpot questions with the exact template snippet that answers
   each.
2. When the list is worth a send, generate one throwaway template that exercises all of them at
   once, with each case visibly labeled in the email body.
3. Jared uploads it, creates an email, fills in the fields, sends to himself, and screenshots
   both the editor panel and the received email.
4. Record every answer in `docs/learnings.md` with its confidence upgraded from unverified to
   verified, and the date.

The first such send is Phase 0 and it blocks Phase 1.
