# Changelog

One version for the whole suite, set in `version.js`. Newest first.

## 0.10.0 · 2026-11-12

Every tool on Enkel.

- Enkel gains a tool layer (`tools.css`, `tokens/controls.css`): a paper side panel, 28px controls built from padding,
  square checks, switches and slider thumbs, colour wells, presets, selectable lists, a sunken stage and an export bar.
  `guidelines/controls-tools.html` shows all of it in light and dark.
- Ink bleed, Image effects, Split-flap, Riso and HUB-MOD move onto it. Slate iris is the one accent; selection is ink
  (a filled segment, a 2px marker, a 2px edge), never colour alone. Image effects is rebuilt in the shared frame, with
  Download in an export bar instead of below the fold.
- Light or dark, one pick for the dashboard, every tool and Template Studio: a switch in the banner and the dashboard
  header, kept by `theme.js`. Dark stays the default.
- The banner, the shortcut sheet, the toasts and the project picker are drawn in Enkel's tokens. Reset asks on the
  system's own sheet instead of the browser's.
- Space and Enter on a button reached with the keyboard press it; they no longer fire the tool's shortcut instead.
- Dashboard: the header no longer gets squeezed on a long page; words in the header share a baseline.

## 0.9.0 · 2026-11-11

First numbered release. Covers everything merged to date, through pull request 58.

- Freeform: several frames on one canvas, a fast preview for heavy effects, and a reworked top bar.
- Freeform: ink bleed as an effect step; arrange, flip, hide and lock, copy style, Alt-drag copy and a
  right-click menu.
- Freeform: text tool, multi-select, picture crop and fit, frame sizes and starters, brand library.
- Effects: one shared engine for Riso, image effects and ink bleed, on a layer or the whole page.
