# Switchyards email templates

## Template Builder (start here)

**File:** `template-builder.html`. Double-click it. No install, no server.

You design a template out of blocks, decide which blocks the team can edit, and export a
HubSpot coded email template. Upload that to Design Manager and the team fills in copy in
HubSpot's normal email editor.

### Workflow

1. Open `template-builder.html`. It starts with the standard email already built (the
   "standard-v1" design: top bar, stripes, logo, hero image, body, button, secondary image,
   closing text, sign-off, stripes, the stacking two-column footer, legal).
2. Rearrange blocks with the drag handle or the arrows. Add blocks from the "Add a block" row.
   Duplicate or remove with the icons on each block.
3. Click a block to open it. Set its default content, then tick or untick
   **Team can edit this in HubSpot**. Give editable blocks a clear label. That label is what
   the team sees in the HubSpot editor.
4. Set **Template name in HubSpot** at the top of the sidebar.
5. Click **Export HubSpot template**. It downloads a `.html` file.
6. In HubSpot: **Content > Design Manager**, pick a folder, **File > Upload files**, choose the
   file, open it once so it validates, publish.
7. Team: **Marketing > Email > Create email > Custom tab**, pick the template, fill in the fields.

Designs save automatically in your browser. The dropdown in the header switches between them.
**New** starts a fresh design from the standard email, or from whichever design you marked
with **Set as default** (saved in that browser; the dialog offers "Back to built-in" later). **Export design** / **Import design…**
move a design between browsers or people as a small JSON file. Removing a block or a design
shows an **Undo** for a few seconds instead of asking first.

### Force light mode

On by default under **Template**. Keeps the email on its own colors when the reader's device
is in dark mode, using three layers because email clients differ:

- `color-scheme` / `supported-color-schemes` meta tags and a matching CSS rule. Apple Mail and
  iOS Mail honor these and leave the email alone.
- A `prefers-color-scheme: dark` block that re-asserts every background, text and link color
  used in the design, for clients that apply their own dark styles.
- Outlook's `[data-ogsc]` / `[data-ogsb]` selectors, which win over the color rewrite Outlook's
  apps and outlook.com apply in dark mode.

Gmail's apps ignore all known overrides and will still adjust colors. Nothing fixes that, so the
design uses solid brand colors that still read acceptably when Gmail inverts them.

### Blocks

| Block | Editable in HubSpot as | Notes |
| --- | --- | --- |
| Top bar | Text field | Navy bar, uppercase. Separate desktop and mobile font sizes, 12px and 10px by default |
| Stripes | Fixed | Two full-width lines, each with its own color (brand palette or a custom hex) and thickness. Thickness 0 drops a line, so it doubles as a single rule |
| Image | HubSpot's image module by default (image, link and alignment all set in HubSpot), or an image picker plus a separate link field | Width, spacing, background. The module gives the team HubSpot's image picker with its own link and alignment; the template renders the image from those values. "Optional in HubSpot" (on by default) leaves the block out of the email until an image is picked, so no placeholder ever ships. The "picker + link field" option hides the block until an image is added, but the link must then go in that separate text field, because HubSpot does not expose the picker's own link to templates |
| Heading | Text field | H1 to H4 levels, optional size and mobile size override, color, alignment, spacing. Left blank in HubSpot, the whole block disappears, gap included |
| Text | Rich text editor | Font size, mobile size, line height, alignment, color, spacing. Default content uses the friendly format below. Anything the team formats in HubSpot's editor (H1 to H6, lists, quotes, links, rules, tables) is styled to the brand for desktop and phone |
| Button | Text + link fields | Blank text in HubSpot hides the button. Red or white outline, desktop and mobile text size, spacing |
| City links | Rich text (locked by default) | The `City \| https://…` list as one wrapping line or a stacked list, with alignment, size, color, background and spacing |
| Spacer | Fixed | Vertical space |
| Footer (two columns) | Each part has its own toggle | Buttons, social links, tagline, city list. Cities are `City \| https://…` per line; a city without a link is plain text and looks identical |
| Footer (two columns, stacks on phones) | Each part has its own toggle | Desktop: tagline and buttons left, cities and links right. Phones: one column in that order, with the right column's alignment switchable (left by default). Cities layout is adjustable |
| Footer (centered) | Each part has its own toggle | One centered stack: tagline, buttons side by side, links heading with the social links in a row, cities as one wrapping line. Buttons stack on phones |
| Footer (minimal) | Each part has its own toggle | Slim band: tagline left, social links right, optional button row below. Stacks and centers on phones |
| Legal footer | Note only | Company, address, Unsubscribe and Manage Preferences come from HubSpot settings. The address is wrapped in a white, non-underlined link to Google Maps so Gmail and Apple Mail don't restyle it as a blue link |

Sections have no side padding, so the email runs edge to edge on phones. On desktop the
600px column centers itself as before. Some phone apps, Gmail in particular, still draw a
small inset around every message. An email cannot remove that. The **Page background**
setting under Template picks the color that inset shows (cream, navy or white).

### Rich text defaults the team gets in HubSpot

Text blocks use a real type scale: paragraphs at 18px with 1.5 line-height and 16px after,
headings from 38px down to 12px with tighter line-heights and 8 to 16px after, lists with
8px between items, quotes with a red rule. Blank lines are no longer needed for spacing.

Every block has **Space above** and **Space below** fields. Footer and legal parts are
**not editable by default**: the template renders them, so a re-upload updates every send.
Tick a part's toggle if a particular template should let the team change it.

### Editable rich text keeps its own copy per email

When a block is editable, HubSpot copies the default into each email the moment that email is
created. Changing the default in the builder and re-uploading updates new emails only. An
existing email keeps whatever its copy says, which is why an older test email can still show
the old city list. Either create a fresh email from the template, or edit that block in the
email itself. For content that should always be current across every send, such as the city
list or social links, untick "editable in HubSpot" and the template renders it directly.

Background choices: cream (the default page), navy, off-white. Text and button colors follow.

### Text block editor

Text blocks have a small editor: paragraph, H1 to H3, bold, italic, underline, link, lists,
clear formatting, and an HTML view. Pasted content is cleaned down to those tags, with inline
styles dropped, so the block's size, line height and color always apply. Designs written in
the older friendly format (`**bold**`, `[text](url)`) are converted once when loaded.

The friendly format is still used in the two-column footer's links box and the legal note:
a blank line starts a paragraph, `**bold**`, `[link text](https://…)`, and a box starting
with `<` is treated as raw HTML.

### Notes

- Everything exported was checked for HubL syntax against HubSpot's docs but not uploaded to
  HubSpot from here. If Design Manager flags a line, send it over.
- Images should live in HubSpot Files. Paste the file URL into the Image block.
- HubSpot adds its own tracking to links on send. Leave URLs clean.

## Also in this folder

| File | What it is |
| --- | --- |
| `switchyards-standard-email.html` | An earlier export of the standard email. The builder's export is the current version; use that. |
| `editor.html` | A standalone copy editor for one-off emails outside HubSpot. Copy or download finished HTML. |
| `template.html`, `content.json`, `render.js`, `build.js` | Source for `editor.html`. `node build.js my-email.json` renders to `dist/`. |
