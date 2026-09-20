# Email template builder — everything learned building v1

Date: 2026-09-10. Source: building `template-builder.html` and shipping real Switchyards
emails through HubSpot. Every item here cost something to find out. Treat it as the
non-negotiable reference for v2.

Confidence is marked on each item:

- **Verified** — seen in a real send or in HubSpot itself.
- **Documented** — HubSpot's or a vendor's docs say so, matched what we saw.
- **Unverified** — believed correct, never proven in a live send. Test before relying on it.

---

## 1. HubSpot coded email templates

### 1.1 The file

A coded email template is one HTML file uploaded to Design Manager. It must open with an
annotation comment or HubSpot will not offer it when creating an email. **Verified.**

```html
<!--
  templateType: email
  isAvailableForNewContent: true
  label: Switchyards Standard Email
-->
```

Upload path: Content > Design Manager > folder > File > Upload files. Open the file once so
it validates, then publish. The team then picks it under Marketing > Email > Create email >
Custom tab.

### 1.2 How a field becomes editable

Editable areas are HubL tags. The ones that matter:

| Tag | Gives the team | Notes |
| --- | --- | --- |
| `{% text %}` | Single-line text input | Good for headings, button labels, taglines, URLs |
| `{% rich_text %}` | HubSpot's WYSIWYG | The team's formatting comes back as arbitrary HTML |
| `{% linked_image %}` | Image picker with a link field | The link is **not** exposed to the template. See 1.5 |
| `{% boolean %}` | Checkbox | Only useful if the thing it controls is already rendered |
| `{% module path="@hubspot/..." %}` | A HubSpot stock module | HubSpot renders it |

### 1.3 `export_to_template_context` is the core pattern

Declaring a tag renders it in place, which gives no control over surrounding markup. Adding
`export_to_template_context=True` makes the tag render nothing and instead publish its value
into `widget_data`, so the template can place the value inside its own tables. **Verified.**

```hubl
{% text "headline" label="Headline", value='Default copy', export_to_template_context=True %}
...
{{ widget_data.headline.value }}
```

Everything in v1 is built on this. It is what makes brand-controlled markup and team-editable
copy coexist.

### 1.4 Declaration order controls the editor panel order

**Verified, and it was a real bug.** HubSpot lists fields in the Contents panel in the order
the tags appear in the source. v1 originally collected all declarations and emitted them in a
block at the top of the file, which produced a panel in an order that matched nothing. The fix:
emit each declaration immediately before the markup that consumes it, so the panel order
follows the visual order of the email. v2 must preserve this rule in its compiler.

**Extended and verified 2026-09-11.** v1 only ever proved the flat case, and v2 nests every
block inside sections, rows and columns. A probe declared three fields in source order — one at
the top level, one two tables deep, one inside a `{% if %}` that was true — and the Contents
panel listed all of them in source order. Nesting depth does not affect panel order.

### 1.5 A tag inside a false `{% if %}` is never registered

**Verified.** HubSpot only creates the field if the tag actually renders. Wrapping a module in
a checkbox (`{% if widget_data.show_hero.value %}{% module ... %}{% endif %}`) means the module
never appears in the Contents panel at all, so the team sees a checkbox that does nothing. This
was a live bug Jared hit.

**A tag inside a TRUE `{% if %}` does register, and keeps its position. Verified 2026-09-11.**
So registration follows whether the tag *rendered*, not whether it was syntactically nested. That
does not relax the rule, because the whole point of a conditional is that it can be false: a
field whose branch happens to be false on the day the team creates the email is a field they
never see. **Keep declarations out of conditionals entirely** — the one arrangement that is safe
regardless of which way the branch goes. v2 enforces this structurally rather than by
convention; see `src/compile/lint.ts`, rule `declaration-inside-conditional`.

Related, same send: a field that is **declared but never printed anywhere** still registers and
still holds its position in the panel. Registration follows declaration, not use.

The correct shape: declare the tag unconditionally with `export_to_template_context=True`, then
put the conditional around **your own markup** that reads the exported values.

```hubl
{% module "hero_image" path="@hubspot/image_email", label="Hero image",
   img={ "src": "", "alt": "", "width": 560 }, export_to_template_context=True %}
{% if widget_data.hero_image.img.src %}
  ...our section markup using {{ widget_data.hero_image.img.src }}...
{% endif %}
```

That gives an optional block: nothing ships until the team picks an image, and the field is
still visible in the editor.

### 1.6 `linked_image` does not give the template its link, but `image_email` does

**Documented and verified by a failed send.** The `linked_image` picker shows a link field, the
team fills it in, and the URL is not available to the template. Hero images rendered without an
anchor in the sent email. Two workarounds:

1. A separate `{% text %}` field labeled "Hero image link (paste the URL here)". Works, but it
   is a second field the team has to find.
2. `{% module path="@hubspot/image_email" %}` with export, reading `widget_data.n.img.src`,
   `.img.alt` and `.link`. This is what v1 ships today and it gives the team HubSpot's own
   image picker with link and alignment.

**Option 2 verified in a live send, 2026-09-11.** The link arrives, as a bare URL string, at the
top level of the exported object:

```
widget_data.probe_a_image.link           = http://switchyards.com   <- the one that works
widget_data.probe_a_image.link.url       = (empty)
widget_data.probe_a_image.link.url.href  = (empty)
widget_data.probe_a_image.img.link       = (empty)
widget_data.probe_a_image.body.link      = http://switchyards.com   <- duplicated, do not use
```

So the image block is one field: HubSpot's own picker, with its link, and the template still
controlling the markup and able to leave the block out until an image is picked. The fallback in
point 1 is not needed, and the `.link.url` shapes guessed at in earlier drafts do not exist.

### 1.6a `image_email` reports the file's natural width, not the one you declared

**Verified 2026-09-11.** The probe declared `img={ "src": "", "alt": "", "width": 400 }`. The
team picked a 1080px GIF, and the export came back:

```
widget_data.probe_a_image.img.width = 1080
```

The declared 400 is gone. A compiler that trusted `img.width` would reproduce v1's shipped bug
exactly — a 1300px upload rendering at 1300px (2.9) — so **the width must always come from the
block's own setting and never from the module.** v2 does this and has a regression test for it.

Separately, HubSpot rewrites the `src` it serves to `...?width=400&upscale=true&name=...`, using
the declared width rather than the reported one. The served file is the right size; only the
exported `width` value is wrong.

### 1.7 Rich text defaults are copied per email, once

**Verified.** When the team creates an email from the template, HubSpot snapshots every
`rich_text` default into that email. Editing the default in the template and re-uploading
changes new emails only. An email created last week keeps the old copy, which is why an old
test send still showed a stale city list.

The consequence for design: anything that must be correct across every future send (city list,
social links, legal note, footer tagline) should **not** be editable. Render it from the
template so a re-upload fixes every new email. v1 locks the footer and legal blocks by default
for exactly this reason and that decision held up.

### 1.8 Required CAN-SPAM variables

**Verified.** HubSpot refuses to publish an email template without these.

```hubl
{{ site_settings.company_name }}
{{ site_settings.company_street_address_1 }}  {{ site_settings.company_street_address_2 }}
{{ site_settings.company_city }}, {{ site_settings.company_state }} {{ site_settings.company_zip }}
{{ unsubscribe_link }}       <!-- manage preferences -->
{{ unsubscribe_link_all }}   <!-- unsubscribe from everything -->
```

Useful trick used in v1's legal block: build a Google Maps URL from the same variables with
`~` concatenation and `|urlencode`, so the address is a link we control rather than one Gmail
invents. See 2.7.

### 1.9 `<style id="hs-inline-css">` is inlined at send

**Verified.** HubSpot takes the rules in a style block carrying that id and inlines them onto
matching elements when the email is sent. This is the only reliable way to style what the team
types into the rich text editor, because Gmail strips embedded styles but keeps inline ones.
v1 puts its whole type scale there, scoped to `.sy-rich`, so the team's headings, lists, quotes,
links and rules all come out on brand.

**How far it reaches, verified 2026-09-11.** Further than v1 assumed: the inliner matches
**every element in the finished document**, not only the rich text regions. A probe put
`.probe-static p { color:#0a8a00 !important }` in the block and a plain `<p style="margin:0">` of
the template's own markup inside `.probe-static`; it came back inlined. So a rule written for the
team's content will also land on the compiler's own markup if the selector happens to match.

Two mechanics that follow from it, both load-bearing:

1. **HubSpot prepends.** The element's own inline style is kept, and the matched declarations are
   inserted *before* it. Our source `style="margin:0"` came back as
   `style="margin-bottom: 1em; color:#0a8a00 !important; font-weight:bold; margin:0"`. Equal
   specificity, later declaration wins — so **the compiler's own inline styles beat the inlined
   ones**, and anything the compiler wants to win over them needs no `!important`. Anything in
   `hs-inline-css` that must beat a block's inline style does.
2. **HubSpot injects a default `margin-bottom: 1em` onto every `<p>`.** That declaration is not in
   our stylesheet; it is HubSpot's own, inlined at send. A `<p>` the compiler emits *without* an
   explicit margin therefore ships with a 1em gap under it in every client — including Gmail,
   where the `p { margin:0 }` reset in the ordinary `<style>` block is stripped and cannot save
   it. **Every `<p>` the compiler emits must carry an explicit margin.** v1 does not do this in
   the legal block, which is a latent spacing bug in what ships today.

### 1.10 HubL syntax notes that bit us

- `|trim` before testing a text value, or whitespace counts as content.
- Single-quoted `value='...'` needs its quotes and newlines escaped when generating.
- `~` concatenates, `|urlencode` for URLs inside links.
- Field names must be unique, slug-safe, and stable. Renaming a field in the template orphans
  whatever the team already typed into the old one.
- Labels are what the team reads. They are the whole UI. Write them like microcopy.
- **But a `{% module %}` may not show its label in the Contents list.** In the 2026-09-11 send the
  image module was listed as a generic "Image" with a module icon, while every `text` and
  `rich_text` field beside it showed the label it was given — even though the module's own exported
  data carried `label=A - Image: pick an image AND set a link on it` correctly. Seen once, in the
  panel tree only; whether the label appears once the module is opened was not checked. Worth
  confirming before the editor promises a designer that their label is what the team will read.
  If it holds, module-backed blocks need their ordering to carry the meaning instead.

### 1.11 HubSpot's own wrapper classes

HubSpot's email shell adds classes such as `hs_padded` and `hse-column-container` that carry
their own padding. v1 had a double-padding bug in the legal footer on phones from stacking our
padding on top of theirs. Either reuse their classes deliberately or neutralize them in a media
query. Do not guess.

**Corrected 2026-09-11, and it changes who to blame.** In a *coded* email template HubSpot
injects **no stylesheet of its own**. The received source of the probe send contains exactly the
two `<style>` blocks the template shipped, plus meta tags — nothing else. `hs_padded` therefore
has no rule at all unless the template writes one, and the padding v1 sees on phones comes from
**v1's own head CSS**, which declares
`@media ...(max-width:639px) { .hs_padded { padding-left:20px !important; padding-right:20px !important } }`.

So the class names are inherited convention, not live styling, and the double-padding bug was
self-inflicted. The practical rule is unchanged — do not stack padding on a `hs_padded` cell —
but the fix lives in our stylesheet, where it can be reasoned about, rather than in HubSpot's.
(The drag-and-drop email editor is a different product and may well inject its own shell; this
finding is about coded templates only.)

### 1.12 Links get rewritten on send

HubSpot appends its own tracking parameters. Store clean URLs; do not pre-append anything.

**Re-verified 2026-09-11.** Every `href` in the send was replaced with an
`https://<id>.na1.hubspotlinks.com/Ctc/...` redirect carrying
`utm_source=hs_email&utm_medium=email&utm_content=N&_hsenc=...`, and every `<a>` gained
`data-hs-link-id` and `data-hs-link-id-v2` attributes. A 1x1 tracking pixel is appended to the
end of `<body>`. None of it needs accommodating — but a validator that diffs a sent email against
the exported template must expect all of it.

### 1.13 Stock modules worth offering

Each is a `{% module path="..." %}` tag that HubSpot renders and the team edits natively.

| Purpose | Path | Confidence |
| --- | --- | --- |
| Rich text body | `@hubspot/email_body` | Documented |
| Image | `@hubspot/image_email` | **Verified in a live send, 2026-09-11** (see 1.6, 1.6a) |
| CTA (tracked HubSpot CTA) | `@hubspot/email_cta` | Documented |
| Header / one-line heading | `@hubspot/email_header` | Documented |
| One line of text | `@hubspot/email_text` | Documented |
| Social sharing | `@hubspot/email_social_sharing` | Documented |
| Subscription preferences | `@hubspot/email_subscriptions` | Documented |
| Simple unsubscribe | `@hubspot/email_simple_subscription` | Documented |
| CAN-SPAM footer | `@hubspot/email_can_spam` | Documented |
| Spacer | `@hubspot/horizontal_spacer` | Documented |
| RSS / blog listing | path varies by account | Unverified, confirm in Design Manager |
| Video | path varies by account | Unverified, confirm in Design Manager |

### 1.14 `rich_text` can export to the template context

**Verified 2026-09-11. v1 never tried this, and it is a capability v1 does not have.**
`{% rich_text "n" ... export_to_template_context=True %}` renders nothing in place and publishes
the team's markup to `widget_data.n.html`, exactly as a `text` field publishes `.value`:

```hubl
{% rich_text "body" label="Body", html='<p>…</p>', export_to_template_context=True %}
{% if widget_data.body.html %}
  ...our own section markup around {{ widget_data.body.html }}...
{% endif %}
```

Two things v1 could not do become possible: a rich text block can be **wrapped in the template's
own markup**, and it can **collapse its whole section when the team empties it** (2.11), which
previously only headings and buttons could.

The exported body also confirms what 3.5 warns about — the team's markup arrives carrying
HubSpot's own inline styles (`<p style="margin-bottom: 1em; ">`), so the sanitiser and the
`!important` on the block's line-height both still earn their place.

Adopting this changes the output, so it is a deliberate break from v1 parity rather than a free
upgrade; see `docs/architecture.md`.

### 1.15 `{{ subject }}` in `<title>` comes through empty

**Verified 2026-09-11.** The probe's `<title>{{ subject }}</title>` arrived as `<title></title>`
in the sent email, with the subject line set. Harmless — no client shows an email's `<title>` —
but do not use `subject` as a value anywhere it matters.

---

### 1.16 Drag and drop areas in a coded email template

**Documented, and unverified in this account.** Added 2026-09-17, when Jared asked whether HubSpot
supports drag and drop and then asked for it. A coded template may mark one region as
`{% dnd_area %}`, and inside it the team adds, removes and rearranges HubSpot modules themselves.
Everything outside the area stays ordinary locked template markup, so the shape is locked
furniture around one free region.

The nesting is area, section, column, module:

```hubl
{% dnd_area "email_body", label="Email body" %}
  {% dnd_section padding={'top':'20', 'bottom':'20'}, full_width=False %}
    {% dnd_column width=12 %}
      {% dnd_module path="@hubspot/email_body", label="Body" %}
      {% end_dnd_module %}
    {% end_dnd_column %}
  {% end_dnd_section %}
{% end_dnd_area %}
```

Four rules, each one a lint rule in `compile/lint.ts` rather than something to remember:

| Rule | Value | Why it bites |
| --- | --- | --- |
| Areas per email template | **1** | HubSpot rejects a second at upload |
| Minimum content width | **624px, not overridable** | The design system ships 600 |
| `dnd_row` | **Not supported in email** | It exists for web pages, so it looks right and is not |
| Subscription | Marketing or Content Hub **Professional+** | Unconfirmed for portal 50604449 |

The width is the real cost. A template holding an area has to be designed at 624px or wider, which
is why `templates/baseline.template.json` carries its own design system at 624 rather than the
system default.

**`{{ dnd_area_stylesheet }}` is required in the head**, and it is the one thing that qualifies the
correction in 1.11. A coded template without an area still gets no CSS from HubSpot; a template
*with* one asks HubSpot for a stylesheet by name, and that sheet carries media queries, Outlook
fixes and margin and padding resets we did not write. It is emitted only when an area is present,
so every other template is untouched. `{{ email_header_includes }}` goes with it, on HubSpot's own
recommendation.

**What does not reach inside the area.** HubSpot renders the modules, so the design system, the
phone rules and all three dark-mode layers stop at the boundary. Nothing inside is in the colour
registry, because there is no colour of ours in there to register. That is a genuine limitation
rather than an oversight, and it is the argument for keeping the area to the body of an email and
leaving the furniture to the template.

**The first argument is an identifier, not a label.** `{% dnd_area "email_body" %}` is what HubSpot
stores the team's arrangement against. Rename it and every email built from the template loses the
layout somebody built — the orphaned-field problem of 1.10, one level up, and worse because it is a
whole region rather than one string. The label is separate and free to reword.

**Still to confirm in a send** (a coded template with an area has never been uploaded from here):

1. Whether this account can publish one at all. HubSpot's own pages disagree: the email-specific
   guide reads as generally available, the drag-and-drop reference page says areas "can't be used
   in blog post and email templates at this time", and a third source calls it beta requiring an
   ungated account.
2. Whether ordinary `{% text %}` and `{% module %}` fields **outside** the area still register, and
   still in document order.
3. What `{{ dnd_area_stylesheet }}` actually injects, and whether it fights the head CSS.

## 2. Email client rendering

### 2.1 Structure

Nested tables, `role="presentation"`, `cellpadding="0" cellspacing="0"`, inline styles on
everything that matters, a 600px content column centered inside a full-width background row.
No flex, no grid, no float, no position, no shorthand backgrounds.

### 2.2 Outlook (Windows, Word engine)

Wrap the container in MSO conditionals so Outlook gets a fixed-width table:

```html
<!--[if gte mso 9]><table ... width="100%" bgcolor="#f7f6f3"><tbody><tr><td valign="top"><![endif]-->
<!--[if (mso)|(IE)]><table align="center" width="600" style="width:600px"><tr><td valign="top" style="width:600px"><![endif]-->
```

**Close every `<tbody>` you open inside a conditional.** An unclosed one was a real bug and it
collapses the layout in Outlook only, so it is invisible until a test send.

Also needed in `<head>`:

```html
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings>
<w:WordDocument><w:DontUseAdvancedTypographyReadingMail/></w:WordDocument></xml>
<style>ul > li { text-indent: -1em; }</style><![endif]-->
```

Page background in Outlook needs VML:

```html
<!--[if gte mso 9]><v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
<v:fill type="tile" size="100%,100%" color="#f7f6f3"/></v:background><![endif]-->
```

Global resets that earn their place: `mso-table-lspace/rspace:0`, `border-collapse:collapse`,
`mso-line-height-rule:exactly` on `p, a, li, td, blockquote`, `-ms-interpolation-mode:bicubic`
on images, `mso-padding-alt` on button cells.

### 2.3 Mobile

Breakpoint used throughout v1: `@media only print, only screen and (max-width:639px)`. The
`only print` prefix is a long-standing trick to reach clients that honor print media.

### 2.4 Full-bleed on phones

Sections carry zero horizontal padding, so the email runs edge to edge. Padding lives on inner
cells instead. Gmail's apps still draw their own inset around every message and no email can
remove it, so the page background color is what shows in that gap. v1 exposes it as a setting
for that reason.

### 2.5 Dark mode needs three layers

No single mechanism works everywhere.

1. `<meta name="color-scheme" content="light">`, `supported-color-schemes`, and a `:root`
   rule. Apple Mail and iOS Mail honor this and leave the email alone.
2. A `@media (prefers-color-scheme: dark)` block that re-asserts every background, text and
   link color the design uses, for clients that apply their own dark styling.
3. `[data-ogsc]` and `[data-ogsb]` selectors with `!important`, which beat the color rewriting
   Outlook's apps and outlook.com perform.

**The layers survive the send intact. Verified 2026-09-11.** This had never been checked — v1's
dark mode was only ever inspected as a local file, which left the whole three-layer mechanism
load-bearing and unproven. The received source carries all of it through byte for byte: the
`@media (prefers-color-scheme: dark)` block, the `[data-ogsb]` and `[data-ogsc]` selectors, and
the `@media only print, only screen and (max-width:639px)` query. HubSpot rewrites links and
appends a tracking pixel; it does not touch the stylesheet.

What is still unverified is whether each client then *honours* them — that needs dark-mode
screenshots from Apple Mail, the Outlook app and Gmail, which the first send did not include.
The mechanism reaching the inbox is the half that was in doubt.

Gmail's apps ignore all three. Nothing fixes that. Design with solid brand colors that still
read acceptably when inverted, and check a Gmail test send every time.

### 2.6 Per-color classes make dark mode generatable

The mechanism that makes layer 2 and 3 automatic: the compiler emits a class per color it
actually uses (`sy-bg-<hash>`, `sy-text-<hash>`, `sy-link-<hash>`) alongside the inline style,
and registers that color. At the end it walks the registry and writes matching
`prefers-color-scheme` and `[data-ogsc]` rules. No color can be used without gaining an
override. **Keep this design in v2.**

### 2.7 Gmail and Apple auto-link addresses and phone numbers

They restyle the result as a blue underlined link. Two defenses, both used in v1:

```css
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important;
  font-size:inherit !important; font-family:inherit !important; font-weight:inherit !important;
  line-height:inherit !important }
```

and wrap the address in your own anchor to Google Maps with an explicit color and
`text-decoration:none`, so there is nothing left for the client to linkify.

### 2.8 Text that must not break

City names were breaking mid-word in the footer. Fix: `white-space:nowrap` on each item, not on
the container. Stacked footer cells overflowed their column until they got
`box-sizing:border-box`, and column tables need `table-layout:fixed`.

### 2.9 Images

- Set `width` as an attribute **and** in the inline style, to the intended display width.
- v1 shipped a bug where the exported width was the image's natural 1300px. Always take the
  width from the block's setting, never from the file.
- For retina, upload at 2x and set the attribute to 1x.
- `img.stretch-on-mobile { height:auto !important; width:100% !important }` under the mobile
  query for anything that should fill the phone width.
- Alt text on every image. Outlook shows it when images are blocked.

### 2.10 Buttons

Bulletproof pattern: a `<td>` with `bgcolor`, `border`, `border-radius`, `mso-padding-alt`, and
a full-width `<a>` inside. Separate desktop and mobile font sizes matter, especially in footer
columns where an 18px label wraps. v1 drops footer buttons to 11px on phones with
`white-space:nowrap`.

### 2.11 Empty content must collapse completely

A blank heading or button should remove its block and its surrounding spacing, not leave a gap.
Do it with the conditional wrapping the whole section, not just the text.

### 2.12 Gmail clips at ~102KB

Show the size live and warn before it matters.

### 2.13 Rich text type scale that worked

Tuned over several rounds of Jared's feedback. Reproduced here because getting back to it from
scratch would take the same rounds.

```
p           margin 0 0 16px;  line-height 150%;  18px
h1          margin 0 0 16px;  line-height 120%;  38px bold
h2          margin 0 0 12px;  line-height 125%;  22px bold
h3          margin 0 0 10px;  line-height 130%;  17px bold
h4          margin 0 0 8px;   line-height 135%;  15px bold
h5          margin 0 0 8px;   line-height 135%;  14px bold uppercase, 0.04em tracking
h6          margin 0 0 8px;   line-height 135%;  12px bold uppercase, 0.06em tracking
ul, ol      margin 0 0 16px 22px; line-height 135%; 18px
li          margin 0 0 4px;   line-height 135%
blockquote  margin 0 0 16px;  padding 4px 0 4px 16px; 3px left rule in brand red; italic; 150%
hr          2px brand red top border, 16px below
a           brand red, underlined
```

Footer rich text is a separate, tighter scale on the navy background, with links bold and not
underlined.

---

## 3. Builder application lessons

These are about the tool, not the email. They are the ones that cost the most iteration.

### 3.1 One render function, two modes

The single best architectural decision in v1. Every block renders through the same function
with a context flag: `preview` substitutes sample content, `hubl` emits `{% ... %}`
declarations and `{{ widget_data... }}` references. The preview is therefore the real compiled
email, not an approximation, and the two can never drift. **Carry this into v2.**

### 3.2 Native `confirm`, `prompt` and `alert` are blocked

In this environment they silently do nothing, which is how "I'm unable to delete blocks"
happened. Build in-page dialogs. Better still, prefer an **undo toast** over a confirmation
dialog for anything reversible. Deleting a block or a design in v1 just happens and offers Undo
for a few seconds. Jared liked this considerably more than being asked.

### 3.3 Do not rebuild the UI on every keystroke

Rebuilding the whole block list while typing in a label stole focus and jumped the scroll
position to the footer. Update the changed node in place and keep component identity stable.
Any v2 framework handles this correctly by default, which is an argument for using one.

### 3.4 The preview must never lose the reader's place

Three separate bugs lived here:

- The iframe never shrank when content got shorter. Measure
  `documentElement.getBoundingClientRect().height`, not `scrollHeight`.
- It collapsed to ~10px mid-update, which reset the scroll. Keep the last good height until the
  new one is measured, and restore `scrollTop` after every re-render.
- A scrollbar appeared inside the desktop preview. Set `scrolling="no"` and size the iframe to
  its content; watch with a `ResizeObserver`.

Editing a footer field must not throw the preview back to the top of the email.

### 3.5 Rich text pasted from anywhere carries styles that override the design

The block's font size, color and line height stopped applying because pasted `<span
style="...">` won. The sanitizer strips all inline styles and reduces markup to an allowlist
(`p br strong em u a ul ol li h1-h4 blockquote`), normalizes non-breaking spaces, and wraps
loose text in paragraphs. Line height still needed `!important` on the per-block rule to beat
HubSpot's own inlining.

### 3.6 Version the saved document from day one

v1 accumulated a `normalizeDesign` migration chain: footers gaining locks, friendly markup
converting to HTML, stripe fields splitting into color and thickness pairs, image blocks gaining
a mode and an optional flag, top bar font sizes changing default. Every one of those would have
broken saved work without a migration. Put a schema version in the document and a migration
function in the first commit.

### 3.7 localStorage per browser is the ceiling v2 exists to break

v1 saves designs in the browser and moves them between people as exported JSON. It works and it
is the main complaint. A shared workspace folder is the point of v2.

### 3.8 Ship a real starter

The builder opens with the actual Switchyards standard email already assembled, not an empty
canvas. It is what makes the tool usable in the first minute, and it doubles as the regression
fixture.

### 3.9 Small UI things that were raised as real problems

- A hidden tooltip still contributes to scroll width. Keep it `display:none` until hover or
  focus, and the page stops scrolling sideways.
- Native `select` chevrons render inconsistently. Replace with a background SVG and
  `appearance:none`, and make sure it flips color on dark controls.
- Header rows need to wrap rather than overflow at narrow widths.
- Every control deserves a one-line explanation on hover. Jared asked for this explicitly.

### 3.10 What the team actually needs to edit

Copy, images, links. Not layout. Fields-only editing in HubSpot was the right call and nothing
in three weeks of use argued against it.

---

### 3.11 A token that is only a type is worse than a literal

**Found building v2, 2026-09-11.** The `DesignSystem` existed from step 1 and was threaded through
every build context. Nothing read it. The compiler carried `ctx.ds` from the entry point to every
block and then wrote `font-family:Helvetica, Arial, sans-serif`, `font-size:38px` and `width:600`
anyway. It looked finished in the type system and was inert in the output.

Two rules came out of it:

- **Wire the compiler before the panel.** A design-system editor built first would have been dials
  connected to nothing, and the failure would have looked like a rendering bug rather than a missing
  one. The order here was: make every literal read a token, prove the defaults are byte-identical
  against the golden file, *then* build the interface.
- **Take the token as a required argument, not a default.** `section(inner, { ds, ... })` rather
  than a module constant means a new call site cannot quietly fall back to Helvetica — TypeScript
  refuses to compile it. That is the only thing keeping "there are no literals left" true a year
  from now.

### 3.12 A preset must name a colour, not repeat it

**Found building v2, 2026-09-11.** The background presets stored resolved hexes:
`cream: { container: '#f7f6f3', link: '#d10000' }`, beside a palette that also said
`red: '#d10000'`. Changing the brand red in the palette moved the button outlines — which read the
palette at compile time — and left every body link on the old colour, because links come from the
section's resolved link colour, which came from the preset's own copy of the hex.

It is the exact failure `plan.md` warns about in one line ("named roles, not raw values") and it is
easy to write by accident, because the duplicate looks like a value rather than a second source of
truth. A preset now stores `link: 'red'` and resolves on read. A literal is still allowed — an
override is sometimes right — but it is shown as a literal in the panel, so leaving the system is
visible rather than silent.

There is a second half to it: **sections store colours resolved, so moving a token has to walk the
document.** Nothing in the canvas moves otherwise. Only sections that still name a preset are
re-resolved, which makes clearing the name the detach mechanism.

### 3.13 A preview in an iframe swallows the app's keyboard shortcuts

**Found building v2, 2026-09-11.** Click a block on the canvas, then press Cmd+Z. Nothing happens.

The canvas is an `<iframe>`, which is a separate document with its own event path, so the keydown
reaches the frame and stops there — the app's listener is on the parent window and never hears it.
It looks like undo is broken, and it looks that way at exactly the moment it is most wanted: right
after the click that changed something.

The fix is to forward the event from the frame rather than to handle it there, so there is still one
keyboard policy and it lives in one place. Narrowly, too — re-dispatching every modified keystroke
out of a sandboxed document is a much larger promise than undo needs. And only when the user is not
mid-edit in a `contenteditable`, where the browser's own text undo should win.

Worth checking for any shortcut the app adds from here on, because nothing about the symptom points
at the iframe.

### 3.14 Columns in email are a table, not a grid

**Decided building v2, 2026-09-11.** The single-column path uses HubSpot's `hse-column` div grid,
which survives Outlook only because an MSO conditional rebuilds it as a table — two layouts that
have to agree, and the one nobody can see is the one that breaks.

A row of columns is therefore a real `<table>` with one `<td>` each, and stacking on phones is a
media query turning those cells into blocks. Same markup in every client, no conditional, and it is
already how this project's two-column footer works.

The consequence worth writing down: **every field declaration in the row has to be hoisted out of
the table.** A declaration inside a cell is a declaration inside the conditional that collapses an
empty block, and a tag inside a false `{% if %}` never registers (learnings 1.5) — so the field
would disappear from the Contents panel the moment somebody cleared it. Hoisted to the front of the
row they still appear in document order, so the panel reads left to right and then down, which is
the order the email is read in.

One thing deliberately not built: `stack-reverse`. Reversing on a phone means emitting the columns
backwards and restoring the order on desktop with `direction:rtl`, and Word's engine does not honour
that on a table row — so the one client nobody can check would silently render it the wrong way
round. Swapping the two columns in the editor does the same job and is visible while you do it.

### 3.15 Put the actions on the thing, not in a panel about the thing

**Reported by Jared, 2026-09-11.** "I don't know how to delete a block once I put it in a column
setup." He was right, and it was not a discoverability problem — there was no delete. The only
delete in the app removed a whole *section*, the outline drew its actions on the section row, and
the blocks nested underneath had none at all. Splitting a row into columns made its contents
unreachable.

Three things were wrong at once, and they are worth separating because only one of them is a bug:

1. **A missing operation.** `removeSection` existed; `removeBlock` did not. Nothing in the interface
   could have covered for that.
2. **Actions living at the wrong level.** They sat on the container because that is the level the
   outline happened to render. Every row now carries its own, so there is nowhere they are missing.
3. **Actions living in the wrong place entirely.** Even when they exist in a side panel, a designer
   who has just clicked something on the canvas is looking at the canvas. The selected block now
   carries a small bar — name, move, duplicate, delete — attached to itself. It is the single change
   that made the rest findable.

The general rule: **an interface that requires knowing which panel owns an operation has already
failed.** Put the operation on the object.

### 3.16 A tree should show nesting that exists, and no other kind

The same report, second half: the outline rendered a section as its *first* block with the
remaining blocks nested underneath. That reads as "one block with children", which is not what a
section is and not what a two-column row is either.

The fix has two halves, and the second one is the interesting one:

- Columns are drawn as columns, with their share of the width and their own blocks under them.
- **Dropping a block next to a block in a single-column row creates a new section, not a second
  block in that row's column.** The two render identically — a single-column row draws each of its
  blocks in a band of its own — so the easy implementation was invisible on the canvas and grew a
  level of nesting in the outline that corresponded to nothing. One block per section stays true
  until somebody actually asks for columns.

### 3.17 Pointer capture is what makes dragging over an iframe work

Dragging a block from the palette onto the canvas crosses into the preview iframe, and an iframe
swallows every `pointermove` the moment the pointer is over it — so the editor stops hearing the
drag exactly when it starts to matter. The usual workaround is an invisible overlay across the
frame during the drag.

`setPointerCapture` on the thing being dragged is better and is one line: events keep arriving in
the editor's document, with viewport coordinates, and converting them to frame coordinates is a
`getBoundingClientRect` away. `elementFromPoint` on the frame's own document then answers what is
underneath. No overlay, nothing to remember to tear down.

The drop indicator is drawn in the editor's document too, positioned over the frame, rather than
injected into the email. That keeps the preview from being reloaded to draw a line — the reader's
place is the thing learnings 3.4 exists to protect — and means nothing about the drag can reach an
exported template.

### 3.18 Paste is the whole reason inline rich text is hard

`contentEditable` on a rich text block always worked. What broke was paste, and it was excluded
from inline editing for two rounds because of it. Content copied from Word, Google Docs, a web page
or another email arrives carrying its own inline styles — `font-family: Calibri`, `font-size: 11pt`,
`line-height: 107%`, `color: #1F1F1F`, `class="MsoNormal"`, `mso-*` everything — and an inline style
beats the block's own size, colour and line height (learnings 3.5). v1 shipped without a sanitiser
and it cost a round of feedback: paste a paragraph from a doc and the email quietly stops being the
design.

**`src/app/sanitise.ts` is that sanitiser**, and three decisions in it are the difference between
working and nearly working:

- **An allowlist, not a blocklist.** A blocklist is a promise to have thought of everything, and the
  next version of Word will have something new. Anything unrecognised is *unwrapped* — its children
  kept, its tag dropped — so pasting always produces readable text rather than nothing.
- **Recover the meaning before dropping the tag.** Word and Docs both express bold and italic as
  styled spans. Stripping the span without reading it loses the bold, which reads to a designer as
  the tool eating their formatting.
- **`href` is the only attribute that survives, and only for schemes a mail client follows.**
  `javascript:` and `data:` in a template that lands in someone's inbox are not links.

**The bug worth remembering**, found on a real paste in the running app rather than by a test: a
`<span style="font-weight:700">` is *read* as a span and *written* as a `<strong>`, and the open
element stack was tracking only what was written. The matching `</span>` then found nothing to
close, and the bold ran to the end of the paragraph. Any converting sanitiser needs both names on
the stack — what came in, and what went out.

### 3.19 A drag needs something in your hand

A drop indicator tells you where a thing would land. It does not tell you that you are carrying
anything, and without that a drag reads as an elaborate hover state — you find yourself checking
whether the press registered.

Three cheap pieces, and all three matter:

- **A ghost** that follows the pointer with the block's name on it. It is the piece that says "this
  is in your hand".
- **The source dims** and takes a dashed border, so the place it came from reads as a slot rather
  than as a button you could press again.
- **The indicator slides** between candidate positions instead of jumping, over about 130ms. Long
  enough to read as motion, short enough never to lag behind the pointer.

In a list that is a real DOM — the layer tree — go further and open a real gap, so the rows below
move out of the way. On the canvas that would mean injecting into the compiled email and reloading
the frame, which costs the reader's scroll position (learnings 3.4), so there the line plus the
ghost is where it stops.

### 3.20 Structure is something you drop, not something you do to a block

**Reported by Jared, 2026-09-11.** Columns were a panel on every block: select a heading, open
Columns, choose 2, and the row that heading happened to sit in split. He called it confusing, and
the reason is precise — it asks a designer to know that a block they can *see* sits inside a row
they *cannot*, and then to edit the invisible one through the visible one.

Columns are dropped from the palette now: an empty two-column row, with each column drawn as a
labelled slot on the canvas, and blocks dropped into it. Same structure, arrived at from the other
end, with every step on screen.

Three things that fall out of it and are worth knowing:

- **The palette is not a list of block types any more.** `columns` is a palette entry that maps to a
  structural operation, not to a `Block` — and it must not become one. A Block is a leaf; a row of
  columns is structure. The model refusing to nest them is what stops columns-inside-columns, which
  in a table-based email is a shape nobody can debug.
- **An empty column needs to be visible**, or there is nothing to aim at and no sign the thing you
  dropped exists. It draws a dashed slot, editor-only, under the same `annotate` flag as
  `data-sy-block` — so it can never reach an exported template.
- **An emptied row of columns must survive.** The sweep that deletes sections with nothing in them
  is right for a single-column section (debris) and wrong for a multi-column one (a layout somebody
  placed on purpose). Deleting the last block out of columns should leave the columns standing.

### 3.21 Explanations belong on hover

**Jared, 2026-09-11:** "remember tooltips instead of putting descriptions in this editor to keep it
less cluttered."

Most panels carried a paragraph under the header explaining what the group was for. Each one is read
once and then costs vertical space on every visit, pushing the controls it explains further down a
pane that is already short. The copy is still wanted — it is the difference between guessing what
"Optional in HubSpot" means and knowing — so it moved to the `title` of the control or the header it
belongs to rather than being deleted.

What stays visible: one short orienting line where a pane changes context, and any text that is a
*contract* rather than an explanation. The field name under a HubSpot lock stays on screen because
existing emails are bound to it; *why* it cannot be renamed moved to the hover.

### 3.22 "Email width" has to mean the email, furniture included

**Reported by Jared, 2026-09-11**, with a line drawn down a screenshot: at 320px the content column
narrowed and the navy top bar, the red stripes and every section background carried on to the edge
of the window. The setting was called Email width and it set the width of the text.

The cause is that `.hse-section` — the band — had no width at all. It was `width: auto` inside a
full-width wrapper, which is v1's shape and is *correct* for a 600px email in a 700px message area:
the band fills the message, the content sits at 600. It stops being correct the moment the email is
deliberately narrower than the space it is shown in.

**`max-width` is the fix, and it is the right one because it bounds without forcing.** A 600px email
on a 375px phone still fills the phone, so the full bleed that learnings 2.4 exists to protect
survives untouched. What it stops is a 320px email whose navy bar runs across a 900px window.

Two consequences worth recording:

- **Outlook's band is a separate conditional table** and had to be bounded the same way, or the one
  client nobody can check would be the one that ignored the width.
- **It was the last thing the parity flag existed for.** Within the hour Jared retired the
  constraint outright (3.24), so there is no unbounded mode any more. The cost in an ordinary export
  is about 400 bytes across a dozen sections.

### 3.23 The gutter is one decision, not sixteen

Horizontal padding was a number on every Column — `padLeft: 20, padRight: 20`, sixteen times in a
template, each set at import and independently editable. That is not a design: it is sixteen chances
to disagree, and no way to answer "make the copy narrower" without visiting all of them.

`pagePadding` is a token, and `paddingOf` reads it for both sides while the column keeps only its
vertical padding — which genuinely is a decision about that block. Together with the width it is
what sets the *measure*, the line length the copy actually gets, which is the thing a designer is
really adjusting when they reach for either one.

The part that is easy to miss: **the phone rules restate the gutter**, both in `.hs_padded` and in
the footer's stacking rule. Leaving those at a literal 20 means a 48px page padding silently drops
back to 20 on a phone — which is where most of these are read. A token that only reaches the
desktop styles is worse than no token, because it looks like it worked.

### 3.24 A compatibility gate has a shelf life, and you should know when it ends

**Jared, 2026-09-11:** "I want to depart from V1 of the builder. as long as the hubspot integration
and handoff stays correct."

The v1 golden file was the right gate for the first four steps. A completely new data model and a
completely new compiler had to prove they could reproduce a template the business actually sends,
and it caught four real mistakes doing it. Nothing here argues against having built it.

But by this point it had started protecting the wrong thing. Every one of these was held back by
"it would break the byte diff", and not one of them is a judgement call:

| Held back | What it actually was |
| --- | --- |
| Heading line height | A flat 125% in the markup against a per-level scale in the stylesheet, so an `<h1>` the template rendered and an `<h1>` the team typed were set differently |
| Button collapse | One block collapsing its padded cell while every other block collapsed its section, for no reason anyone could state |
| `#FFFFFF` | Uppercase in one declaration and lowercase two lines below it, for the same colour |
| `font-family:Helvetica,Arial` | The comma spacing dropped in exactly one place in the codebase |
| Every button literal | `25px`, `12px 18px`, `16`, `2px` — none of them reachable by a designer |

**The distinction that made retiring it safe is between shape and contract.** v1's markup is shape:
nobody outside the compiler depends on it. What HubSpot depends on is the contract — which fields
exist, what they are named, what the team reads, the order the Contents panel lists them in, the
tags that must not sit inside a conditional, the variables Design Manager refuses to publish
without. That was buried inside a test whose headline assertion was a byte diff.

So the gate split rather than disappeared:

- **`tests/hubspot-contract.test.ts`** is the gate now, and it asserts the contract against what the
  compiler *actually emits* — not against a compatibility mode, which is where it used to live and
  is the part that was genuinely wrong.
- **`tests/v1-import.test.ts`** keeps the import fidelity, because a v1 design still has to arrive
  with every field name intact.
- **`blocks.test.ts`** catches markup regressions, against v2's own output, which is the thing worth
  guarding.
- The `v1Parity` flag is gone, and with it three branches in the compiler.

The lesson is not "delete your gates". It is that a compatibility gate is scaffolding with a
shelf life, and the moment to notice is when you start writing "this is what v1 did" as the
justification for something you would otherwise fix.

### 3.25 A style on a block is a value with no name

**Jared, 2026-09-11:** "appearance options should be limited to alignment, since size, line height,
color should be chosen in the design panel."

Every text block carried its own `size`, `mobileSize`, `lineHeight` and `color`. The standard email
alone held sixteen of them, and two rich text blocks sitting one above the other had line heights of
140% and 150% — not because anyone decided that, but because nobody could see both numbers at once.

It is the same failure as a preset storing `#d10000` beside a palette that already said `red`
(3.12), one level down. **A number on a block has no name, is invisible from anywhere except that
block, and cannot be reasoned about across a template.** Sixteen of them is not a type scale; it is
sixteen chances to drift.

The line that made this easy to divide:

- **What a block *is*** stays on the block — a heading's level, a button's variant. Those genuinely
  differ block to block and they name a role rather than a value.
- **Where a block *sits*** stays on the block — alignment, spacing, which column.
- **How it *looks*** is a role in the design system, set once.

Three things fell out of it that were not the point but are worth having:

- **A rich text block now contributes no per-block CSS at all** beyond its link colour, because
  `.sy-rich` already carries the body role. That was four rules per block; the standard email lost
  about 400 bytes, which paid for the `max-width` from 3.22 exactly.
- **The link rule is keyed by colour rather than by block**, so every block on the same background
  shares one.
- **The button's phone size became a token instead of disappearing.** A long label wrapping on a
  phone is real (2.10) — it just is not a per-block decision, it is a decision about that button
  variant.

The one number that stayed on a block is an image's width, and the test is the same: there is no
role it could belong to, because every image is a different shape.

### 3.26 A panel that edits phone values should be showing you a phone

The design panel had a Size dial and an "On phones" dial side by side, and the canvas beside them
was always a desktop. So half the controls tuned a number nobody could see, and the only way to
check was to leave the panel, switch the canvas, and come back having forgotten what you changed.

One switch now drives both: which value a dial edits, *and* what the canvas is showing. The specimen
follows it too — showing the desktop scale while the dial edits the phone one is the same failure
one level down.

It also halves the dial count, which was the thing that made the panel feel long. That was not the
reason for doing it, but it is the usual shape of this kind of fix: a control that exists because
two things were never connected.

### 3.27 Renaming a token is an operation, not a text edit

A palette entry is referenced by name from three places — background presets, type roles and button
variants. Letting somebody rename `red` to `brand` means rewriting all three in the same commit.

**What makes it worth being careful about is how it fails.** `colorOf` returns null for a name
nothing defines, and a null band is a legitimate value meaning "let what is behind show through".
So a preset left pointing at the old name does not error and does not warn — the section quietly
loses its background, and it looks like a rendering bug somewhere else entirely.

The same reasoning makes deletion refuse rather than cascade: a colour that three things name cannot
be removed, and the tooltip says which three. Cascading would mean choosing a replacement on the
designer's behalf, and there is no right answer to choose.

### 3.28 Read the value off the element, not out of state

The colour rename committed nothing the first time. The blur handler closed over the `label` from
its own render, and a blur arriving before the re-render that the keystroke scheduled committed the
*previous* value — which was the unchanged one, so it looked like the feature did not exist.

Exactly the bug that dropped the first pixels of every scrub (3.x, `Scrub`/`Dial`), in a different
costume. The fix is not to reach for a ref: it is to notice that a controlled input already holds
the value, and that state was only ever driving what is on screen. `onBlur={(e) => commit(e.target.value)}`
has no closure to go stale.

Worth checking anywhere a handler reads state that a *different* handler on the same element writes.

### 3.29 A colour that only exists in a stylesheet is a colour nobody registered

**Reported by Jared, 2026-09-11:** "If I change the type's color I do not see it change."

It worked in a light client and silently reverted in a dark one, which is the worst version of the
bug — the designer sets a colour, sees nothing, and has no way to tell whether the control is broken
or they are.

The force-light layer re-asserts every colour the design used with `!important`, across every
descendant: `.sy-text-011272, .sy-text-011272 p, .sy-text-011272 h1, … { color:#011272 !important }`.
That is exactly what it is for — it is what stops a dark client rewriting the email. And a type
role's colour lives in a *stylesheet rule* (`.sy-rich h1 { color:#d10000 }`) rather than on an
element, so it never reached the registry, so the dark layer had nothing for it and the section
colour won.

**This is learnings 2.6 restated as a failure.** The registry exists so the dark layers are a
function of what the design actually used rather than of what somebody remembered to register — and
the guarantee only holds for colours that arrive through the tree. A colour introduced by a CSS rule
walks around it.

The fix emits the role colour into the dark layers too, after the section colours, at a specificity
that ties — so source order settles it. Two selectors per role, because they are two different
elements: `.sy-rich h1` is an `<h1>` the team typed in HubSpot's editor, and `h1.sy-h1` is a Heading
block. Element-plus-class on the second, or it loses to `.sy-text-x h1` by one notch.

**What to check for next time:** anything that puts a colour into the output without putting it on a
node. `dark-mode-coverage` in the linter cannot see this class of bug — it asks whether every colour
has a rule, and this colour had one; it lost.

### 3.30 A token nothing can be seen to reference is not a token

Same report, second half: only one of the two reds could be deleted from the palette. It was the
*wrong* one — `redBright` is what three stripe blocks are painted in, and the palette offered to
remove it while every colour that was genuinely safe to delete was refused.

Stripes held a literal hex. Every other colour in the system is a name — presets, type roles, button
variants — and that is what makes "what uses this?" answerable at all. One block type opting out
meant the palette's usage count was quietly wrong, in the direction that loses work.

Three consequences, and the second is the one worth remembering:

- Stripes name a palette colour now, with a migration that maps a matching hex onto its name and
  leaves an unmatched one as a literal override.
- **Deleting is a replace, not a refusal.** This took two goes and the first one was worse — see
  3.31.
- The stripe colour picker reads the palette instead of a hard-coded five, so a colour somebody adds
  is immediately usable.

### 3.31 Refusing an action is not the same as supporting it

The first fix for "why can I only delete one colour" showed a count badge on each swatch: here is
how many things use this, which is why the ✕ is disabled. Jared's next message was that the panel
still let him delete nothing and he had no idea what the numbers meant.

Both halves were right, and they are the same mistake made twice.

- **A button that never works is worse than no button.** In a palette anybody would actually use,
  every colour is referenced by something. Refusing until nothing references it means the action is
  permanently unavailable, and the interface is offering something it will never do.
- **Visible is not legible.** A bare `4` beside `#d10000` reads as part of the hex. Making the
  reason available on hover is the same failure the tooltip was supposed to fix, one step along.

The shape that works is to answer the question the action implies. **Deleting a token that things
reference *is* a replace** — there is no version of it that leaves the references alone and still
makes sense. So the ✕ always works: nothing uses it, it goes; something uses it, you are asked what
to point those at, and told exactly what they are at the moment you need to know.

The count went away entirely. It now appears in one place — the sentence asking the question — where
it is a fact somebody needs rather than a decoration.

### 3.32 `ds.colors['red']` looks like using the design system and is not

Three bugs in one afternoon had this shape, and the third was found by a test written for the second.

A palette entry referenced **by key** pins the output to a *name*. Rename that entry and the output
stays on the old literal; remove it — which is the same walk — and the output keeps a colour the
palette no longer has, while everything that referenced it properly moves. `head.ts` did it three
times for the rich-text link, the quote bar and the horizontal rule, with a literal fallback that
made the failure invisible.

The distinction that matters: **a preset is itself a set of references**, so `theme(ds, 'cream').link`
follows the palette all the way down, and `ds.colors['red']` stops at the first hop.

There is a test now — `purity.test.ts` greps the compiler for `.colors[`. It failed on its own
explanatory comment the first time, which is the trap the browser-global patterns in that same file
were already written around: match code, skip prose.

### 3.33 A fixture written by hand is correct for one day

The baseline template — one email holding every block, every style and every edge case — is built by
a program (`tools/make-baseline.ts`) rather than written as JSON, and the reason is not convenience.

A fixture typed out by hand is correct on the day it is written and silently wrong from the first
model change after. Fields drift, enums stop matching, a block gains a property and nothing
complains, because JSON has no opinion about any of it. Built from the model's own types, a block
that changes shape breaks the build there instead of producing a file that no longer loads.

The other half is `tests/baseline.test.ts`, which asserts the *coverage* a type system cannot see:
every block type present, every heading level, a nested list, all three presets, both button
variants, every column arrangement, a column that hides on a phone, an image that can genuinely be
absent. A baseline that quietly stops containing a block type is worse than no baseline, because it
is still called one and still gets sent.

**It paid for itself on the first compile,** which is the part worth recording: seven
`paragraph-margin` errors, in a shape the standard email could never have shown. Markup pasted into
a *locked* rich text block renders straight into the output, and nothing was giving those paragraphs
the margin HubSpot would otherwise inject over (learnings 1.9). Every rich text block in the
standard email is editable, so its markup becomes a *field default* instead — and a default is
re-serialised by HubSpot's own editor, where the inlined `.sy-rich p` rule covers it. One fixture
with one locked rich text block would have caught this months earlier.

And the fix had a second half the contract test caught immediately: applying the margins to field
defaults as well changed what the team's emails start with, which is part of the handoff. Rendered
markup is the compiler's to get right; a default is not.

### 3.34 Every list of names in the interface is a hard-coded list until proven otherwise

Making background presets editable turned up the fourth instance of the same bug in two days, and by
now it is worth stating as a rule rather than as a story.

**Anything offering a choice between named things must read those names from the document, not from
the shipped defaults.** The block inspector's Background picker was built from
`DEFAULT_DESIGN_SYSTEM.themes` at module load, so a preset added in the design panel never appeared
in it and one renamed there broke it silently. Identical in shape to the stripe colour picker (a
hard-coded five), the palette panel (a hard-coded five), and `ds.colors['red']` in the compiler.

The tell is always the same: a list written next to the code that renders it rather than derived
from the thing it describes. It reads as tidy, and it is a copy.

Two smaller consequences worth keeping:

- **The fallback has to follow too.** `theme(ds, name)` fell back to a preset called `cream`, which
  was fine until a preset could be renamed. It falls back to the *first* preset now — a fallback
  naming a key that may not exist is the same bug wearing a different hat.
- **A section naming a missing preset is shown, not corrected.** It keeps the four colours it last
  resolved, so it renders correctly and is simply outside the system. The picker says `(missing)`
  rather than silently reassigning it to something nobody chose.

### 3.35 A tree row has to be recognised before it can be read

**Jared, 2026-09-11:** "I find the layers panel hard to read / understand the structure of."

Every row led with its type spelled out — `TOP BAR`, `LEGAL FOOTER`, `IMAGE` — in a mono column
beside the name. Two columns of text at similar weight. Nothing about a row could be taken in at a
glance, so a column of twelve had no silhouette: finding the button meant reading twelve rows.

Three changes, and they are the same change at three scales:

- **A glyph instead of the word.** An icon is recognised; a word is read. The words did not go
  anywhere — they moved to the hover, which is where a label belongs once its shape is doing the
  work.
- **A rail for depth.** A block inside a column looked exactly like a block inside a section.
  Indentation alone reads as an accident; a hairline down the left of a nested list reads as chosen.
- **Weight for the difference between structure and content.** A row of columns is a container, and
  the thing anybody is hunting for is inside it — so structure went quieter and wider-tracked, and
  content kept the weight.

The general form: **hierarchy is what a reader can skip.** A list where every row is equally loud is
a list that has to be read in full, and that is true however good the labels are.

### 3.36 A feature that can produce a broken send has to ship with the rule that catches it

The Assets panel lists images from the workspace folder and writes the **file name** into the block.
That is not a URL an email client can fetch, which makes it a fine way to design and a terrible
thing to send.

So it shipped as two halves that only work together:

- The canvas substitutes a blob URL, so a designer sees the real picture at the real size. It
  happens on the compiled preview string, next to the dark-mode simulation, and never inside the
  compiler — which stays pure and has never heard of a blob.
- `local-image` is an **error**, so Checks refuses the export until a hosted URL replaces the name.

Either half alone is a trap. Substitution without the rule ships a template that looks finished and
arrives with every image broken. The rule without substitution means designing against grey boxes,
which is what the folder was supposed to fix.

Worth generalising: **any convenience that makes a bad state easy to reach owes you the check that
makes it hard to keep.** The preview is allowed to be more forgiving than the export precisely
because the export is guarded.

### 3.37 Sort panels by what they are *about*, not by how often they are used

The design system lived in the right pane, where it replaced the inspector. Which meant: open
Design to change the H1 size, and the heading you were changing it for disappears from the panel
you were reading. The one thing the panel exists to demonstrate — change a global, watch everything
move — was the one thing you could not watch.

Jared asked it as a question, "maybe the design panel should live in the rail and be on the left?",
and the answer is yes, for a reason worth keeping:

- The **left** rail is *global*: things that are true of the whole template, that you browse.
  Blocks, Files, Layers, Assets, and now Design.
- The **right** pane is *contextual*: what is selected, and nothing else.

Sorted that way, the two never compete, and the pane that used to be shared is now the selection's
alone. A panel that hides its own subject is the symptom; the cause is sorting panels by traffic —
"Design is used a lot, put it in the big pane" — rather than by what they are about.

Two details that came out of the move and generalise:

- **The pane follows the panel, not the other way round.** Design's dials were drawn for a 320px
  body; the four list panels are happier narrow. So the left pane widens to 380px for Design alone
  rather than every panel inheriting the widest one's width.
- **Set apart is not the same as far away.** Design went to the foot of the rail first — the
  settings-at-the-bottom idiom, and on a tall window that is four hundred pixels below Assets, in
  the corner. The first thing Jared said about it was to add a design button to the rail. It *was*
  in the rail. Distance past a point stops reading as "a different kind of thing" and starts
  reading as "not here", and the fix was a 22px rule and 9px of space with the button back where
  the eye already is.

### 3.38 The same object should carry the same mark everywhere it appears

The palette was nine cards of plain text, the ghost you dragged was a word, and the layer row it
became had a glyph. Three representations of one thing with nothing in common but the name.

They all draw `glyphFor(kind)` now — the card, the ghost, the row. The repetition is the point: it
is what makes picking a thing up, carrying it and dropping it read as *one object moving* rather
than as three unrelated pieces of interface agreeing about a label.

It also forced a fix that was overdue. The rail's Blocks and Layers icons were both a stack of
cubes with a different number of lines under them — at 15px, the same picture. Blocks is four parts
laid out now. **Two glyphs that differ only in a detail are one glyph**, and a set is only as
legible as its closest pair.

### 3.39 A control in two places is a control whose state has to agree in two places

The top bar had an **Open folder…** button and a **Design** button, both from before the rail
existed. Once Files and Design became rail destinations, each of them was two controls for one
thing — and the duplicate was never just a duplicate:

- The folder button's *label* was the open folder's name, and so was the Files panel's heading. Two
  places rendering the same fact, either of which could be the stale one.
- The Design button needed an `on` state that meant "the left pane is showing Design", which is a
  fact about a pane in another component.

Both are gone, and what is left in the top bar is only what is true of the **export** — how big it
is, whether it passes, and writing it. The rule generalises past this app: when you add a home for
a kind of work, delete the old door rather than leaving it as a shortcut. A second entrance is not
free — it is a second copy of the state that says whether the room is occupied.

The one thing that has to move with the door is everything the old control *also* did. The top-bar
button had a second form for browsers with no folder picker, offering a plain file input; that is
now the Files panel's empty state, and a "Open another folder…" foot on the panel replaces the
affordance the top bar quietly provided for switching folders.

### 3.40 A token that is off should emit nothing, not zero

The page gained a frame and a margin. Both default to off, and the interesting decision was what
"off" compiles to.

The easy version emits `border:0px solid #011272` and `padding:0px` always, and lets the numbers
mean nothing until somebody changes them. It is simpler code — no branch — and it would have cost
the project its strongest guarantee: the golden file proves the compiler still produces v1's bytes,
and a template that gains a wrapper div, or even one extra semicolon on a table cell, no longer
proves anything. (That semicolon was real. The first version wrote `word-break:break-word;` with an
empty margin after it, and every test still passed, because no test compares that byte — the golden
file does.)

So both emit *nothing at all* when they are off: no div, no conditional, no declaration. The rule:
**a feature that is off should be indistinguishable in the output from a build that does not have
it.** That is what keeps a parity test meaningful as features accumulate, and it is the difference
between "we added a frame" and "we changed every email anyone has ever exported".

### 3.41 A wrapper cannot be narrower than the `!important` it wraps

The page frame shipped with `box-sizing:border-box`, so that "email width" would keep meaning the
outside edge and turning the border up would frame the email rather than widen it. Defensible, and
wrong. Jared drew an arrow at the right-hand side: three sides of the frame were there and the
fourth was not.

The head has carried this rule since v1, and it is not negotiable — it is what makes the column the
email's width in Outlook.com and Gmail's desktop web:

```css
@media (min-width:...) { .hse-section .hse-size-12 { width:600px !important } }
```

`border-box` put that 600px column inside a content box of 600 − 2 × border. The content did not
reflow, because `!important` means what it says; it overflowed, and the overflow painted straight
over the right-hand border. Left, top and bottom survived because overflow goes one way.

Two things to keep:

- **Check what you are wrapping before choosing a box model.** The declaration that broke this was
  four lines up in the same file, emitted by the same function, and I did not read it.
- **A test asserting the markup is not a test asserting the result.** The first version had six
  tests. Every one passed. They checked that the div said `box-sizing:border-box` — which it did.
  Nothing measured a box. The test that replaced them names the `!important` rule that has to fit,
  and the browser check measured the frame's content box against the column's width.

Three sides of a frame is a good example of a class of bug worth naming: the failure is *visible*
but not in the half of the output anybody screenshots. A 600px email in a 1280px canvas has its
right edge at the far side of the preview, which is exactly where a screenshot gets cropped.

### 3.42 A global is only a global while everything still follows it

Blocks gained their own left and right padding. The obvious implementation was already sitting
there: `Column.padLeft` and `Column.padRight` had existed since the v1 import, set to 20 by every
constructor — and read by nobody. The compiler took both sides from `pagePadding`.

Making them authoritative would have been a one-line change and a silent disaster. Every saved
document carries `padLeft: 20`, so the moment the compiler started reading it, every block in every
template would have been holding its own 20 — and Design › Page padding, the global whose entire
job is to move all of them at once, would have moved nothing. The email would look identical and
the dial would be dead.

So schema 6 **strips** both fields. Absent means "follow the page", which is what those documents
had always actually done; a column that wants its own gets one by being given one. Two rules:

- **A value nobody reads is not a default, it is a rumour.** It has never been tested, nothing has
  ever depended on it, and it is almost certainly wrong — `padRight: 0` on the legal footer, which
  the footer's own renderer had hard-coded separately.
- **When a local override is added to a global, the migration is the feature.** The code that
  reads the override is the easy half. The half that decides what every existing document means is
  where the global lives or dies.

The override itself is one row in the inspector, not three: a dial showing the inherited number
until you drag it, and a chain button to hand it back. A checkbox plus a dial plus a label would
have been more interface than the decision deserves, sitting there looking complicated for every
block that never departs from the page.

And the phone rule had to move with it — `@media phone { .hs_padded { padding-left:<gutter>px
!important } }` is HubSpot's own class and not droppable (learnings 1.11), so a departing block
gets a `sy-pad-<left>-<right>` class emitted into the later phone block: same specificity, later in
the sheet, so it wins. Without it, the one block asked to run edge to edge would be inset by 20px
on every phone in the world, which is where the email is read. That is learnings 3.41 twice in two
days — **before adding a rule, read the `!important` already pointing at the same property.**

### 3.43 Never clamp a field while it is being typed into

The dial lets you click the number and type one. It was a controlled input showing the committed
value, clamping on every keystroke. Jared typed `100` into a line height that allows 90–220 and
got **220%**:

| keystroke | field holds | clamped to | field rewritten to |
|---|---|---|---|
| `1` | `1` | 90 (the floor) | `90` |
| `0` | `900` | 220 (the ceiling) | `220` |
| `0` | `2200` | 220 | `220` |

Every step was individually correct. The result was a number the user never typed and could not
have predicted — and it looks like a rounding bug, which is the worst place to start looking.

**A half-typed number is not a number yet.** The field now holds the text you are typing, and the
value commits on blur or Enter. The canvas still follows along live, but only once what has been
typed is *already* legal — half-typed `1` on its way to `100` simply waits, so nothing is ever
rewritten under the cursor. Escape reverts.

Two things came out of it:

- **Clamp at the boundary, not in the stream.** The same applies to any field where partial input
  is a valid prefix of a legal value: dates, currency, anything with a minimum.
- **Typed values are clamped but not snapped.** A scrub is for finding a number and the keyboard is
  for knowing one, so a typed 103 stays 103 even where dragging moves in fives. Arrow keys *do*
  snap, because a value that arrived off the grid should step back onto it rather than carry its
  offset forever.

Worth naming the gap: nothing in 408 tests could have caught this, and nothing added since can.
The compiler and the model are tested to death because they are pure; the editor's event flow has
no harness at all. That is a real hole, and the fix is a DOM test environment rather than another
compiler test.

### 3.44 The control that is looked at most should be the one with the fewest words

Desktop and Phone were two named buttons at the head of a row of named buttons. They became two
glyphs — a screen and a handset — with the names on the hover and in the accessible label.

The reasoning is not "icons are tidier", which is usually wrong. It is that this particular pair
is the most-used control in the app, sits at the start of a row where everything else needs its
word, and has the two most recognisable shapes in the whole icon set. The row now reads as *two
glyphs, then the named things*, which is a hierarchy rather than a queue.

The third glyph beside them, Inbox, is the one that earns the most: it puts the email inside a
message — sender, subject, timestamp — and draws the gutter a mail app puts around every message.
That gutter is the thing no email can remove (learnings 2.4) and the entire reason the page
background is a setting. Before this there was nowhere in the app you could see it on a desktop.

### 3.45 Count the pixels, do not look at the picture

Text can now be rendered as a picture of itself — a real request, for a real reason: Word's engine
rounds line heights to whole points, ignores `letter-spacing` outright and substitutes fonts it
does not have, and a carefully tracked uppercase heading is exactly where that shows. A PNG renders
identically in every client.

It works by `<foreignObject>`: the browser lays the actual HTML out with the actual CSS and the
result is drawn to a canvas. Laying the text out by hand with `fillText` would mean writing a
line-breaker, and the promise of the feature is that the picture matches the canvas — so it has to
be the *same* layout engine, not a second one that agrees most days.

The first version looked right and was not. Rather than eyeballing the shot I counted its pixels:

| | height | ink | navy pixels | red pixels |
|---|---|---|---|---|
| first version | 214 | 13.8% | 48,217 | **0** |
| with the fix | 213 | 15.2% | 46,805 | 2,695 |

Zero red. The wrapper copied the cell's inline *style* but not its *classes*, and nearly every rule
that styles this markup is scoped to one — `.sy-rich p`, `.sy-rtl-d10000 a`. They match the cell,
not anything inside it. So paragraphs fell back to the browser's defaults and the link drew in the
browser's blue-then-purple instead of the brand red. At a glance, on a navy-on-cream block, it
looked completely fine.

The 16px the same numbers found next: the last paragraph's bottom margin was collapsing out of the
wrapper, so the picture came out shorter than the cell it replaced, which reads as the block having
quietly tightened up. `display:flow-root` contains it, and the shot is now 213 against an on-screen
213.

**The general form: when you generate an image, assert about its contents, not its existence.** A
render that produces a correctly-sized rectangle of approximately the right colour passes every
test anybody thinks to write and every glance anybody gives it. Sampling for a colour that *must*
be in there — the brand red, in this case — is three lines and catches the whole class.

And the feature ships with its guardrails, per 3.36: `local-image` already refuses the export while
the PNG is still a local file, and a new `text-as-image` warning says what the trade actually is —
images are off by default in Outlook on Windows and most corporate mail, so for those readers the
alt text *is* the block. Empty alt is an error rather than a warning, because at that point it is
not a trade, it is a blank space where the copy was.

### 3.46 A preview imitates a rendering, not a brand

The inbox view is shaped like the client these emails are actually read in — folder list, toolbar,
subject with its label chip, avatar, sender and address, "to me", timestamp. It has no logo and no
wordmark, and it will not get one. The line is worth stating because it is easy to cross by
accident and there is no upside on the far side of it: a preview exists to answer "how does my
email render there", and every pixel that answers that is fair game, while a pixel that says "this
*is* them" answers nothing and is a different kind of claim.

Two things in the chrome are load-bearing rather than dressing, and they are the reason it is worth
building at all:

- **The folder list is width.** A message on a desktop is not the width of the window, it is the
  window minus the nav. An email that only looks right at 900px is an email nobody has seen yet.
- **The viewport is a fold.** Fixed height, message scrolling inside — the only honest way to ask
  whether the top of the email does its job.

Everything else — the star, the reply arrow, the Compose pill, the unread counts — is inert, and
earns its place by silhouette: the *shape* of that row is what makes the view read as an inbox
instead of as a box with a name in it.

The adaptation is worth copying too. Short of horizontal room, the nav collapses to its icon rail
rather than the message getting narrower, because the message is the subject of the preview and the
nav is the context. When only one of them can have the pixels it is not a close call — and the real
client does the same thing, so the imitation stays true while it adapts.

### 3.47 The panel should cost what the decision costs

A block can have a box round it now — the probe template's look, which is what Jared asked to be
able to build. A box is four decisions: width, colour, corner, inset. Four rows in Appearance on
every block would be four rows of nothing for the blocks that have no box, which is most of them.

So it is **one dial until the width is above zero**, and four controls after. The shape generalises
to anything optional: the first control is the switch, and the settings only exist once the thing
does. The same reasoning put "Render as image" behind a single button and the side paddings behind
a chain — a panel earns its rows.

Three things the box itself had to get right, all of them Word:

- **A table, not a div.** Word gives a div a border at the width of whatever contains it and gives
  a table the width you asked for.
- **`border-collapse:separate`**, or `border-radius` does nothing *anywhere* — not just in Outlook.
- **Inside the cell's padding, not outside it.** Outside, the line runs hard against the edges of
  the email, which is a rule across the page and not a callout. Inside, the page gutter stays
  outside the box and the box's own inset is the space between the line and the words. That is the
  one anybody drawing a card means.

And a fourth that is not Word: a box whose colour reference is empty must fall back to something
real. `border:2px solid null` is a declaration every client drops, so the box a designer asked for
would simply not be there — the fallback is the body colour, and the picker says "Body colour"
rather than "None", because a picker reading *off* while a line is on screen is its own small lie.

### 3.48 Two copies of a list are two lists that drift

The button's Style options were `Red` and `White` — the variant names until schema 3 renamed them
for being named after a colour either of them could stop being. The document's values moved; the
picker's list did not. So choosing a style wrote `red`, matched no variant, and fell back to
primary. A control that looked like it worked, in the one panel where "which button is this" is the
whole question.

That is the fourth time this exact shape has appeared in this project — a hard-coded palette, a
hard-coded stripe picker, a background list built from the *shipped* presets, and now this. The
rule was already written down as 3.34 for the compiler, and it wants restating for the interface:
**a control that offers a choice must read the choices from the thing that defines them.** The
button picker reads `ds.buttons`; the preset picker reads `ds.themes`; the colour slots read
`ds.colors`. None of them can go stale, and an imported design system works in all of them for
free.

The tell is worth naming, because it is what made this survive four migrations: a list literal
inside a file that is not the definition of the thing being listed. `options: [['red', 'Red']]` in
a catalog is a copy of something that lives in the design system. There is no third place for it
to be right.

### 3.49 `innerHTML` is HTML. A `<foreignObject>` is XML. They are not the same language.

Text-to-image worked on the block I tested it with and failed on Jared's. The difference was a
line break.

`cell.innerHTML` serialises the DOM as **HTML**, where void elements are written unclosed: `<br>`,
`<hr>`, `<img>`. The content of an SVG `<foreignObject>` is parsed as **XML**, where an unclosed
tag is a fatal error — not a warning, not a recovery, a stop. So the SVG never loaded, `onerror`
fired, and the user got "something in it is not well-formed markup" about a paragraph with a line
break in it. The most ordinary thing in an email.

`XMLSerializer` is the fix and should have been the first choice: it closes void elements, escapes
what needs escaping, and stamps the XHTML namespace that the foreignObject needs anyway. The rule:
**when markup crosses into an XML context, serialise it, do not copy it.** `innerHTML` in, XML out
is a language change disguised as a string copy.

Two more things this turned up while it was open:

- **A promise with a path that neither resolves nor rejects.** `toBlob` on a canvas tainted by a
  cross-origin image throws *inside* the `onload` handler, where an uncaught throw settles nothing
  — the button said "Drawing…" for ever. Every callback that can throw inside a `new Promise` needs
  a `try/catch` that rejects, and the cross-origin case is now named before it happens rather than
  caught as a `SecurityError` afterwards.
- **`textContent` has no spaces in it.** The alt text came out "Heading oneSome copy here." because
  a heading and a paragraph concatenate. For a reader with images off that string *is* the block,
  so it has to read as a sentence.

And the gap from 3.43 is closed rather than noted again. This file has now produced two bugs that
nothing in four hundred tests could have caught, both invisible in the panel and fatal on the
canvas, so `jsdom` is a dev dependency and `tests/rasterise.test.ts` runs against a DOM. The rule
it enforces is the one the browser enforces: hand the serialised markup to an XML parser and it has
to come back without a `parsererror`.

### 3.50 A constructor that reads the defaults is a template that ignores its own system

An audit pass over "can a designer actually build a *different* email in this", which turned up
one shape of bug in four places. Every one of them looked like using the design system and was
not.

- **`createSection` read `DEFAULT_DESIGN_SYSTEM`.** So every block dropped into a template built
  on another palette arrived on cream with navy text — the one section in the email that ignored
  the system, and it was every new one. The row-of-columns constructor did the same with a literal
  `'cream'`.
- **The top bar and the footer drew a preset called `navy`, in white, whatever their section
  said.** Fine for the one palette that has a navy; on any other, a bar you could not recolour. And
  the v1 importer had put both on `theme: 'cream'` with the band overridden to a literal — which
  the renderers ignored, so nobody noticed that a single palette edit would have re-resolved the
  footer to cream through `recolor`. Two wrongs holding each other up.
- **The columns panel's Background list read the *shipped* presets.** The fifth copy of a list
  that lives elsewhere (3.48). A preset added in Design never appeared there.
- **The footer's phone rule sat in the head, pinned to navy.** It moved into the footer, emitted
  in the colour the section actually has.

The rule is the one 3.34 and 3.48 already state, in a third form: **anything that constructs a
document node must take the design system it is constructing for.** A default parameter is fine
— tests and the blank starter want the shipped values — but the app must pass the template's own,
and `bandedPreset(ds)` ("the first preset that paints a band") replaces the name `navy` wherever
the furniture reached for it. An imported system calls its dark band whatever it likes.

Two blocks fell out of making the furniture ordinary. The footer now honours its column's
alignment — a centred footer on a white page is the common shape, and it was unbuildable — and the
top bar renders its role's tracking and font, which the Type panel had offered for that role while
the block ignored them. A dial wired to nothing, exactly the failure the brief names.

And one more of those, found by clicking the new Divider card: **clicking a palette card selected
the new section, not the block.** The inspector falls through to a section's first block, so it
showed the right panel — with every control reading `undefined` and writing nowhere, until you
clicked the block on the canvas. Every block type, every click-to-add, for as long as the palette
has existed; the drag path selected the block and so never showed it. Two lessons. A panel that
*looks* right is the one to test by turning a dial, not by looking at it. And when two paths
produce the same result, make them share the code that selects it — they did not, and one drifted.

### 3.51 A folder of templates needs a way to make one

The app opened on the standard email and stopped there. The only route to a template of your own
was to delete every block of somebody else's, and a copy meant exporting a file and renaming it by
hand. "A designer builds a new template in under an hour" (brief.md) was being met by
un-building one first.

**New** offers three starting points, and **Duplicate** saves a copy as its own file. Three
things about how they save, each of which was a bug in the first version:

- **A new template's first save must not land on an existing file.** "Standard email" slugs to
  `standard-email.template.json`, which exists — and the first autosave would have overwritten it
  with a blank page. On a synced folder that reaches everybody before anybody notices. The name
  now avoids everything in the folder (`-2`, `-3`), and there is a test.
- **Once the file exists, every save goes to *that* file.** The save path recomputed the name from
  the template's name on every write when there was no file record, so renaming a new template
  left a trail of files, one per name it had had. The first save pins its name, the folder is
  re-read, and the editor is bound to the real entry.
- **New saves on the first edit; Duplicate saves now.** Clicking New three times while deciding
  should not litter the folder with three untitled files; asking for a copy should produce one.

The starters are built from the model (`src/model/starters.ts`) for the reason the baseline is:
a fixture typed out as JSON is right on the day it is written and silently wrong from the first
model change after. "Blank" is the legal footer and nothing else, because HubSpot will not publish
without it (1.8) — a page with nothing on it is a page that cannot ship. "Card email" is the Phase
0 probe's look, which Jared asked to be able to build: a white page, a monospace stack the system
names, copy in boxes drawn in the palette's ink, and a divider on the rule colour. Every part of
that look is a token, which is what makes it a starter rather than a screenshot.

Two smaller things the same pass added, both because the card look needed them: a **Divider**
block — a rule inside the gutter, drawn as a bar rather than a border so Word draws it, following
the system's rule colour by default so it matches an `<hr>` the team types — and **Add a font**
in Design › Type, because seven shipped stacks were the whole list and a monospace template needed
an eighth. Headings reach H5 and H6 now too, and the phone block covers all six levels; it covered
four, which left an `<h5>` typed into HubSpot's editor at desktop size on every phone.


### 3.52 A menu at the caret beats a bar over the block

The formatting toolbar over a block being edited is gone. Typing `/` opens a menu where the caret
is, listing what the text can become and what can be added below it; type to filter, Enter to
apply. On a selected block that is not being edited, `/` or ⌘K opens the same menu with only the
add-a-block half, and the block it adds opens for typing straight away.

Two things a bar of buttons gets wrong that a menu gets right. A bar has to show every option at
once, so it shows twelve glyphs nobody reads and hides the rest; a menu shows the three that match
what was typed. And a bar sits *over* the block, between the words and the eye, while the menu
opens where the eye already is.

What the menu offers is **HubSpot's editor minus what the design system owns.** Font, size,
colour and highlight are in HubSpot's toolbar and deliberately not here: an inline style beats the
block's own scale (3.5), and the sanitiser strips them on the way to the document whether they
arrive by paste or by button — so a command for them would be a button that looks like it worked.
Everything the menu does offer survives the sanitiser, and there is a test that runs each tag it
can produce through it. Strikethrough, small print, code, superscript and subscript were added to
the allowlist for this, each with a `.sy-rich` rule so Outlook's defaults are not what ships.

Three details, each a bug in the first draft:

- **The query is re-derived from the live selection on every keystroke**, never remembered from
  where the slash was typed. Browsers split and merge text nodes underneath a contenteditable, and
  a saved node reference is a reference to where the slash *was*. The caret's own text node,
  sliced at the caret, is the only place the query can be.
- **The `/query` is deleted before anything commits.** Picking an add-a-block item commits the
  edit and inserts; done in the other order, "/head" ships in the copy.
- **A slash inside a word is not a command.** `https://` is the ordinary case. The slash has to
  be at the start of the line or after a space, and the query has to contain no space — so typing
  on past a menu that matched nothing dismisses it rather than following you down the paragraph.

The Markdown habits came along because they cost nothing once the machinery existed: `- `, `1. `,
`# ` and `> ` at the start of a line do what they do everywhere else, and Tab in a list indents.
The marker is read on `input`, after the space is in, rather than on the space's keydown — so it
works however the space arrives (a keyboard, an IME, dictation), and so it could be verified at
all: the browser harness inserts text without key events. And Tab *outside* a list is swallowed,
because the browser's default moves focus out of the editable, and that commits the edit mid-word.
And the keys the canvas answers to — Delete, ⌘D, ↑↓, ⌥↑↓, Enter, Escape, ⌘S, ⇧⌘E — are one
policy in the app, with the frame forwarding what it does not own, so a shortcut means the same
thing whichever pane last had the click. `?` lists them, from the same data the policy reads.

One caveat found the hard way and worth writing down: **a synthetic Enter does not submit a
form.** The browser's implicit submission rides on the keypress a real keyboard produces and an
automated one does not always, so a form that only listens for `submit` works from a keyboard and
not from a test. Handle Enter on keydown as well.


### 3.53 The shared system is a layer on top of the template's own, not a replacement for it

`design-systems/<name>.system.json` in the workspace, one file per system, and a template names
the one it follows. That is the acceptance item that had been open since the design panel was
built, and it was small once the shape was right: **while a template names a folder system, its
`ds` is that file materialised on open and written back on save, and is never written into the
template's own file.** Everything in the pure layer already read `template.ds`, so nothing in the
compiler, the catalog or the editing operations changed at all. The serialiser drops `ds` when
`designSystem` is set; the editor writes the system file when the values move; the app hands the
system back to every template that names it on open.

Two decisions worth keeping:

- **Sections re-resolve on open, and only where they can.** A template that follows `card` and
  has a section on a preset called `navy` keeps that section's stored colours, because `card` has
  no `navy`. Following is not a repaint; it is "use this system where the names match", and the
  stored hexes are what "where they do not" falls back to. A test says so.
- **Reset on a folder-backed template resets the file, not the link.** Dropping `ds` would leave
  the template naming a system it no longer held. The shipped values go into the folder's file
  instead, and everything that follows it moves — which is what a reset of a shared thing means.

And one that is a limitation, named in the panel: the system file has no conflict check. Two
designers editing the same system at once is last write wins. The template file's re-stat before
write does not extend to it yet.

### 3.54 A placed pattern is a copy that remembers where it came from

Patterns: a section saved to `patterns/<name>.pattern.json`, placed in any template from Blocks,
and kept in step. Three decisions, and the third is the one that took thought:

- **The placement is a copy.** The template compiles alone; the exported HTML needs no second
  file to be right (brief.md). What the section carries is `{ id, version }`, enough for the
  editor to say "the pattern moved on" and offer the new version or a detach.
- **Versions are integers, bumped on every push.** Not timestamps: two designers' clocks are not
  an order, and "is this instance behind" has to be a comparison of numbers.
- **An update keeps the field names it can.** Replacing a section's contents replaces its
  HubSpot fields, and the team's emails are bound to those names (1.10). So an update carries a
  map from lock label to the name the placed copy held; a block whose label matches keeps its
  name, and only a genuinely new block mints one. The names the instance held are released
  *before* minting, or the block that kept its label would be handed `body_2` because `body`
  looked taken by its old self. There is a test for exactly that.

Saving a section as a pattern marks the section it came from as the first instance, so the
place it was made follows updates like every other placement. And an applied update re-points
the selection: the section keeps its id but its blocks get new ones, and a selection left on the
old block made the next keystroke act on the wrong thing — found by a shift-arrow that landed on
the top bar. Pushing writes a new version from
whichever instance is selected; the others show `update` in Layers and offer Apply. Detach keeps
the content and drops the marker.

### 3.55 Copy through the clipboard, select through the arrows

Three editor conveniences, and what each turned on.

**Copy and paste between templates go through the system clipboard as text.** Only one template
is open at a time, so "between templates" means "across an open and a close", and the clipboard
is the one thing that survives that. Text rather than a custom type, because a custom type does
not reliably survive between browser tabs and text does. The payload is JSON with a marker key,
so an ordinary paste of a URL is recognised as not ours and left to whatever has focus. Handled
on the `copy` and `paste` events, not on the keys: the events carry the data, and they fire for
the real shortcut in every browser without a permission prompt. The frame forwards its own.

**Multi-select is a run, not a set.** Shift-click and shift-arrows add to the selection, and
what a run can do is what a run is for: move together, copy together, delete together. Moving
is a move of contiguous sections; a run with a gap in it does not move, because what "together"
would mean for it is not obvious, and a no-op is better than a guess. The run belongs to the
app, not to the editor — the editor's selection stays one thing, so nothing downstream had to
learn about lists. Any change of selection that is not an extension clears it.

**Recent blocks sit at the top of the slash menu**, and only while nothing has been typed:
once there is a query, the same block twice in one list is noise. Four, kept in the browser,
because they are a convenience and not a document.


### 3.56 A row of tools should read as tools

Jared circled the strip above the canvas: three glyphs, then "Dark override" in words, then
"Preview state · 1/4", then a sentence of instructions, and when dark was on a two-line note
wrapped underneath and made the row taller. Four kinds of thing in one line, and only the first
was a control anyone recognised at a glance.

It is glyphs now — screen, handset, envelope, moon — with a count for the preview state and a
`?` at the far end, and every word moved to the hover. The instructions were exactly what 3.44
and Jared's standing rule say a panel should not carry: read once, in the way ever after. The
dark-mode note went into the moon's own tooltip, where it can change with the state ("holding
its own colours" versus "no force-light layer") without adding a line to anything.

The general form, which is 3.44 again from the other side: **a toolbar is a place for tools; an
explanation that lives in a toolbar is a tool that never gets used.** If a control needs a
sentence, the sentence goes on the control.


### 3.57 Markup nobody uses is two problems, and only one of them is the designer's

Jared asked for Checks to clean up unused tags. Writing the detector first, before deciding what
"unused" meant, turned up the two shapes and who owns each.

**The compiler's.** A rule in `<style>` whose selectors match nothing in the body. Run over the
standard email the count was thirty-three: two-column footer variants that were never built, a
page of styles for HubSpot modules a coded template cannot hold, `hse-size-6` from a grid the
columns do not use, hide-on-phone classes nothing sets. All of it "kept from the original export",
all of it ~1.2KB every send paid for, and none of it visible because a stylesheet has no empty
space. It is gone from `head.ts`, and the detector is now the lint rule `unused-css`, so it cannot
come back as boilerplate: the compiler emits a rule where something needs it (`ctx.once`) and the
linter says when one does not.

The rule needs an allowlist, and the allowlist is the interesting part. `.moz-text-html` is a
class Thunderbird puts on the body; `a.cta_button` is what a CTA the team inserts renders as;
anything under `.sy-rich` styles what the team will type. None of it is in the output and all of
it is used. **"Unused" has to mean "cannot match", not "does not match now"** — and the
`hs-inline-css` block is exempt outright, because its whole purpose is content that does not exist
yet.

**The designer's.** A block whose markup the sanitiser would rewrite: empty paragraphs, the
`<span style>` a paste from Word leaves, a `target="_blank"` no mail client reads, a list nested
outside its item the way a browser's indent writes it. The canvas has always sanitised on the way
in; the inspector's textarea and the v1 import never did. So `untidy-markup` reports each block
with what it carries, and **Clean up** in Checks runs the same reduction over the document as one
undo step. The standard email itself lit up on the first run, for the `target` on every link v1
wrote — which is the right kind of finding: true, harmless, and now fixable in a click.

The sanitiser moved from the app to the model to make that possible. It was always pure; it was
only ever *filed* under the app.


### 3.58 A folder can be open and still refuse to be written to

Jared opened a template folder on Google Drive, rendered a heading as an image, and got a stack
trace: `Failed to execute 'getDirectoryHandle' on 'FileSystemDirectoryHandle': The request is not
allowed by the user agent or the platform in the current context.` The header said "could not
save" in the same breath. The folder had opened, listed its templates, shown its assets, and was
refusing every write.

That is Chrome's folder picker. It asks for the folder, then asks a second question — **Edit
files** or **View files** — and the second answer gives a handle that reads perfectly and throws
`NotAllowedError` on any write. The app had asked for edit access and assumed it had it, which is
why the failure was a silent badge and a raw exception rather than a sentence.

Three things changed:

- **The workspace knows what it was granted.** After the picker, `queryPermission` says whether
  edit access came with it, and `canWrite` reports that rather than assuming. A view-only folder
  behaves like files picked by hand: saves, exports and rendered images download.
- **Every refused write is one message with one button.** `NotAllowedError` from any write path
  becomes a `WriteRefused` with a sentence that says what happened, and the banner it lands in
  carries **Allow editing** — which calls `requestPermission` from the click, the only place
  Chrome will show the prompt. Files says "View only" with the same button. The header badge says
  "view only" instead of pretending nothing is open.
- **Restore takes what Chrome still grants.** A remembered folder reopens view-only when that is
  all the browser kept, instead of not at all, so the second visit is one click from writing.

Two things about Google Drive folders worth knowing, neither of which the app can fix:

- Drive for desktop has two modes. **Mirror** keeps real files on disk and works like any folder.
  **Stream** keeps placeholders and fetches on open, which is slower to list and has been seen to
  fail writes through this API. Mirror the templates folder.
- Drive resolves two people saving the same file at once by making a "conflicted copy" that
  nobody is told about. The template file's re-stat before write catches the case where the
  other save has already landed; a save that lands during the write is Drive's to resolve.

And the hosting model this confirms, since Jared asked: the app is a static site — GitHub Pages
serves `dist/` as it is — and the folder is a local one, granted to that origin through Chrome's
File System Access API. Nothing about the tool is on a server; the site is the code and the folder
is the data, and the two only meet in the browser. Permissions are per origin, so moving from
localhost to Pages means picking the folder once more; Chrome offers "allow on every visit" after
that.


### 3.59 A column that holds several blocks is one cell, not several

**Jared, 2026-09-12:** "rework the column system so more than one block can be in a column.
unless that is going to cause render issues in email clients. remember what gets rendered in a
client is the most important thing."

A column had always been a list of blocks — the type said so, the columns panel counted them —
but the compiler drew each block as its own padded cell with the column's padding and, when the
column had a box, its own box. The card starter said "two blocks in one column share one box" and
shipped two boxes. Learnings 3.16 had gone the other way for single-column rows: a drop beside a
block made a new section, on the grounds that the two rendered identically and the nesting would
correspond to nothing on the canvas. That was true, and it was true *because* the renderer made
nothing of a shared column.

Now it does. A column holding more than one block is a **group**: one band, one cell carrying the
gutter, the box and `hs_padded`, and each block in a row of its own inside it with the gap below.

Why that markup, block by block, since the client is what matters:

- **A cell per row, not bare content.** A left-aligned button is a `<table align="left">`, and a
  table with `align` floats in Outlook and Gmail both — the heading after it would wrap beside it.
  Every row is a full-width table with one cell, which is the oldest way to stack things in email
  and the one nothing gets wrong.
- **`hs_padded` once.** HubSpot's phone rule on that class is `!important` and drags every cell
  wearing it out to the gutter (learnings 1.11). Only the group's outer cell wears it; the rows
  inside carry `padding:0 0 <gap>` and nothing a phone rule matches.
- **The rich-text class stays on the row.** `.sy-rich` is what the inlined rules match against,
  and it has to wrap exactly that block's markup.
- **The gap is a design token.** `blockGap`, next to `pagePadding`, for the same reason: one
  rhythm for the email, departed from per column on purpose. A Spacer in a group replaces the gap
  on both sides of it, so a 40px spacer is 40px and not 40 plus 16.
- **Blocks that draw their own band stay out.** The top bar, the stripes and the footer cannot join
  a cell. A column that holds one alongside others — a document from before groups — renders it
  as its own band and the rest as they were; a lone block beside it is still a lone block.
- **A lone block is byte-identical to before.** The standard email's export did not change by a
  byte. Nesting is three tables deeper than a lone block for the rows that need it and no deeper
  for anything else.

What a group costs on the canvas is a second kind of "beside", and the drop indicator has to
say which. The top and bottom edges of a column's first and last block mean a new section — the
line runs the full width at the band's edge. The middle means into the column — the line is inset
to the block's content and the cell it would join is framed. On a block that draws its own band the
halves are the two section edges. ⌘G groups a selection, ⇧⌘G splits a group back into sections
that keep the look, and the outline draws a group as structure with its blocks under it — the
nesting corresponds to something now.

### 3.60 Show the space, not just the number

The same message: "when hovering over a block or changing it's padding/margin display them
visually with their parameters. so there is a better sense of the structure and alignment."

A padding dial reads 10 and the canvas shows some whitespace; whether the whitespace is that 10,
the paragraph's own margin, the section's space, or the box's inset is not something the eye can
tell. Devtools solved this for web pages a long time ago with the tinted box model, and that is what
the canvas draws now: the block's cell padding in green, the gap under it inside a group in blue,
the box's inset in violet, the section's space above and below in orange, each strip carrying its
number. On hover for whatever is under the pointer; pinned to the selection while the pointer is
over its Spacing panel or a dial there has focus, so dragging a number in the side panel is
visibly dragging the strip on the page.

Two things about how it is measured that are the difference between a drawing and a diagram:

- **From the live document, not the model.** `getComputedStyle` on the actual cells, which means
  at a phone width the gutter drawn is the phone rule's, and a column following the page gutter
  shows the gutter it actually got. What is drawn is what the client renders.
- **Re-measured on every load and every resize.** A dial tick reloads the frame; an image arriving
  moves everything under it. The overlay follows the same height signal the frame does, and is
  cleared the moment a drag starts, because under a block in your hand it helps nobody.

Jared's second look at it, the same day, with a 16px gutter drawn: "If the left padding is 20px
or less it displays the text not inline with the padding. what if you could grab the handles next
to the parameters to adjust the values in real time."

Both taken. The number was centred with flex inside its strip, and a flex item wider than its
container does not stay centred — the label for a thin gutter drifted off it onto the words. It is
positioned now, on the strip's own axis, whatever the strip's width. And the number *is* a handle:
grab it and pull, and the padding follows — up and down for space above and below, sideways for
the gutter, the same for a group's gap, a box's inset and a section's space. Selecting the block as
the drag starts means the dial in the side panel moves with it, which is the same number seen from
both sides. The moves go to window listeners rather than to the handle, because every change
reloads the frame and re-measures the strips, and a strip dragged to zero is not there to be
measured — the handle would vanish under the pointer mid-drag.

And a third look, with three arrows at the corners of a group's padding: "the padding in green is
not rendering great." The strips were the right numbers in their inline styles and 28px on the
screen, every one of them. The kinds were classed `pad`, `gap`, `box` and `section`, and `.pad` is
the panel utility that adds 14px of padding — so with `box-sizing: border-box` no strip could be
smaller than 28px, and each one spilled past its edge into the words or the next column. Every
class on the overlay is namespaced `sy-space-…` now, and the strip resets its padding besides. The
general rule, which this project keeps re-learning: a class name that is a common word is a
collision waiting for the next stylesheet.

The handles came out again the same afternoon, at Jared's call: "remove the ability to adjust the
values inline. still want to add it in the future but we got more to work out first." The overlay
stays as a drawing; the numbers no longer take the pointer. What was learned building it is above
and is what to start from when it returns. And the overlay now leaves the moment a block is opened
for typing or the menu opens on it — a block with the caret in it is being written, not looked at,
and the strips sat over the words.

### 3.61 Patch the body; reload the frame only when the head moved

**Jared, 2026-09-12:** "things are feeling a little slow when I duplicate an element."

Measured before guessing. Compile, lint, branch enumeration and the dark-mode pass together take
about three milliseconds for the standard email — nothing there. What took the time was the canvas:
every change to the document was a new `srcdoc`, and a `srcdoc` reload blanks the frame, re-parses
the document, fetches and decodes every image again, and only then fires `load` — three-quarters of
a second after a duplicate, and twice. The height was held so the page did not jump, but a blank
frame for most of a second is the feeling of slow.

Almost every edit changes the body and nothing above it. The frame now keeps the document it last
loaded and, when a new document shares that one's head and `<body>` tag, writes the new body into
the live document instead: same stylesheet, same listeners, images still decoded, no blank. The
head moves when a design token does, or when a new block brings a rule the stylesheet did not have
yet — and for those the old path runs, because it is the only correct one.

Two things that keep it honest:

- **Every effect that reads the frame keys on the document string, not on the load count.** They
  did already, for the outline and the dimming; the patch effect runs first so they find the new
  body in place.
- **The `srcdoc` attribute holds what was loaded, not what is current.** If it tracked the current
  document, the renderer would set it on every change and reload the frame anyway; the patched
  body would be thrown away the moment it was written.
- **What the frame *shows* is tracked separately from what it *loaded*.** The first cut compared
  against the loaded document only, and an undo that restored exactly that document looked like no
  change: the canvas kept a duplicate the document no longer had.

And one that was found on the way, which had nothing to do with reloading and everything to do
with the canvas going still: a listener bound to the frame's `documentElement` threw on the
frame's very first document — the one before `srcdoc` has parsed, which has no root element. An
exception inside a Preact effect aborts the flush, and every effect queued behind it in that pass
is dropped, including the one that hands the canvas its next document. Nothing in the symptom
pointed at a `mouseleave` listener. `mouseout` with no `relatedTarget` on the document itself says
the same thing and cannot throw.




- **HubSpot cannot be rendered locally.** Module output, rich-text inlining and field
  registration are only observable in a real send or in the editor. Batch the open questions and
  answer them in one test send rather than one at a time.
- **Mobile footers are where it always breaks.** Every footer variant needed a separate pass for
  phone widths: wrapping buttons, stacking columns, alignment, padding.
- **Gmail on a phone is the acceptance test.** It is the strictest client in the mix and the one
  Jared checks first.
- **The template is the deliverable.** Early work drifted toward a standalone email editor;
  the thing that mattered was a file uploadable to Design Manager.

### 3.62 Structure needs a handle of its own

**Jared, 2026-09-12**, with a row of columns selected in Layers and nothing on the canvas to show
for it: "It's hard to choose columns without going to the layers panel. what if each block was
basically a row and it had its type + drag bar + possibly menu popups for appearance and other
options of the block."

He was pointing at a gap the same shape as 3.15's. Blocks had a bar, an outline and a drop
target; a row of columns and a group had none of the three. A click anywhere in one landed on a
block inside it, the gap between the columns selected nothing, and the row's own settings —
count, ratio, phones, background — lived in a panel reached only through the tree.

Every band on the canvas has a bar now, the same shape as the block bar: the glyph and the name,
which select it; a grip, which moves the whole row; and ⋯, which opens the structure decisions
where the row is — columns, phones, background, then group, duplicate, delete. It shows on hover
and stays while the row is selected, and a row selected as itself is outlined dashed so it reads
as structure. A click on a column's gap, an empty slot or a group's padding selects the row too,
because that is what is under the pointer.

Three things about the bar that were not obvious until it was drawn:

- **A lone block is a row, and its bar is the block bar.** Two bars for one thing is noise; the
  block bar gains the ⋯ and the row bar stays away while that block is selected.
- **The bar sits over the frame, so the frame thinks the pointer left.** A bar that vanishes as
  the pointer reaches it cannot be clicked. The frame's `mouseout` waits a beat and the bar says
  "I have it" on the way in.
- **Two bars, one corner.** A selected block at the top of a row of columns puts its bar where
  the row's would go; the row's steps to the other end of the band rather than stacking.

The rule from 3.15, restated one level up: an interface that requires knowing which panel owns an
operation has already failed — and a *thing on the canvas* with no handle has failed the same way.

### 3.63 One bar, on the thing that is selected, and it names what the thing is

**Jared, 2026-09-12**, an hour after 3.62 shipped: bars "showing blue or black versions. it
should only show the black once the element is clicked. remove the grab handle from the menu,
it's not intuitive. and if you click on the bar name you can change the block's type with the
same style menu as the slash command."

Three corrections, each of which was right:

- **A bar that appears on hover in one colour and on selection in another reads as two kinds of
  thing.** It was one kind of thing. Bars show only for the selection now, and there is one look
  — dark, with a hairline so it survives a navy band. The row of columns and the group get the
  same bar the block has, with the same verbs: ⋯, up, down, duplicate, delete.
- **A grip nobody asked for is a grip nobody understands.** Blocks already move by being dragged;
  rows move by their arrows. The grip went, and its drag code with it.
- **The name on the bar is where the type belongs.** Click it and the slash menu's list appears
  with what this could be instead: for a block, the other kinds that share a cell; for a row, one
  to four columns, and back to sections for a group. Converting keeps the words, the alignment
  and the HubSpot lock — field name included, so the team's content stays bound (learnings 1.10).
  The field's *kind* may change, text to rich text, which a re-upload treats as a new field of
  the same name.

Two more from the same message. "What does the hide do?" — it was the phone drop, labelled with
one word; it says *Hide on phones* now. And "a way to drag each column's size to a custom %": the
selected row draws a divider between each pair of columns, and dragging one trades share between
the two beside it. Spans became relative rather than twelfths for it (the compiler always divided
by the total), the inspector shows the split as percentages when no preset matches, and the whole
drag is one undo.

### 3.64 The number you can see is the number you can type

**Jared, 2026-09-12**, with the ratio readout circled: "allow me to change the ratio of the
columns here as well." The readout said 18 · 62 · 20 and was only a readout; the way to change it
was the divider on the canvas, which the panel did not say. It is three inputs now, one per
column, and typing into one rebalances the others in proportion so the row still adds up — the
same operation the divider does by dragging, from the other side.

The same screenshot showed the layer tree saying *150%*, *517%*, *167%* for those three columns.
Shares had been twelfths for as long as the tree existed, and the tree divided by twelve. The
compiler never did — it divided by the row's total — which is why custom shares rendered right
while the tree got them wrong. Every reader of a share divides by the total now.

And "add a preview button that hides all controls": an eye in the tools row. On, the canvas is the
compiled email and nothing else — no injected styles, no listeners, no bars, no outlines, no
slots — and the side panes go with them. The header stays, because Export and the checks live
there and so does the way back; the device switches stay, because they are part of looking. Escape
brings the tools back.

### 3.65 The top bar joins the blocks that share a cell; the freeform block ships as a picture

**Jared, 2026-09-12:** "give topbar more options. include columns. create the freeform block."

**The top bar.** It drew its own band and could not share a cell, so choosing columns on its row
made it vanish — the compiler skipped it as a block that cannot live in a column. It can now: a
`topbarParts` puts the tagline in a padded cell like any other block, so a two-column row on the
dark preset with a tagline on the left and a "view in browser" on the right is an ordinary thing
to build. It gained an alignment and an optional link, in the section's ink rather than the link
colour — a tagline that turns red because it is clickable stops being a tagline. Alone in its
section it renders byte for byte as before.

**The freeform block** — the first phase of docs/freeform-and-effects.md, built the same day it
was planned, plus most of the second:

- **The recipe is the block.** Six layer kinds — text in a type role, image, rectangle, ellipse,
  line, freehand path — on a surface with a width, a height and a background. The drawing of it
  is a pure function (`compile/freeform.ts`) of the recipe and the design system, so it is the
  same every time, which is the whole promise.
- **Two renderings, one tree.** The canvas gets the recipe drawn live as inline SVG; the file gets
  an `<img>` of the rendered picture. A new IR node, `mode`, holds both, and the serializer picks.
  It is the `print` node's fallback idea for a subtree, and it is reserved for exactly this — not
  for anything a `print` or an `if` could say in honest HubL.
- **Rendering is the path that already existed.** The canvas cell holds the SVG; `rasterise.ts`
  draws it to a PNG at twice the size; `renderAsImage` sees a freeform block and stamps its
  picture and hash instead of replacing it. The picture is a local file until it is uploaded, and
  the same `local-image` check refuses the export until a hosted URL replaces it (learnings 3.36).
  A new check, `freeform-render`, says when a block has never been rendered — an error — and when
  its picture is older than its recipe — a warning, and the quieter of the two defects.
- **Editing is on the canvas and in the panel at once.** Drag a layer on the surface to move it;
  Draw and drag to add a stroke; the panel lists the layers, adds them, orders them, and holds the
  picked layer's numbers. Text is `foreignObject` in the SVG so it wraps and takes the role's
  style; SVG text would do neither.
- **Not built yet:** resize handles on the canvas, snapping and guides, an asset picker for image
  layers (a file name from Assets, for now), and the effects steps — which is where the other
  tools come in, and the next phase.

What it cost the model: `src` and `renderedHash` on the block, an `image href` swap alongside the
`img src` one for local assets, and `foreignImages` learning that an SVG `<image>` taints a canvas
the same way an `<img>` does.

### 3.66 The brand block: a mark the email carries as a picture

**Jared, 2026-09-12:** "Brand block that is basically an image block but with brand assets,
logo, scugnizzi, IAC. Check the inkbleed assets folder for those svg's."

Four SVGs sat in the ink bleed tool's assets — the SY monogram, Scugnizzi, ICA and NWCA — and
an email cannot carry an SVG: Gmail strips it and Outlook does not draw it. So the block is the
freeform block's shape with a fixed recipe: the mark, a width and a colour, drawn live on the
canvas as inline SVG in that colour and shipped as a PNG rendered from it, through the same
`mode` node, the same render path and the same `picture-render` check. The colour follows the
section's text by default, so the marks on the dark band come out light without anyone asking.

The marks are bundled into the studio (`model/marks.ts`) rather than read from the folder: the
compiler stays pure, a template does not depend on which folder is open, and two marks on one
page do not share the ids the files came with — those are stripped on the way in, as are fills,
so the block's colour paints every path. Regenerate the file the same way when the assets change.

### 3.67 A surface is a workspace, not a panel of numbers

**Jared, 2026-09-12**, an hour after the freeform block shipped: "make freeform less clunky and
feel more like an endless canvas I can drop stuff on and zoom in and out. allow me to drop assets
from the assets panel into it, resize, rotate, and play with on the canvas."

The first version edited the surface in place on the email, at the email's size, with the numbers
in a panel. That is a form, and a drawing is not made in a form. The block opens as a workspace
now — double-click it, or *Edit surface* in its panel — in place of the email: the page on a
dotted field with no edges, pan with space or the middle button or the wheel, zoom with ⌘ and the
wheel (which is what a pinch arrives as), fit with ⌘0. What is picked has handles: eight to
resize, a stem to rotate, the two ends of a line. Shapes are dragged out; text is placed with a
click and edited where it sits; the pen draws; the page's own corner drags the surface's size.
Pictures come from the Assets panel — dragged onto the surface, or clicked into the middle — and
land fitted to half the page. Arrows nudge, ⌘D duplicates, ⌫ removes, Escape climbs out.

Three things that mattered in the building:

- **It draws with the compiler's function.** `freeformLayersSvg` is the same markup the canvas
  shows and the render rasterises; the editor lays handles over it in the same coordinate space.
  A second drawing of the recipe for editing would be a second thing to keep honest.
- **Resizing a rotated thing** has to anchor the opposite side where it is on screen. Done in the
  layer's own frame — the pointer unrotated about the centre, the box rebuilt there — and then
  shifted by however far the anchor moved when the centre did. Without the shift a rotated box
  walks away from the handle on the other side.
- **Text has no height in the recipe.** It is however tall the words wrap to, so the editor
  measures the rendered `foreignObject` and passes that in, and text gets side handles only. A
  guessed height would put the rotation stem in the wrong place on every heading.

The app yields its keyboard while the workspace is open — saving and exporting stay — so arrows
and Delete mean the layer and not the block. And rotation joined the recipe as one number per
layer, about the centre of its unrotated box, so the hash and the picture follow it.

One more, found when the text would not open: `preventDefault()` on `pointerdown` — needed so a
drag does not select text — also stops the browser from ever dispatching `dblclick`. The editor
reads two presses on the same text within a beat itself. The same trap is waiting for any
pointer-driven surface that also wants a double-click.

### 3.68 A canvas you fall into

**Jared, 2026-09-13:** "love how you double click into freeform blocks give it a zoom in effect and
make the freeform canvas feel more like a figjam style canvas. make it fun and playful." And, while
it was being built: keep the canvas's layers out of the panel until you are in it; give text playful,
experimental styles with a category of their own; group drawing strokes automatically; make copy and
paste inside the canvas its own thing; let the page's height be dragged too.

**The zoom.** The canvas is an overlay above the email now, not a replacement for it. It measures
where the block's picture sits on the email, opens with the page exactly there at exactly that size,
and flies out to fit with a small overshoot while a warm dotted field fades in; Done flies it home.
Because the email is still drawn underneath, the first and last frames of the flight *are* the email,
which is what makes it read as zooming in rather than switching screens. The zoom moves in log space,
so 30% to 200% does not rush its start, and the page is filled with the ground the picture sits on,
so nothing changes colour at either end. `prefers-reduced-motion` skips the flight.

**FigJam's shape.** Floating chrome on a light field whatever the app's theme: a dock of chunky
tools at the bottom (select, hand, note, box, ellipse, line, marker, text, stamp), a colour swatch
that opens palette and note colours, pills at the top for the way back and the zoom. The picked tool
lifts and wiggles; layers pop in on a spring and poof out before a delete commits. The motion uses
the individual `scale` property, because CSS `transform` on an SVG element replaces its transform
attribute and would snap a rotated layer straight for the length of the animation.

**Two new layer kinds, both real.** Sticky notes: note colours as hex (a design system has no reason
to carry a sticky-note yellow), words in a type role, and a soft offset shadow drawn as a second
shape rather than a filter, so the render has nothing to approximate. Stamps: the bundled brand marks
nested as an SVG in their colour, with a few degrees of tilt each time. The tilt is chosen by the
editor and stored in the layer, so the recipe, the hash and the picture stay exact.

**Canvas type.** A category of its own in the Design panel, because it follows none of the email's
rules: it ships inside a picture. Marker (wobbling italic), Sticker (a white border), Outline,
Retro (a hard shadow), Highlighter and Arc, each with font, size, weight, case, tracking, colour, an
effect colour and an amount. Every effect is something a picture carries exactly: a stroke, a shadow
or a gradient in CSS inside the `foreignObject`; per-letter transforms for the wobble, computed from
the letter's index rather than chance; an SVG `textPath` for the arc. The sticker's border is a ring
of sixteen hard shadows, because a stroke drawn *outside* the letters is not something every engine
agrees on. The chips in the panel and in the canvas's text tray are drawn by the canvas renderer, so
the sample is the picture.

**Drawings group themselves.** Every stroke of one marker session shares a group. A click on any
stroke picks the drawing; it moves, scales by its box, colours, copies and deletes as one; the layer
list shows it as one foldable row. Alt picks a single stroke; a group can be undone into strokes.

**The canvas's own clipboard.** Copy, cut and paste are caught in the capture phase on the document
while the canvas is open and stopped there, so the email's own clipboard handlers never hear them, and
the email's clipboard handler refuses to act while the canvas is open besides. Focus is moved out of
the email's frame on the way in, because a double-click leaves it there and the frame's own copy event
would otherwise go to the block. Layers travel as their own clipboard text with their own marker, and
each paste steps further out, the way a design tool pastes.

**The page.** Its right edge drags the width, its bottom edge the height, its corner both, with the
size shown under the corner.

**A drawing inherits where it is drawn.** The first note rendered left-aligned on the canvas and
centred in the email, because its words stated a font and a size but not an alignment, and inside the
email the drawing sits in a cell that centres its content. `foreignObject` content takes CSS from the
document around the SVG, which is a different document on the canvas, in the email and in the render.
Every text property a layer's words depend on is stated now, so all three draw the same picture.

**The panel.** On the email, a freeform block shows *Open canvas* and a line of facts, plus its
alt text, render, appearance and spacing. The layer list, the page size and the background appear
only inside the canvas. The email canvas no longer edits a freeform block's layers at all; a drag on
it moves the block.


### 3.69 A newer time is not another author

*2026-09-18.* Jared: "I keep getting 'someone else has made changes' not allowing my changes to be saved. I know
this is a safety net. but i'm also the only one editing the files. unless google drives file sync is causing
that."

It was. The save refused to write when the file's modification time was later than the time of this editor's
last save (architecture.md §1), and Drive for desktop rewrites that time once an upload lands, a few seconds after
the save. So a lone designer in a synced folder saw a conflict on the second keystroke, and because the editor's
own time never moved, on every keystroke after. Two things were wrong, and both are fixed.

**The time alone decided.** A later time says the file was touched, not that someone else wrote it. Now, when the
time has moved, the save reads what is on disk and compares it with the template as this editor last read or
wrote it (`sameTemplate`: both read the way a file is read, keys sorted, so spacing and order do not count). The
same template under a new time is nobody else's work; the save goes ahead and takes the new time. Only a
different template on disk is refused.

**A refusal was a wall.** The banner offered Dismiss and advice. It now offers the two things a person can mean:
*Save anyway*, which writes this editor's version over the folder's (a save with no check), and *Reload theirs*,
which drops this editor's version for the file as it is and binds to it again. A safety net has to have a door
in it, or people learn to work around it, which is the one thing worse than last-writer-wins.

### 3.70 The pictures travel with the template

*2026-09-18.* Jared: "is there a way to export a email template that includes local images used to be uploaded to
hubspot."

There was not. Export refused while any picture was a file in the project's `assets/` folder (`local-image`), and the
route was by hand: upload the picture to HubSpot Files, paste the hosted URL into the block, export. Inline data
URLs are no answer; Gmail and Outlook strip them.

**HubSpot hosts the pictures beside the template.** A coded template in Design Manager may say
`{{ get_asset_url('./images/hero.png') }}` for a file uploaded next to it, and HubSpot turns that into a CDN address
when the email renders. So an export whose template shows local pictures is now a folder, `exports/<slug>/`: the
template, an `images/` folder with the pictures it shows (rendered freeform pictures included), and a README with
the two ways up, the folder dropped into Design Manager whole, or `hs upload <slug> @hubspot/emails/<slug>`. A
template whose pictures are all hosted exports as the single file it always did. With no folder to write into,
the same package downloads as one zip, written by us, stored not compressed, forty lines and no dependency
(`model/zip.ts`).

**Two places a picture hides** (`model/export-package.ts`). An `<img src>`, and the default of a HubSpot module:
an editable image compiles to `{% module "image" path="@hubspot/image_email", img={ "src": "photos/hero.png" } %}`,
and the picker in HubSpot shows that default until someone picks another. The first pass packed only the `<img>`
form, and the check had never looked inside module tags either, so a board-added picture went out as a local name
with the checks passing. Both places are found by one function now, which the check and the package share. In
an attribute the call is printed as `{{ get_asset_url(...) }}`; inside a module tag, where the value is an
expression, it stands unquoted where the string was. That second form is the one thing to watch on the first
real upload: HubL evaluates tag parameters as expressions, and the call should resolve there, but it has not yet
been seen resolving in a live account.

**The check reads the export as it would go.** `local-image` used to fire for any local name. Now the app
checks the packed HTML, so the rule speaks only of a picture the folder cannot supply, with the fix that follows:
put it under `assets/`, or paste a hosted URL. A safety net should name the thing that is actually wrong.

### 3.71 The system's blocks are the plain blocks, arranged

*2026-09-18.* Jared: "only use the templates when you create a new email like the blank and card emails. When you
first open the template studio you can either open a folder or create new. Keep v1 standard. But let's create a new
one based off of the switchyards email design system. add any of the design systems components that could be used
as blocks. like the multiple footer or masthead options."

**Opening on a choice, not on an email.** The app opened on the standard email, so every first visit began with
somebody else's send and a decision about whether to delete it. It opens now on a Welcome screen (`app/Welcome.tsx`)
over an untouched blank: open a folder, reopen the remembered one, or start from a starter. With a folder open and
no file chosen, the same screen lists the folder's emails. The blank underneath is not kept as a draft until a
choice is made, or the screen would never show twice. A file opened, a starter picked, or Skip, and it goes.

**The Switchyards email system, as tokens and blocks** (`model/switchyards.ts`, after the design system of
2026-09-18). Three colours, Helvetica, 18 on 26, a 620 breakpoint; the outline and solid buttons as the two button
roles, full width as the block's alignment. Every component of the system is built from the blocks the app already
has, on the template's own design system: a header is the top bar on the navy preset over a 6px red stripe; the
Callout is a heading and a line in a column with a navy fill and 8px corners; the sign-off is the copy and the
drawing; the hero and the stamp are image modules the team fills in HubSpot. The palette shows
them as a Switchyards group and places each as sections at the end, cloned in with fresh ids and field names, the
way a pattern is. No block type was added for any of it, so every piece keeps the inspector it already had.

**Two things the plain blocks could not say.** A column can now be filled (`Column.fill`), painted with its box
and taking its corners, which is what a card is. And the legal footer has four layouts beside the classic one
(`LegalBlock.layout`; `compile/blocks/legal.ts`): masthead, ledger, stub and letterhead, one anatomy in four
arrangements, drawn with hairlines in the section's ink, carrying the same HubSpot tokens in every one. Classic
compiles byte for byte as before; the contract test is the proof.

**Two starters from it**: the standard send and the short send, in the system's order. The v1 standard email
stays as a starter, named for what it is. What is not hosted anywhere yet, the cream lockup for the lockup bar, is
an image the team picks in HubSpot, and the block's summary names the file, rather than a guess at a URL.

*Same day.* The letterhead is two blocks, a header and a footer, with the letter between them; it had been built
as one footer. And the palette lost what it did not need: the two headers, which open the starters and are not
for placing mid-email, and Details, Schedule, the inset and the pair, which are a paragraph or an image with a
particular content.

### 3.72 HubSpot asks for the body by name

*2026-09-18.* Jared: "If an email has body text make sure you give it email_body - I get an error in hubspot 'The
template does not contain the module email_body, it will not work for blog/rss emails'."

HubSpot looks for a module named `email_body` in every email template. Without one it warns at upload, and blog
and RSS emails, which pour the post into that module, cannot use the template. Ours named every rich text field
for its label, so a template's main body was `body` or `first_paragraph` and never the name HubSpot wanted.

**The first body a template gets is `email_body`** (`ids.ts`, `bodyFieldName`). The palette's Text block, the
Switchyards starters' first paragraph and the card email's intro all take it; the next body in the same template
is named for its label as before, since the name can only be held once. A drag and drop area is already named
`email_body`, and counts.

**A check says when it is missing** (`email-body`, a warning): a template with bodies and no field of that name,
which is every template made before this rule. A field's name is fixed once created (learnings 1.10), so the
inspector offers the one rename it ever will, *Name it email_body*, beside the name of a Text block's field while
no field has the name yet; its hover text says why it belongs before the first upload. The v1 standard email keeps
its names, which existing emails are bound to, and carries the warning instead; the contract test is unchanged.

### 3.73 The footer's note, its socials, and a band that reaches the window

*2026-09-18.* Jared: "allow html in the note section of the legal footers. Where the site input is. make that social
sites: instagram, youtube, linkedin. give footers and top bars the option to be fullwidth of the window."

- **The note takes HTML.** It took friendly text (`**bold**`, `[a link](url)`, a line break per line) and escaped
  everything else, so a footer could not carry a written-out link. Now text that is already markup is used as it
  is, and plain text keeps the friendly forms (`noteHtml`). The inspector's box is the HTML kind, six rows.
- **Three social links in place of the site.** Instagram, YouTube, LinkedIn, each a URL, named by the network in
  the footer's small type: a line of their own under the notice in the masthead and letterhead, rows in the
  ledger's index, after the legal links in the stub. Only the ones set are drawn. The Switchyards presets carry
  Instagram; the other two are blank until someone knows the addresses, rather than guessed.
- **Full width.** The section already knew how to let its band run to the window's edge (`bleed`), from the days
  the parity test needed v1's shape. It is a switch now, on the blocks that draw their own band: the top bar, the
  stripes and the footer, in their Spacing (or Width) panel. The column stays at the email's width; only the colour
  behind it widens, in Outlook too, whose band table goes to 100%. Gmail's apps keep their own inset around every
  message, which the switch's hover text admits.

### 3.74 An audit, and what it took out

*2026-09-19.* Jared asked for an audit, then: "Remove the partykit. add a confirmation to delete from a board when
using backspace. anything you can do about the 22 suppressed hook dependency? if any of the unused locals are truly
not needed or used, clean them up. fix the drag plumbing. do what is best for the repo hygiene."

- **PartyKit is gone.** It never ran for anyone: presence needed a deployed host nobody set up. The server, the
  hook, the config, the cursors on the board, the Together menu, the scripts and the dependency, about six hundred
  lines. The folder was always the truth; it still is.
- **Backspace asks first.** The first press names the file and asks; a second press on the same card within five
  seconds removes it, and Undo still puts it back. Escape, another card, or waiting lets it go. The × on the card
  is a click on a control and stays direct.
- **The 22 suppressed hook warnings are 0.** None was fixed by adding a dependency and hoping. Pure helpers moved
  to module scope; helpers that read refs became `useCallback`s and joined the lists; keyboard and clipboard
  handlers are made every render and read through one ref by a subscription bound once; the callbacks a parent
  rebuilds every render are read the same way. The Preview keeps its measuring helpers in one `live` ref for the
  same reason. Every list now says only what the effect responds to, and nothing runs more or less often than
  before.
- **Unused code went**: eight imports and locals the compiler could prove, four exports nothing referenced, a
  parameter the template parser never read.
- **The palette drag is back on.** It was hidden as "not working". Driven with synthetic pointer events it works
  end to end, ghost, drop line and landing; the cards already refuse touch scrolling. What was added is a
  `pointercancel` handler, so a finger the browser reclaims lets the drag go instead of leaving it armed. If it
  still fails in a hand, the report needs to say what is seen.
- **The built files are no longer tracked.** The Pages workflow builds Template Studio before it uploads, so a
  stale `dist` can no longer ship by being forgotten. Locally it is still made by `npm run build`. The unreferenced
  GIFs and a stock photo in the sample templates folder are gone.

### 3.75 The board shows a frame as it is now

*2026-09-19.* Jared: "I have a frame with edits on it being used in an email. but the email does not show the
correct frame preview."

- **What was stale.** An email that follows a frame carries its own copy of the drawing, and only Template Studio
  brought that copy up to the frame, while it was open. The board compiled the email file as saved, so a frame
  edited after the email's last save showed on the frame's card as it is and on the email's card as it was.
- **The board follows first.** Before it compiles an email for its card, the board brings every linked block up
  to the project's frame files (`followFrames`, `model/freeform-link.ts`, the same step Studio takes on every
  change it hears). The email cache is keyed by the frames' hashes as well as the file's own time, so editing a
  frame reads the emails that follow it again, on the next look. The file on disk is not touched: it is brought up
  when Studio next saves it, or when the board next writes it for a drop, as before.
- **Prints, too.** The email's card drew a page with effects flat, while the frame's card printed it. The board
  now prints every page with effects it can see, in frames and in emails, one print per recipe on one ground, and
  swaps each into the email's preview with `withPrints` (the canvas's own helper). A followed riso frame is one
  print shared by the frame's card and every email that follows it.
- **A leftover.** The two-argument `parse(fileName, text)` that the conflict-guard change made one-argument still
  had one caller, in the files-only workspace; the build did not run before the last report. It does now.

### 3.76 Four small ones from the list

*2026-09-19.* Jared: "start working down the list."

- **Freeform's back arrow.** The board sends `&from=board` with the frame it opens or the new one it asks for,
  and the canvas keeps that for the tab (`scuggnizzi.freeform.from-board`, its own key, so a Freeform tab that
  Template Studio opened is not confused by Studio's flag). The pill reads "← Board" and goes to `project.html`;
  opened any other way it reads "← Tools" as before. The same shape as Studio's arrow (3.6x).
- **"saved" after a delete.** Deleting the open file left the editor in its `clean` state with no file, and the
  badge's fallback word for `clean` was "saved". A document with no file now says "not in a file", with the
  reason in its title. The same badge shows for a new email before its first change, which is also true of it.
- **Prints let go.** The board printed every page with effects it saw and kept every print for the life of the
  page. Now prints nothing asks for any more are dropped when the wanted set is worked out, before the missing
  ones are made.
- **Thumbnails.** The Assets panel's pictures and the Inspector's frame print are `draggable={false}`: the
  pointer drag is the drag, and the browser's own image drag only ever carried a picture into another window.

### 3.77 "Deleted", and the file stayed

*2026-09-19.* Found while checking 3.76's badge: the Files panel's × said "Deleted Follows a frame", the badge said
"not in a file", and the row was still there, with the file.

- **What happened.** A template at the top of a project folder (a plain-folder habit, or one made before `.scug/`)
  is listed from there. Its first save in Template Studio went to `.scug/templates/`, where every tool writes now,
  and left the original at the top: a copy, not a move. The panel shows a name once, the first place winning, so
  nobody saw two. Delete removed the first it found, the copy in `.scug/templates/`, and the original at the top
  came back into view, with the old content. The board's Delete did the same by path.
- **Save moves.** `writeTemplate` now looks for the file in the places `list` walks, in `list`'s order, so the
  first found is the one the panel showed and the editor read. The conflict guard reads that file, not the empty
  place the write is going to (before, a template being moved had no guard at all on its first save). After the
  write, a shown copy that sat somewhere else is removed. Other copies hidden behind the name are left alone by a
  save: an invisible file with different content is not something a save should quietly discard.
- **Delete takes every copy.** Studio's `deleteTemplate` and the board's Delete remove the name from every place
  it is in, and Undo writes back the one the panel showed. "Everything the panel offered can be deleted" now also
  means it stays deleted.
- **A fake folder for the workspace.** `tests/workspace-folder.test.ts` runs the real `folderWorkspace` over plain
  objects standing in for directory and file handles: where a save lands, which copy the guard reads, what a delete
  removes. The first test of the folder workspace's writes at all; `list` had been tested only through the app.

### 3.78 Three files, split along their seams

*2026-09-19.* The last item on the day's list: App.tsx, Board.tsx and Surface.tsx were each around two thousand
lines or more. A quiet pass, nothing else in flight, and no behaviour changed.

- **What moved, and where.** Only what already stood at module level, or was a self-contained stretch of one
  component. From Board.tsx: the file-reading hook and the shapes it returns (`project/files.ts`), the card
  bodies (`project/cards.tsx`), the two popovers (`project/menus.tsx`), and the small pure helpers
  (`project/board-helpers.ts`). From App.tsx: the starters (`app/starters-list.ts`), the recent-blocks memory
  (`app/recent-blocks.ts`), the inbox frame and save badge (`app/app-chrome.tsx`), and two hooks cut from the
  component: `usePrints` (pages with effects, printed for the canvas) and `useDraftKeeping` (the email kept in
  the browser with no folder). From Surface.tsx: its tools, glyphs, drag shapes, constants and drawing helpers
  (`app/surface-tools.tsx`).
- **How.** Text sliced at markers, `export` added to the moved declarations, and every file's imports
  recomputed from what its body names. The two things that fooled the recomputation are worth writing down: a
  name used only after a spread (`...defaultsOf(x)`) was taken for unused, and a word in a comment or string
  ("Template Studio", "View only") was taken for a use. `tsc --noUnusedLocals` caught the second kind; the
  first kind the ordinary build caught. Both fixed by hand.
- **What did not move.** The bulk of each component: App's patterns, design systems, clipboard and keyboard;
  the board's view, selection, groups and drawing; the surface's pointer and its own controls. Each closes over
  dozens of locals, and cutting those into hooks would mean threading state through props for no change in
  behaviour. They can go later, one at a time, when something in them has to change anyway.
- **Sizes.** App.tsx 2420 → 2200, Board.tsx 2345 → 1748, Surface.tsx 1936 → 1803; twelve new files, none over
  240 lines.

### 3.79 Files first, and a picture dropped into the email

*2026-09-19.* Jared: "in template studio make the files the index screen and move files above blocks. allow the
ability to drag an asset into the email and it creates the container needed for it."

- **Files is where a session starts.** The rail reads Files, Blocks, Layers, Assets, Design, and Template Studio
  opens on Files (it opened on Layers). Closing Design goes back to Files when nothing else was chosen.
- **A picture from Assets lands as an Image block.** The panel's pointer drag, which until now only carried a
  picture onto an open Freeform surface, goes to the email through the palette's own plumbing: the same ghost
  (the picture itself, small), the same drop line, the same `DropSpot` → place reading. Dropped beside a block
  it joins that block's column at that index; dropped on a section edge or at the end it gets a section, row and
  column of its own, made by `insertBlocksAt` the way a pasted block's is. `model/place-picture.ts` is the pure
  part, tested: the block, its fresh id and field name, where it lands, and a first alt text read off the file
  name ("photos/team-photo_2.jpg" → "team photo 2"), to be written properly in the Inspector.
- **A click still fills the selected Image**, and with no Image selected it adds one at the end, as a palette
  card does. The press that moved suppresses the click the button fires afterwards, so a drag is one gesture.
- **The kinds.** `PaletteKind` stayed the palette's own; `DragKind` is what the drop plumbing carries, one
  member wider. Widening `PaletteKind` itself broke the palette's narrowing in four places, which is the
  compiler saying the two were never the same thing.

### 3.80 Five follow-ups

*2026-09-19.* Jared: "run through each of these", the list after Files-first.

- **The Files panel says "2 copies".** `list` counts the places a name is in (`TemplateFile.copies`), and a row held
  in more than one place gets a small warning chip that is also the fix: `tidyTemplate` removes every copy but the
  one shown, says where each was, and Undo writes them back. A save moves only the copy it was reading (3.77);
  this is how the folders that already have hidden copies get clean, one click each.
- **A picture dropped on an Image replaces it.** The canvas resolves the middle band of a block to
  `{ at: 'block', onto: true }` only for blocks the app names in the new `onto` prop, the Image blocks while a
  picture is carried, and boxes the block instead of drawing a line beside it. `replacePicture` (place-picture.ts)
  swaps the src and writes an alt text only when the block had none. Every other drag sees before and after as it
  did.
- **Edit in Freeform stays in the tab.** Studio writes the last keystrokes (`saveNow` now resolves once written),
  then goes to `freeform.html?frame=…&from=studio&back=<file>`. The canvas keeps where it came from
  (`scuggnizzi.freeform.back`: board, or that email in Studio) and its arrow reads "← Board" or "← Studio".
  `?open=` alone no longer means "from the board" in Studio, since it is also how the canvas returns; the board
  sends `from=board` with it.
- **The board re-reads an email only for the frames it follows.** The cache key is the hashes of those frames, not
  of every frame in the project.
- **`useAppFrames`.** The Freeform-frames stretch of App: the frames read from storage and on every storage event,
  the app's kept pictures, and the follow effect. App.tsx is around 2,200 lines; the rest waits for a reason.

### 3.81 The board bar's glyphs, drawn

*2026-09-19.* Jared: "the toolbars icons are not aligned."

- **They were characters.** The arrow before Tools, the minus and plus of the zoom, the caret on the project name
  and the plus before each Add verb were typed from the text face. Each sat where its font put it: the minus and
  plus on the maths axis, the caret and arrow wherever Helvetica draws them, and every button's text nudged 2px
  down by a 8/4 padding meant to centre cap height. Words survived that; symbols did not.
- **Now they are 12px strokes** (`project/glyphs.tsx`: ArrowLeft, Plus, Minus, Chevron), centred by flex like
  any other child, so a glyph and the word beside it share a line. The buttons' nudge is 1px (padding 7/5), which
  puts the x-height on the bar's middle; measured, every control's text and glyph centres are within half a pixel
  of it. The zoom steps are 26px squares with the glyph dead centre; the figure between keeps the text rule. The
  Add kicker sits on the buttons' line rather than 2px above it.

### 3.82 The board, six small things

*2026-09-19.* Jared: "run through all of these", the suggestions after the bar was aligned; and, from the Canvas
menu, "dont forget to clean up the alignment of these dropdown menu buttons across the whole project."

- **The bar is shorter.** The uppercase Add label is gone; the five plus verbs sit between two hairlines and read
  as a group on their own. Fit moved into the zoom group as a glyph (four corners), and Selection joined it (a
  card in a window): the selected card fills the window, ⇧2, the same view a double-click gives before it opens
  the tool. Glyphs rather than words because with the words the bar overflowed an 800px window.
- **The status line is a state.** "Saves to Delete test", not "Saving into". The hint beside it is one line for
  the moment: a card selected gets the open, zoom, copy and delete keys; nothing selected gets arranging, dropping
  and panning, and a pointer to `?`.
- **Pictures carry their names**, in mono under the card, always; the title bar still comes on hover.
- **`?` opens a keys sheet**, paper and one hairline like the board's popovers, listing every key `onKey` answers
  to. The list sits beside the handler in Board.tsx so the two stay one.
- **The ground fades as the board zooms out**: all of its opacity from 60% up, down to about a third by 35%
  (`groundFade`, ground.ts, tested). The Opacity dial still sets the ceiling.
- **The same nudge, everywhere.** The Canvas menu's segmented control (Off · Lines · Dots · Mat) had 5/1 padding
  in a 22px box, the project menu's rows 11/7 in 36px: each put the text 2px low, the same habit the bar had.
  Both now centre the line box with a 1px nudge, like the bar's controls. Every other control in the two
  stylesheets was checked: the rest centre by flex or pad evenly.

### 3.83 Notes on the board

*2026-09-19.* Jared: "let's add a 'notes' feature to the project board. so editor notes can be left next to
objects."

- **A note is the board's.** `BoardNote` in board.json (model/project.ts): its words, where it sits, its colour,
  when it was written, and the card it is left on. In the project folder, so everyone who opens it reads them;
  boards written before notes read as boards with none.
- **Left on a card, it goes with it.** `moveCard` moves the notes on a card by the card's own distance, so a drag,
  a group ride and Undo all carry them; Tidy shifts them by where their card went. A card whose file goes leaves
  its note where it was, on its own (`forgetCard`). A dashed hairline joins a note to its card, drawn in the links
  layer, quieter than a link between files.
- **Leaving one.** + Note, or N: on the selected card, to its right; otherwise in the middle of the window. The
  field opens at once; Escape drops the edit, ⌘Enter or a click away keeps it; a note left empty goes as if it had
  not been. Double-click, or Enter on a selected note, writes again. Four paper colours on hover, Delete, and every
  change is one undo step.
- **Its own drag.** The note handles its pointer with capture and stops the event, so the stage under it starts
  neither a pan nor a marquee; its text field stops keys, so the board's keys stay out of the words. While a card
  is carried, the notes on it are drawn riding along before the drop writes them.
- **Not done.** Notes are not resized (200px wide, as tall as their words), carry no author (the folder has no
  idea who is who), and do not ride with a group they sit in unless they are on a card that does.

### 3.84 What a note's colour says, and the section it is about

*2026-09-19.* Jared: "notes, colors, a purpose. yellow idea, green, move forward with; red, stop before continuing.
And is there a way to link a note to an email, specifically a section in that email?"

- **Four kinds, not four colours.** `NOTE_KINDS`: Note on plain paper, Idea on yellow, Go on green, Stop on red.
  The swatches say what they mean in their titles, the note wears the word in its strip, and Undo says "Mark a
  note Stop". The stored field is still `color`, an index into the kinds.
- **A note points at a section.** On an email, the note gets an "on" row: the whole email, or one of its sections
  named for what it holds ("3. Heading: Big news: we're opening 2 more…", "6. Footer"; `sectionLabels`). The email
  card measures where each section lies as it lays out (`sectionSpans`, from the `data-sy-section` marks the
  preview already carries) and tells the board, which scales the span to the card. Picking a section moves the
  note level with it, the tether ends at it, and while the note is picked the section is boxed on the card. A
  card that goes takes the section with it; the note keeps its words.
- **Not in Template Studio yet.** The natural next step is for Studio to show an email's notes beside their
  sections, read from board.json, so the editor sees "Stop" where the stop is. Not built; the board is where notes
  live today.

### 3.85 Notes, second pass: the section first, a pin, and Template Studio

*2026-09-19.* Jared: "allow me to choose the 'on' for the note before I add text. right now it closes out if I
try to choose. as I hover over the section options outline them in the email. the timestamp doesnt always render
right. now make the way to view them in the template studio." And: "is there a way to add a note to a section
after the note has been created. drag a node from the note directly to a section?"

- **The edit ends when focus leaves the note, not the field.** The field's blur was the end of the edit, so the
  first click on the section list, or a kind, closed a new empty note and threw it away. Now the note listens for
  `focusout` and ignores focus moving within itself; the list and the swatches hand focus back to the field when
  they are done, and only focus leaving the note ends the edit, with the field's words whether or not it had focus
  at that moment.
- **The section list is its own list**, not a `<select>`: the pointer passing over an entry outlines that section
  on the email, dashed, through the same mark the picked note draws solid. A native select cannot say where the
  pointer is.
- **A pin.** A dot at the note's left edge. Dragged onto a card it pins the note there; onto a section of an email,
  to that section, with the card lit and the section outlined as it passes; let go on the paper, the note is
  unpinned. A line follows the pointer from the note meanwhile. The note stays where it is: the pin is about what
  the note is about, not where it sits.
- **"10 min", not "10 min ago" wrapped.** The strip is 200px less the swatches, and the long form broke onto two
  lines. `agoShort`: now, 3 min, 2 h, 5 d, then the date; and the strip does not wrap.
- **Template Studio reads them.** `useBoardNotes` reads board.json from the open folder for the open email, on
  focus and every few seconds, the way the board watches. A "Notes 3" toggle in the tools row opens a rail beside
  the canvas: each note as it looks on the board, with the section it is about. The pointer over a note outlines
  its section on the canvas (an inline outline on the section's cells, taken off again); a click selects the
  section and brings it into view. Writing stays on the board, one line away.

### 3.86 Resolved, a note you can move at once, and Tidy as families

*2026-09-19.* Jared: "Maybe a final state of 'resolved' for the notes. and that can be changed in the template
studio and canvas. one usability note, when you create a new note allow the user to move it. currently that is
my instinct to adjust where it gets placed (place close to the pointer by default). trying to drag it before
typing makes it go away. refine the tidy feature. it should bring all linked items close to each other in an
organized way with clear hierarchy."

- **Resolved.** `resolvedAt` on the note, 0 while open. A tick in the note's tools on the board, and on each card
  in Studio's rail; resolved notes grey and step back, say "Resolved · 2 h", and sort last in the rail. The footer
  and the rail's badge count open notes. Studio writes it by reading board.json again and writing it back with that
  one note changed, so nothing else on the board is touched; the board reads the change on its next look.
- **A new note moves at once.** It lands by the pointer when the pointer is over the board (beside the selected
  card when there is one, the middle of the window otherwise), and its strip can be dragged while the field is
  open: the press on the strip prevents its default, so focus stays in the field and the edit does not end, which
  is what had made a dragged new note vanish.
- **Tidy lays out families.** Each email is a cluster: the email at the left, the frames it follows in a column
  beside it, the pictures the email and those frames show in a column beyond, with what those pictures were made
  from after them. Clusters run in rows, emails by name. Below them, what no email holds: documents, frames and
  pictures on their own, and pictures filed in folders, which stay in their groups, since a group is drawn around
  its members and a filed picture placed beside an email would stretch its group across the board. Notes ride
  with their cards as before. Tested on a nine-card folder.

### 3.87 Tidy on the grid, and where a note's controls sit

*2026-09-19.* Jared: "for tidy, use the grid system to lock everything into a nicely spaced grid. make the grid
option on by default. The check to resolve on the note is in a strange spot. change the x to 'delete' that hovers
outside of the note in the bottom right. and the resolved to the top right of the note."

- **Tidy takes the grid step.** Every edge it places lands on a multiple of the step (24px by default), and every
  gap is the usual one rounded up to it: the next column starts on the grid line after the card and a gap, the next
  row on the grid line after the tallest card and a lane. The lanes below the families follow the same rule, one
  per kind. Folders come from `layoutBoard` as before and are then moved as one onto the grid, their pictures
  re-seated on it inside (a group's padding is 28px, so a picture at the group's padding was 4px off; the test
  caught it), and the group grown to hold them. `step` defaults to 1, so the older tests, and a board with no
  settings, tidy as before.
- **Snap to grid is on by default.** For a browser that has already saved its canvas settings, the saved value
  stands; the default reaches new ones.
- **The note's tick is at the top right**, after the kind swatches, where a done mark is looked for. Delete is a
  small word just outside the note's bottom right corner, shown on hover, so it is never taken for one of the
  note's own controls and never sits beside the tick.

### 3.88 A bin, and replies

*2026-09-19.* Jared: "change delete to a trashcan icon. add a way to reply to the notes."

- **Delete is a bin.** The word outside the note's corner became the `Trash` glyph (glyphs.tsx), the same 12px
  stroke as the bar's; the word stays in the title and the label.
- **A thread under a note.** `NoteReply { id, text, at }` in `replies`, oldest first; `addReply` and `removeReply`
  on the model, read back checked (a blank reply, one without an id, a repeated id are dropped). On the board the
  thread sits under the words with a hairline above it, each reply a small block with its time and, on hover, its
  own bin; a quiet "Reply" opens a field, Enter sends, Shift+Enter breaks the line, Escape drops it. Template
  Studio's rail shows the thread under each note and has the same Reply, written the same way as resolving: the
  file read again, one note changed, written back. Both sides undo on the board; Studio's writes are the board's
  next look.
- **No author.** A reply has a time and words. The folder does not know who is who, and a name typed once and
  saved in one browser would be a guess about the next. When there is a way to know, replies have a place for it.

*Later the same day.* Jared: "make the reply at the bottom of the note. and lets make the delete just a text like
the reply at the bottom right of the note." The bin outside the corner lasted an hour. The note's foot is now a row
of two quiet words, Reply at the left and Delete at the right, inside the note; the bin stays on each reply, where
a word would crowd the line. Two controls that do the same kind of thing should look the same, and a verb outside
the thing it acts on reads as belonging to something else.

*And later still.* Jared: "make it 'delete note'. and only show it once the note has been clicked on. I don't love
how the input has the outline when editing the note." So: "Delete note", shown only on the picked note, with Reply
always there; and the note's field and the reply field have no focus ring. The board's ring (`.pb-app :focus-visible`)
had been drawing a rounded box around the words, since a textarea's own `outline: none` loses to `:focus-visible`;
the field is the note, and a ring around the words said "form" where the paper said "note".

### 3.89 Writing, the first pass

*2026-09-19.* Jared: "in the template studio its not very dialed in when using the '/' command to make something
bold or a paragraph. sometimes text box takes on whatever style i'm trying to add. I like the way notion handles
writing with a sudo markdown feel." Then: "start with the first list."

- **Why the whole block took the style.** Opening a block for editing selected all of its text, so the first thing
  reached for, ⌘B or a menu row, landed on everything. Now the caret goes where the double-click was
  (`caretRangeFromPoint`, with Firefox's `caretPositionFromPoint` as the fallback), and to the end when the edit
  opens another way.
- **A mark goes on words.** With nothing selected, bold, italic, underline, strike, sub, sup, code, small, link and
  clear take the word at the caret (`selectWordAtCaret`), never the block, and do nothing when the caret is between
  words. `wrapInline` used to take the whole block when nothing was selected; that is gone.
- **The menu in halves.** Turn into (paragraph, headings, lists, quote, rule) and Style (the marks) are two groups
  with names, and the row for what the paragraph already is comes ticked (`turnIdOf` on the caret's block, read when
  the menu opens and carried in its state). Single-line fields still get neither, as before.
- **A bar over a selection.** While rich text is edited and words are selected, a small bar sits above them: B, I,
  U, S, Link, Clear, each lit when the words already wear it (`queryCommandState`, and the nearest `<a>` for links).
  It follows `selectionchange` inside the frame and holds its own mousedown so the selection stays. The hint under
  the block now says "select for styles".
- **Markdown finished inline.** `**bold**`, `*italic*`, `_italic_`, `` `code` ``, `~~struck~~` and `[words](address)`
  convert the moment the closing mark is typed (`inlineMarkdown`, pure and tested, then `inlineMarkdownAfterInput`):
  the marks come out, the words take the style, and the caret goes on after them plain, the typing state turned
  off, so the next word is not bold too. A lone `*` in arithmetic and an `_` in a name are left alone.
- **Two things the browser taught.** A command run inside the `input` event of the browser's own editing command is
  refused, so the inline conversion runs a tick later. And a caret left at the end of an inline run is taken back
  into the run by the next key, so after code or a link the caret stands on a zero-width space after the run, which
  `fromContentEditable` strips on the way out; bold, italic and strike also get their typing state turned off.
- **⌘B, ⌘I and ⌘U** go through the editor's own hands now, not the browser's, so at a caret they take the word.
- **Still `execCommand` underneath.** Every one of these rides the browser's editor, so this is the pass that stops
  the hurt, not the one that makes the model ours. That one (3.88's note on a shared text model) is next.
