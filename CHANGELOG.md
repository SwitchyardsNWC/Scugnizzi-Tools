# Changelog

One version for the whole suite, set in `version.js`. Newest first.

## 0.10.0 · 2026-11-11

- HubSpot desk: Template Studio's side of HubSpot as a claude.ai artifact. It lists the portal's coded email
  templates through your HubSpot connector, reads each back, shows its maker, fields, checks, a preview and its
  source, compares it with what this build writes, and makes a draft email from it after a confirmation.
- Template Studio: every file that ships (Export, Copy, the code drawer) carries its design in a HubL comment, so a
  template read back from HubSpot can be opened again. The size Gmail sees leaves it out.

## 0.9.0 · 2026-11-11

First numbered release. Covers everything merged to date, through pull request 58.

- Freeform: several frames on one canvas, a fast preview for heavy effects, and a reworked top bar.
- Freeform: ink bleed as an effect step; arrange, flip, hide and lock, copy style, Alt-drag copy and a
  right-click menu.
- Freeform: text tool, multi-select, picture crop and fit, frame sizes and starters, brand library.
- Effects: one shared engine for Riso, image effects and ink bleed, on a layer or the whole page.
