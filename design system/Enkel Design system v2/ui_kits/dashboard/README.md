# Switchyards Ops Dashboard — UI kit
The reference dashboard for Enkel. One shell, four drill patterns (drawer, inline expand, full page with breadcrumb, hover peek):
- **Overview** — six Stats → drawer (revenue, budget) or section page; Cards with BarLists, Progress list, compact table.
- **Clubs** — table with inline expand (name → club page with Breadcrumb) or cards.
- **Projects** — full-width table with status/phase filters; row → drawer inspector.
- **Warehouse** — Stats, bin map (HeatGrid, hover peek, click → item drawer), pulls, stock table.
- **Signage** — stage funnel (BarList, click filters the table), aging list, pieces table → drawer.
- **Team** — workload table with inline expand (projects + clubs), one card per person.
Thresholds live in `data.js → targets` (occupancy per club, load, stock, budget, fill) and resolve through `DASH.tone(metric, value, id)` → data tone 1/3/4. Every data Card carries `updated` (Freshness in the footer). Under 768px StatGrid pins two columns and wide tables scroll inside their card with the first column pinned.
Files: index.html, data.js, DashShell.jsx, OverviewScreen.jsx, ClubsScreen.jsx, DashProjectsScreen.jsx, WarehouseScreen.jsx, SignageScreen.jsx, TeamScreen.jsx, DashApp.jsx. Sample data is fictional.
