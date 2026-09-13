# assets

Images the Assets panel lists. Drop PNG, JPG, GIF, WebP, SVG or AVIF files here and they appear in
the sidebar with a thumbnail.

**A file name is not a URL.** Clicking an asset writes its *name* into the image block, which the
canvas resolves to a local blob so you can design against the real picture at the real size. Nothing
else can resolve it — so `Checks` reports `local-image` and refuses the export until you upload the
file to HubSpot Files and paste that URL over the name.

That is the intended order of work, not a limitation to route around: design with the real pictures,
then swap them for hosted URLs once the layout is settled.
