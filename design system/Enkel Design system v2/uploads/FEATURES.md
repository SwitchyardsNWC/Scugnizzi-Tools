# Switchyards Design Projects — product brief

A functional description of the product, written for a designer. No code, no implementation. Use this to build out the design system.

---

## 1. What this is

A tool for running design projects at Switchyards, a company that builds and operates neighborhood club spaces. Two kinds of work go through it:

- **Physical projects.** New club build-outs, refreshes, signage packages, and one-off things we make ourselves (a display cabinet, a bench). These end with a real room that members walk into.
- **Digital and marketing projects.** Member app work, club websites, launch campaigns, merch drops. These end with something shipped or sent.

Today this work is spread across FigJam boards that get copied club to club, spreadsheets of furniture, shared drives of photos, and a lot of asking people where the latest version is. The product replaces that with one place where a project is planned, tracked, and handed off.

The company runs 13+ clubs across several markets. The same twelve decisions get made in every club. The product's real job is to stop re-deciding and re-drawing them.

---

## 2. Tone

**The feeling:** a well-kept workshop. Everything has a place, the tools are worn from use, and nothing is showing off.

Switchyards' own voice is plain, warm, and a little stubborn — practical people who care about mornings and coffee and neighborhoods, not a tech company. The tool should sound like a colleague who has done this before, not like software.

**Specifics:**

- **Warm, not cold.** Off-white paper grounds rather than blue-grey. A hint of texture. This is a tool for people who choose oak and brass for a living; it should not look like a bank dashboard.
- **Utilitarian, with character.** Dense where density earns its place. The character comes from typography, restraint, and honest labels — not decoration.
- **Quiet confidence.** One accent color, used sparingly. Color means status, not personality.
- **Plain language everywhere.** "2 required items block Design dev," not "Validation errors detected." "Warehouse has 0 free in bin L-08," not "Insufficient inventory."
- **Honest about state.** When something is stale, blocked, short, or missing a vendor, say so on the surface. Never let a demo look finished when it isn't.
- **Printable.** Real pages get printed and carried into a construction site. The product should look like it was designed by people who know that.

**Not this:** playful illustration, gradient hero moments, congratulatory confetti, emoji, motivational empty states.

---

## 3. The four ideas the product rests on

Everything in the interface serves one of these. A designer should be able to see all four from any screen.

**1. A project moves through phases.** Brief → Concept → Design → FF&E/Build → Install → Handoff. Each phase has a due date and a state. Everything in the product is scoped to a phase.

**2. Each phase turns on the views it needs.** A concept phase needs a board. An FF&E phase needs a schedule. A handoff phase needs a document. Views are not a fixed set of tabs everyone gets — a template decides which ones a phase uses.

**3. Nothing holds content twice. Things point at where the work lives.** A checklist item does not contain the signage plan; it points at the frame on the board and the page in the document that show it. A schedule row for an in-house build points at its spec page. This is the central idea of the product and the thing the design must make legible.

**4. The document is the record.** Every phase produces one shareable, printable document. It pulls live from the board, the schedule, and the checklist. It is what gets sent to ops, the contractor, and the vendor.

---

## 4. Who uses it

| Role | What they need |
|---|---|
| **Design lead** | Sees everything across markets. Approves specs, materials, and templates. Lives in "my tasks" and the dashboard. |
| **Designer** | Works inside one or two projects at a time. Lives on the board, the schedule, and the document. |
| **Ops** | Cares about dates, what's blocked, and what's arriving when. Reads documents more than edits them. |
| **Warehouse** | Needs pull lists, bins, quantities, and photos. Likely on a phone or tablet in a warehouse. |
| **Outside vendors and contractors** | Receive a link. Read-only. Never see the internal chrome. |

---

## 5. Use cases

These are the jobs the product is hired for. Each should be walkable end to end.

1. **Open a new club.** Start from a template, plan the space, pick finishes, schedule the furniture, install it, hand it off. Three to six months, six phases.
2. **Refresh an existing club.** Shorter version of the same. Often just a lobby or a set of booths.
3. **Make something in-house.** A display cabinet, a bench, a sign. Sketch it, spec it, cost it, build it, install it. Can be its own project or a line inside a club project.
4. **Run a campaign across every club.** A merch drop with production, in-club signage, email, social, and a print run — 13 clubs, one timeline.
5. **Ship a digital project.** A launch site or an app flow, with deliverables per channel and a launch checklist.
6. **Keep the warehouse honest.** Know what's on the shelf, what's promised to which project, and what's short before pull day.
7. **Keep the palette honest.** One approved list of materials and vendors that every project picks from, so clubs stay related and nobody re-sources oak.
8. **Hand off.** Give ops and the contractor a document that is current, printable, and shareable, without exporting anything.
9. **Know what's on my plate.** A designer or lead opens the tool and sees exactly what is theirs and what is late.

---

## 6. Views

Every view below needs designing. For each: what it's for, what's on it, what people do, and what the design has to solve.

### 6.1 Home — my work

**For:** the first screen. What's mine, what's late, what's waiting on me.

**On screen:** who I am and my role; counts (open tasks, overdue, projects, waiting on me); my tasks pulled from every project's checklist, grouped Overdue / This week / Next week / Later; each task shows its project, where the work lives, and its due date; a week strip showing task density; my projects with my role on each; mentions and approval requests.

**What people do:** tick items off, jump into the project where a task lives, answer an approval.

**Design needs:**
- A task row that carries five facts without crowding: what, which project, where it lives, who owns it, when it's due.
- Overdue must read instantly without shouting.
- Grouping by time, not by project — this is the one screen organized around *me*, not around work.
- An identity header that doesn't waste the top third of the screen.

### 6.2 Projects — the dashboard

**For:** every project in a market, four ways to look at them.

**On screen:** a KPI strip (active, due this month, blocked, open checklist items). Then one of four views of the same set:

- **List** — grouped by folder, with status, phase progress, lead, due date, and countdown.
- **Board** — columns by phase step; cards move across as projects progress.
- **Calendar** — month grid of project due dates and phase due dates.
- **Matrix** — projects down, phases across, one cell per phase showing done / in progress / not started, with the date and any blockers in the cell.

Projects are organized market → folder → project. Archived projects live separately.

**What people do:** scan for trouble, switch views, filter, open a project, start a new one, archive or delete.

**Design needs:**
- Four genuinely different views that still feel like one screen. Shared header, shared filters, shared row identity.
- The matrix is the most information-dense thing in the product: a 6-column grid of states with dates inside cells. It needs a cell design that reads at a glance and rewards a closer look.
- A quick-view panel so you can inspect a project without leaving the list.
- Status must survive being shown at four different sizes (row, card, cell, panel).
- Countdown language ("in 8 days") next to absolute dates.

### 6.3 Start a project

**For:** creating a project from a template.

**On screen:** template picker (new club build-out, club refresh, custom build, digital product, campaign, signage package), each showing how many phases, checklist items, and what it seeds. Then name, type, market, folder, lead, and due date. Below that, a preview of exactly what the template will create: every phase, the views it turns on, its checklist count, and its back-planned date.

**What people do:** pick a template, name it, set the opening day, and see the whole plan before committing.

**Design needs:**
- The template is the most important choice on the screen and should dominate it.
- The "this will create" preview is the trust-builder. It must be scannable, not a wall.
- Modal or full page? It's a consequential creation flow — design for both.

### 6.4 Project overview

**For:** the front page of a project. What it is, where it stands, what's next.

**On screen:** name, status, type, address, opening date and countdown, template, team. Phase progress. Then:

- **The space** (physical projects): map, 3D walkthrough, floor plan, and a photo strip from the site survey.
- **The product** (digital projects): design file, live preview, user flow, screens.
- **Details:** club code, size, rooms, permit status, landlord, contractor, brief.
- **Phases:** each with its status, due date, and the views it turns on. This is the main navigation into the work.
- **What's blocking:** the required items standing between here and the next phase.
- **Money:** what's committed, what's left.
- **Team.**

**What people do:** orient, then go into a phase.

**Design needs:**
- Physical and digital projects share a skeleton but swap their content blocks. The design system needs one page shape with pluggable sections.
- Embeds (maps, 3D scans, plans, design files) need a consistent frame, aspect ratio, and "open" affordance — with a graceful state before anything is embedded.
- The phase list doubles as navigation. It must show state and offer the views without becoming a menu.
- Marketing projects need a different center of gravity: deliverables by channel, a channel timeline, and copy as the source. Design this as a third variant.

### 6.5 Checklist

**For:** the work of a phase, and the gate between phases.

**On screen:** items grouped by phase, phases collapse. Each item shows: done state, title, **where the work lives**, whether it's required, owner, due date. Filters: all / open / mine / required / not yet linked. A progress bar per phase. A prominent "close this phase" action.

An item panel shows its full state, the link picker, what the template expected, sub-tasks, and notes.

**The rules that make this interesting:**
- A required item cannot be marked done until it points at a real deliverable.
- A phase cannot close until every required item is done.
- The refusal is explained on the spot, not hidden in a disabled button.

**What people do:** tick things off, link deliverables, and close phases.

**Design needs:**
- The "lives in" column is the product's core idea made visible. It needs an icon-plus-label pattern that distinguishes a document page from a board frame from a schedule row from an uploaded file, and reads as a link.
- An unlinked required item must look unfinished, not broken.
- The refusal pattern: when the system says no, it has to feel like a colleague pointing at the missing thing, not an error.
- A link picker that lets you choose from everything in the project, grouped by kind.
- Phase groups that collapse without losing the sense of overall progress.

### 6.6 Board

**For:** working things out visually. Mood, references, plans with markers, layouts, sketches.

This replaces the FigJam board that currently gets copied from club to club. The difference: frames here are **typed**, not freehand. A frame is a small structured document, so what's on it can feed the schedule and the handoff document.

**Frame types:**
- **Signage plan** — a floor plan with numbered markers and a legend.
- **Materials board** — swatches picked from the approved materials library, showing vendor, cost, and lead time.
- **Room direction** — four reference images and one line of intent, per room.
- **Booth layout** — counts and placement on the plan.
- **Furniture plan / lighting plan** — tagged pieces on the plan; the tags match the schedule.
- **Sketch** — a drawing with dimensions that feed a spec page.
- Plus sticky notes, loose images, and text.

**On screen:** a pan-and-zoom surface of frames. Frames are placed from templates and arrive already named and already linked to the checklist item that expects them. Selecting a frame shows where it's used, and lets you push it into the handoff document or link it to a checklist item.

**What people do:** place a frame from a template, fill it in, drop markers on a plan, pick swatches, drag things around, and push the result into the document.

**Design needs:**
- A card system: every frame type needs a board form (editable, compact) and a page form (read-only, laid out for a document) that are recognizably the same object.
- Board chrome: selection, drag, resize, z-order, zoom controls, a way back to "fit."
- The inspector panel showing provenance — used in which document pages, linked to which checklist items.
- Sticky notes need to feel like paper without being cute.
- Image slots need a strong empty state; most will be empty at first.
- This must not look like a generic whiteboard tool. It's a set of structured cards on a surface.

### 6.7 The project document

**For:** the record of a phase. What gets presented, printed, and shared.

**On screen:** a document of ordered sections. Some are written (cover, brief, next steps). Some are **live** — they pull from elsewhere and stay current:

- A board frame (the signage plan, the materials board)
- The schedule summary (rooms, counts, totals)
- Checklist status
- A spec page for an in-house build
- Photo grids

A live section shows its freshness: current, or changed since you last looked, with a way to refresh or to freeze it at a moment in time.

**What people do:** write, reorder sections, choose which sections are public, present it full-screen, print it, and share a link.

**Design needs:**
- **Inline editing.** Text is edited in place, in the document, at the size it will be read. No separate edit mode, no side-by-side form.
- **A freshness pattern.** Live / stale / frozen needs to be legible without cluttering the page. This is a small badge that carries a lot of meaning.
- **Two skins of the same content:** an editing view with section chrome, and a clean reading view for the public link and for print.
- **Present mode:** full screen, one section at a time, keyboard-driven, no chrome.
- **Print:** real page breaks, no navigation, ink-conscious. Someone will tape this to a wall.
- **Share controls:** public on/off, per-section visibility, and a clear signal of what an outsider will and won't see.
- Section reordering by drag.

### 6.8 Spec page (in-house builds)

**For:** one page per thing we make ourselves. The single source for it.

**On screen:** dimensions, materials, finish, cut list, which shop and how many days, cost and shop time, where it installs, and the approval trail. The drawing comes live from the board. The schedule row and the relevant checklist items point here.

**What people do:** spec it, approve it, build from it, and reuse it at the next club.

**Design needs:**
- A specification layout: label/value pairs that survive printing and stay readable at arm's length in a workshop.
- Drawing plus data side by side.
- An approval trail that shows version and who signed off.
- "Save as a template" so the second cabinet is easier than the first.

### 6.9 Schedule (furniture, fixtures, equipment)

**For:** everything that goes into a space, where it comes from, and what it costs.

**On screen:** rows grouped by room. Each row: photo, tag, item, quantity, **source**, where it comes from, unit and total cost, status. Two views of the same rows — a dense table and a photo gallery.

**Three sources, and this distinction drives the whole screen:**
- **Warehouse** — we already own it. Shows the bin. Adding it reserves stock.
- **Purchase** — we're buying it. Shows the vendor, from the approved materials list.
- **Build** — we're making it. Points at its spec page.

Summary strip: item count, how many from the warehouse, how many to purchase, total spend, how many installed. When the warehouse doesn't have enough, the row is flagged short and the shortfall surfaces before pull day.

**What people do:** add items from any of the three sources, watch statuses progress (needed → ordered → delivered → installed), fix shortfalls, and print the list.

**Design needs:**
- **Photos are not decoration here.** The team recognizes a chair by sight. The table needs thumbnails; the gallery view needs to be first-class, not a toggle afterthought.
- Source needs its own color/badge language, distinct from status. Two semantic dimensions on one row.
- Money and quantities need tabular figures and right alignment.
- A shortfall must be impossible to miss without turning the table red.
- An add flow that changes shape by source, and previews the consequence before committing ("this leaves you 2 short").
- Room grouping with per-room subtotals.

### 6.10 Warehouse

**For:** what we own, what's promised, and what's about to be pulled.

**On screen:** stock by category with photo, bin, condition, quantity on hand, what's reserved for which project and when it pulls, and what's free. Summary: total stock, reserved, pulls scheduled, items short. A side panel of pull lists — one per upcoming project pull, with staging progress, shortfalls, a printable pick list, and a link back to the schedule.

**What people do:** check availability, reserve, resolve shortfalls, run a count, and stage a pull.

**Design needs:**
- This screen is likely used on a phone or tablet in a warehouse. Design responsively and for large touch targets.
- The reservation model needs to be visible: on hand, minus reserved, equals free. Show the arithmetic.
- The pick list is a printed artifact. Design it.
- Condition (good / worn / needs refinish) is a third state dimension alongside stock and reservation.

### 6.11 Library — approved materials and vendors

**For:** the one list of what we're allowed to build with.

**On screen:** materials as swatch cards — name, spec, vendor, cost, lead time, approval state, and how many clubs already use it. Filter by category. A vendors tab with contacts, lead times, and open orders. A detail panel with the full spec, the vendor, where it's been used, and buttons to drop it onto a materials board or into a schedule.

New finishes enter as **proposals** and stay pending until a lead approves them.

**What people do:** browse, approve, and pull materials into boards and schedules.

**Design needs:**
- A swatch card that shows a real color or texture at a useful size, with data underneath.
- Approved versus pending must be obvious at card size.
- The detail panel doubles as the material's page — spec, provenance, and usage.
- A palette-building feel: this is where taste lives, so it should be the best-looking screen in the product.

### 6.12 Templates

**For:** the system optimizing itself.

**On screen:** two kinds —

- **Frame templates** for the board: what each one is, which checklist item expects it, what it feeds, and how many projects use it.
- **Project templates:** the phases, the views each phase turns on, checklist counts, typical durations, and what gets seeded (a furniture kit, a document, a checklist).

Templates also learn: when finished projects show a repeated pattern (the cut list always got made too late), the template suggests a change for its next version. Publishing a new version offers the update to live projects.

**What people do:** browse, use a template in a project, edit one, publish a new version, and accept suggestions.

**Design needs:**
- A visual preview of each frame template — a small schematic, not a screenshot.
- The phase/view matrix inside a project template is a small dense grid; it needs the same care as the dashboard matrix.
- Versioning UI: what changed, what it affects, who gets it.
- The suggestion pattern: evidence, proposed change, accept or dismiss.

### 6.13 Calendar

**For:** dates across all projects.

**On screen:** a month grid with project due dates and phase due dates, distinguished from each other, with at-risk items marked. A "next 30 days" list beside it.

**Design needs:**
- Two event weights (project due vs. phase due) plus a risk state, in a small chip that fits a calendar cell.
- Month cells will overflow. Design the overflow.

---

## 7. Cross-cutting design needs

These apply everywhere and should be settled in the design system before the screens.

**Status language.** One semantic set used consistently: on track / done, in progress, at risk, blocked, not started — plus a distinct treatment for in-house builds, which are neither bought nor pulled. Every one of these appears as a badge, a dot in a table, a bar, a calendar chip, and a card border. Design all five sizes.

**Provenance.** "Lives in," "used in," "linked," "from template," "pulls from." This is the product's signature idea. It needs one visual language: an icon set for the destination kinds (document page, board frame, schedule row, embed, file), a link treatment, and a freshness state.

**Two clocks.** Projects have due dates; phases have due dates. Both appear together constantly. Relative time ("in 8 days," "6 days ago") usually matters more than the date itself.

**Numbers.** Money, quantities, counts, dimensions, and bin codes appear on nearly every screen. Tabular figures, a monospaced treatment for codes and identifiers, and consistent alignment rules.

**Density with photographs.** Dense tables that still show images. This is the hardest layout problem in the product and the one most likely to go wrong.

**Panels.** Nearly every screen has an inspector on the right: the selected project, item, frame, material, or row. One panel component, collapsible, with a consistent header, body, and footer-action pattern.

**Refusals and gates.** The product says no on purpose — a required item without a deliverable, a phase that can't close, a warehouse that's short. These need a consistent, non-punitive pattern that explains and points at the fix.

**Empty states.** Most objects start empty: no photos, no board frames, no document, no vendor, no spec. Every empty state should say what goes there and offer the one action that fills it. Placeholders should look deliberate, not broken.

**Read-only and public.** Outsiders see documents through a link. That view needs its own minimal chrome, and it must be obvious to the internal user what an outsider will see.

**Print.** Documents, spec pages, and pick lists all get printed. Page breaks, ink economy, and legibility at arm's length.

**Responsive.** Full desktop for the dense views. Tablet for walking a site with a plan. Phone at minimum for the checklist, my tasks, and the warehouse pick list.

**Motion.** Sparing. Panel slides, section reveals, and state transitions that explain a change. Nothing decorative.

---

## 8. Content and voice rules

- Label things the way the team says them out loud: "cold-cold," "big room," "booths," "the pull," "club paper."
- Numbers get units and context: "21 free in bin C-01," not "21."
- Dates get relative context: "Sep 12 · in 8 days."
- Never a bare error. Say what's wrong, where, and what fixes it.
- Never congratulate. Confirm and move on.
- Say "waiting on you" rather than "action required."
- Placeholder content should be visibly placeholder, never plausible-looking fake data in a shared document.
