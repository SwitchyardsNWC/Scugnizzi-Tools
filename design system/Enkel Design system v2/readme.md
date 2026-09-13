# Enkel design system

*Enkel* — Swedish for "simple". A fast, quiet dashboard system for Switchyards' internal tools: one sans for words, one mono for figures, a sunken page with paper cards, soft hairlines inside and ink hairlines for structure, no shadows, square everything except what you press. Numbers do the work; colour is reserved for data and status. Every figure drills down.

## Context

- **Products:** Switchyards Ops Dashboard (`ui_kits/dashboard/` — the reference dashboard: clubs, projects, warehouse, signage, team, budget) and Switchyards Design Projects (`ui_kits/switchyards/`, brief in `uploads/FEATURES.md` — running club build-outs through Brief → Concept → Design → FF&E → Install → Handoff). The Art-ventory admin kit that seeded the system has been retired.
- **Wordmark:** lowercase product name in plain type with a trailing underscore (`switchyards_`, `enkel_`). No mark, no icon set, no imagery supplied.

## Voice

- Quiet, declarative, catalogue-like. Labels read as index entries: "Overview", "Clubs", "Warehouse" — never "Browse all your clubs!".
- Sentence case everywhere, including buttons ("Start a project", "Export"). Wordmark all-lowercase.
- No "I"/"we"/"you" in chrome. System messages terse: "Saved.", "3 clubs selected", "No results".
- Full stops on complete sentences only; no exclamation marks; em dashes and middots in metadata ("Lead Mira · updated 2 min ago").
- Emoji: never. Glyphs are typographic: `→ ← + × › ▲ ▼ ■`.
- Numbers carry units and context, set in mono: `78 %`, `$412k`, `9 of 14`, `21 free in bin C-01`. Dates carry relative context: `Sep 12 · in 8 days`.
- Card titles say what the figure is, not what it means: "Occupancy by club", never "Great occupancy!". Summaries are honest counts: "6 of 9 projects".
- Switchyards register: plain, warm, a little stubborn ("cold-cold", "big room", "the pull"). Never a bare error — say what's wrong, where, and what fixes it. Never congratulate. "Needs attention", not "Action required".
- Empty states: one line, muted: "No projects match this filter."

## Colour

- **Surfaces** (`tokens/colors.css`): the page is `--surface-sunken` (#f5f5f4), cards are `--surface-card` (#fff), rows hover to `--surface-row-hover` (#f0f0ef), selection is `--surface-selected`. Rail and header stay paper. That is the whole tint set.
- **Text:** `--text-primary` #0d0d0d, `--text-secondary` #3a3a38, `--text-muted` graphite #6f726e (4.9:1 — the readable grey), `--text-faint` #a8aaa7 for placeholders only, never copy.
- **Lines:** `--border-hairline` (ink) only for structure — rail edge, shell header, section rules on editorial pages. Inside cards everything is soft: `--border-card` #dededc around a card, `--border-muted` #e6e6e4 between rows.
- **Slate iris** `#495472` is still the only chroma in chrome: filled buttons and the accent card. Never text, icons or borders.
- **Data palette** (`--data-1…6`): 1 blue #4a5fa5 is the default bar/line; 2 green #5b8a5e revenue/good; 3 amber #c48a2e warn; 4 brick #b8412b bad; 5 grey neutral; 6 teal secondary series. `--data-track` is the empty bar. One tone per chart; 3 and 4 only to flag the row that matters.
- **Deltas:** `--delta-up` #2f7a44, `--delta-down` #b8412b, `--delta-flat` graphite. Direction of good follows the metric (`invert` for costs, open items).
- **Status set** (`tokens/status.css`): done/on track moss, in progress slate, at risk amber, blocked brick, not started graphite; each with a soft ground. Colour means status, not personality.
- **Dark mode:** every token above flips under `[data-theme="dark"]` (sunken #0e0e0e, card #1a1a1a, text #f2f2f0, hairline #3a3a38, data colours lifted). Components never hard-code a hex — if something doesn't flip, fix the token use. `ThemeToggle` sets the attribute and remembers it in localStorage `enkel-theme`; first load follows the OS.

## Type

- **HelveticaNeue** 400 for every word. **Mono** (`--font-mono`: system monospace stack) for every figure that can change — Stat values, Delta, table numbers, codes. Never mono for labels.
- Scale: 11 (uppercase kickers) / 12 (column labels) / 13 (labels, hints, card titles) / 14 (body, cells, buttons) / 16 / 18 (shell and panel titles) / 24 (section heading) / 28 (Stat value, mono) / 40 (hero figure, editorial title). Tracking 0.011em of the size; mono is tracked 0 (−0.2px at 28). Line-heights 1.2–1.3 for UI, 1.5 for prose.
- Phone floor is 16px body; 13px only for meta.
- Hierarchy is made by size and colour, not weight: card title 13 secondary, figure 28 ink, delta 13 coloured, hint 13 muted.

## Space, line, shape

- 4-based rhythm: 4 / 8 / 12 / 16 / 24 / 32. Card padding 16, gap between cards 12, page gutter 24 (32 on reading pages), section gap 32. Page max 1440. The old 21 / 42 / 84 rhythm survives for editorial pages.
- Cards are square, one soft hairline, no shadow, no radius. Radii live only on things you press or look at: buttons 6 (4 small), labels and chips 4, photographs 6 (4 thumbs). Never a pill, never a radius on a container.
- Every indicator is a square: status dots, sparkline end-points, clock glyphs, delta glyphs. No circles.
- Shadows, blur, gradients, textures: none. The scrim is the one transparency.

## Interaction

- **Control geometry:** height from padding, never centring — 36px control = 1 + 11 / 16 line / 7 + 1; 28 small = 7 / 14 / 3; 22 label = 5 / 14 / 1; 18 uppercase tab = 4 / 12 / 0. Top padding = bottom + 4px (`--optical-nudge`) to land the cap height on the true middle of this face.
- **Controls:** Button filled slate / outline / ghost, 36 or 28 tall. Segmented (2–5 options, active filled ink) for period, view, group-by. FilterChip for active filters. Select for 6+ options. Fields hairline-bottom, focus thickens to 2px ink.
- **Drill-down — four ways down, one rule each** (`guidelines/layout-drilldown.html`):
  1. **Peek** — hover 250ms, 3–5 fields beside the trigger; click still commits; never the only route.
  2. **Inline expand** — click a row, it opens in place under a 2px ink marker (`DataTable expandedKey + renderExpanded`). "A little more."
  3. **Drawer** — click a Stat or row, a 440px `Panel` overlays the main (`AppShell drawer`), Escape closes, filters underneath survive. Bottom sheet on phone. "A lot more."
  4. **Page** — the thing has its own URL (a club, a project): full width, its own Stats and Cards, `Breadcrumb` above the title.
  Every Stat goes somewhere. Every Card footer names where its "All …" link lands. Depth never exceeds three: overview → list → thing.
- **Tables:** hairline rows, no zebra, 12px muted column labels, 14px cells, `numeric` columns mono right-aligned, `stickyHeader` + `pinFirst` under the shell header; the sheet scrolls sideways rather than let columns collide. `density="compact"` for long operational lists.
- **Charts:** sparklines and bars only. `Sparkline` (line or bar row, no axes, last point marked) says which way; `BarList` (ranked, labelled, mono values) replaces bar charts; `Progress` for parts of a whole. No pies, no legends, no chart titles beyond the card title.
- **Hover:** ≤120ms linear colour change only. Rows take `--surface-row-hover` and a 2px left marker; drill cards deepen their border to ink and show →. No lift, no scale.
- **Focus:** `:focus-visible` 1px ink outline, 2px offset. **Links:** graphite → ink.
- **Motion:** essentially none. Bars and progress animate width 120ms; nothing else moves.
- **Refusals** (brick gate / amber shortfall), **provenance** (glyph + label), **two clocks**, **freshness** carry over unchanged from the project tooling.

## Layout tiers

- **Shell:** `AppShell` owns the viewport — 200px paper rail | static `header` (ShellHeader + FilterBar) above a scrolling `main`. `ground="sunken"` tints the main for dashboards; `width="full"` for tables. `ShellHeader` 56px: kicker/breadcrumb, 18px title, actions.
- **Dashboard page order:** `StatGrid` (4–6 Stats) → `CardGrid` of Cards (min 320) → tables in a Card. Nothing above the Stats but the header.
- **Desktop ≥1024:** rail 200, gutter 24 (full) / 32 (page), content max 1440. **Tablet 768–1023:** rail 160, gutter 24. **Phone <768:** rail disappears; `TopBar` (48px) + `BottomTabs` (56px); drawer becomes a bottom sheet; `DataTable` rows become `ListRow`; StatGrid and CardGrid drop to one column on their own.
- **Touch:** 44px minimum target, 56px rows, 8px between adjacent targets.

## Components

- `components/dashboard/` — **Stat**, **StatGrid**, **Delta**, **Num**, **Sparkline**, **BarList**, **HeatGrid** (bin/day cell map), **Card** (with `updated` freshness footer), **CardGrid**, **Segmented**, **FilterBar**, **FilterChip**, **Breadcrumb**, **Peek**, **ThemeToggle** (+ `GetTheme`, `ApplyTheme`; the phone breakpoint hook lives in `Stat.jsx` for component-internal use).
  Thresholds are data, not code: kits keep targets per metric/club in their data file and map value → data tone 1/3/4 (fine/amber/brick). Mono figures use IBM Plex Mono (pinned) so Stats match across OS.
- `components/brand/` — Wordmark, SidebarNav.
- `components/typography/` — Headline, Heading, Paragraph, TextLink.
- `components/surfaces/` — Button, AccentCard, ImageBlock + ImageGrid, Divider.
- `components/forms/` — TextInput, Select, Tag, DataTable (inline expand, numeric columns, density).
- `components/layout/` — AppShell (+ ShellHeader), TopBar, BottomTabs, Sheet, ListRow.
- `components/status/` — StatusBadge (badge / dot / bar / chip / card), SourceBadge, Freshness.
- `components/provenance/` — LivesIn, DateStamp.
- `components/panels/` — Panel + PanelSection + Field, Refusal, EmptyState, Progress, Kpi + KpiStrip (quiet figure; prefer Stat on dashboards).

## Index

- `styles.css` — global entry; imports `tokens/*.css` (fonts, colors incl. dark theme, status, typography, spacing, layout, base).
- `guidelines/` — foundation cards: colours (surfaces & dark, data, neutrals, status…), type scale, spacing scale, control geometry, drill-down patterns, layout, imagery, brand.
- `ui_kits/dashboard/` — Switchyards Ops Dashboard: Overview (Stats → drawers), Clubs (table with inline expand → club page with breadcrumb, or cards), Projects (table → inspector drawer). Warehouse, Signage, Team not built.
- `ui_kits/switchyards/` — Design Projects: My work, Projects, Checklist, Schedule (editorial pages on the same tokens).
- `thumbnail.html` — project tile. `SKILL.md` — agent skill entry.

## Caveats

- Helvetica Neue LT Std is self-hosted from `fonts/`. The mono is a system stack (SF Mono / Menlo / Consolas) — no mono file was supplied; drop one into `fonts/` and add an `@font-face` to `tokens/fonts.css` to pin it.
- No logo, imagery or icons supplied — placeholders are hairline boxes.
