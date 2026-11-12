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
- One export bar in every tool: the finishing action across two columns, the rest in pairs, Copy recipe last, the
  recipe beside them on whole lines. HUB-MOD's Download .zip moves into it.
- Presets is the section's name in every tool, and each ends on the same Reset to defaults. Every delete says what it
  deletes ("Delete module", "Remove ink 2", "Delete layer Hello"). Colour rows read well, then hex, then name.
- Image effects opens on a sample photograph, with a button to bring it back. Its zoom reads the true scale
  ("Fit · 71%"), draws crisp at 100% and 200%, and the other tools' Fit says its scale too. Zoomed out, the work stays
  centred in every tool; zoomed in, it scrolls to every edge.
- The Board and the Studio library follow light and dark with the suite.
- Lined up: the banner's words, section names and their state, the stage bar's figures and the Zoom label, and the
  recipe's first line and the first export button each share a baseline.
- HUB-MOD: every hint is two lines at most, at every window width from 820 px up. What no longer fits is in the
  title of its control. A note under a control (Corners, On phones) lines up with that control. A new group's
  items are Entries, not Entrys.
- Template Studio: the editor's styles stay inside the editor and Freeform, so the Board and the library no longer
  need patches against them. The editor's empty trash can no longer holds the file list 9.5 px low until the first
  delete. In Freeform's Canvas menu each value sits on its label's baseline, in any face.

## 0.9.0 · 2026-11-11

First numbered release. Covers everything merged to date, through pull request 58.

- Freeform: several frames on one canvas, a fast preview for heavy effects, and a reworked top bar.
- Freeform: ink bleed as an effect step; arrange, flip, hide and lock, copy style, Alt-drag copy and a
  right-click menu.
- Freeform: text tool, multi-select, picture crop and fit, frame sizes and starters, brand library.
- Effects: one shared engine for Riso, image effects and ink bleed, on a layer or the whole page.
