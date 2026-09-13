---
name: enkel-design
description: Use this skill to generate well-branded interfaces and assets in the Enkel design system (a fast, quiet dashboard system — Swiss-editorial bones, sunken page with paper cards, Helvetica for words and mono for figures, light + dark — used for Switchyards' internal ops dashboards and project tools), either for production or throwaway prototypes/mocks. Contains guidelines, colors, type, fonts, and UI kit components for prototyping.
user-invocable: true
---

Read the readme.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Rules of thumb: HelveticaNeue 400 for words, `--font-mono` for every figure; scale 11 / 12 / 13 / 14 / 16 / 18 / 24 / 28 (Stat) / 40; 4-based spacing (card pad 16, gap 12, gutter 24); page `--surface-sunken`, cards `--surface-card` with a `--border-card` hairline, no shadow, no radius on containers (buttons 6 / 4, labels 4); ink hairlines only for structure (rail, header); every indicator a square; colour only for data (`--data-1…6`, `--delta-up/down`) and status (moss / slate / amber / brick / graphite); slate iris only on filled buttons. Everything themes through tokens — never hard-code a hex; `[data-theme="dark"]` flips them.

Dashboard recipe: `AppShell ground="sunken" width="full"` with `ShellHeader` + `FilterBar` in the header slot → `StatGrid` of 4–6 `Stat`s (label / mono value / `Delta` / `Sparkline`, each with an onClick) → `CardGrid` of `Card`s holding `BarList`, `Progress` or a `DataTable`. Drill down four ways, one rule each: `Peek` on hover (never the only route), inline expand (`DataTable expandedKey + renderExpanded`) for a little more, `Panel` as `AppShell drawer` for a lot more, a full page with `Breadcrumb` when the thing has its own URL. Sparklines and bars only — no pies, legends or axes. Control geometry: top padding = bottom + 4px (36 = 11/16/7, 28 = 7/14/3, 22 = 5/14/1).
