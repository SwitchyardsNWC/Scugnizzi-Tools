// The export package: a template and the pictures it shows, packed to go to HubSpot together.
//
// Jared: "is there a way to export a email template that includes local images used to be uploaded to hubspot."
// An email client needs an address it can fetch, and a picture in the project's assets folder is not one. HubSpot
// will host the pictures beside the template, though: a coded template in Design Manager may say
// `{{ get_asset_url('./images/hero.png') }}` for a file uploaded next to it, and HubSpot turns that into a CDN
// address when the email renders. So an export with local pictures becomes a folder, `exports/<slug>/`, holding
// the template, an `images/` folder with every picture it shows, and a README saying how the folder goes up:
// dropped into Design Manager whole, or pushed with the CLI. Only the pictures the template shows travel, and a
// template whose pictures are all hosted already exports as the single file it always did.
//
// Pure. The bytes are the app's business (App.tsx); the folder or the zip is the workspace's.

export const IMAGES_DIR = 'images';

/**
 * A source an email client can fetch, or one HubSpot fills in: a URL, inline data, or HubL. Anything else is a
 * file on somebody's machine. The `local-image` check and the package agree on this by sharing it.
 */
export const isRemoteSrc = (src: string): boolean => /^(https?:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('{{') || src.startsWith('{%');

const IMG_SRC = /(<img\b[^>]*\bsrc=")([^"]*)(")/g;
/**
 * A HubSpot module tag, whose defaults may carry a picture too: an editable image compiles to
 * `{% module "image" path="@hubspot/image_email", img={ "src": "photos/hero.png", ... } %}`, and the team's picker
 * shows that default until someone picks another. Its `"src"` values are pictures as much as an `<img>`'s.
 */
const MODULE_TAG = /\{%\s*module\b[\s\S]*?%\}/g;
const MODULE_SRC = /("src"\s*:\s*)"([^"]*)"/g;

/** Every distinct local picture source in compiled HTML, `<img>` tags and module defaults both, in the order first seen. */
export function localSources(html: string): string[] {
  const out: string[] = [];
  const note = (src: string | undefined) => {
    if (src && !isRemoteSrc(src) && !out.includes(src)) out.push(src);
  };
  for (const [, , src] of html.matchAll(IMG_SRC)) note(src);
  for (const [tag] of html.matchAll(MODULE_TAG)) for (const [, , src] of tag.matchAll(MODULE_SRC)) note(src);
  return out;
}

/**
 * The file name a picture gets inside `images/`: its own name, flattened out of its folder and made safe for
 * Design Manager (lower case, letters, digits, dots and dashes), and kept apart from the others: `hero-2.png`.
 */
export function packagedName(src: string, taken: Iterable<string> = []): string {
  const base = src.split('/').pop() ?? src;
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const ext = dot > 0 ? base.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
  const used = new Set(taken);
  let name = `${stem || 'picture'}${ext}`;
  for (let n = 2; used.has(name); n += 1) name = `${stem || 'picture'}-${n}${ext}`;
  return name;
}

/** How a packed picture is named inside a HubL expression: HubSpot resolves the path against the template's own place. */
export const assetCall = (file: string): string => `get_asset_url('./${IMAGES_DIR}/${file}')`;
/** The same, printed into an attribute of the HTML. */
export const assetUrl = (file: string): string => `{{ ${assetCall(file)} }}`;

export interface PackagedPicture {
  /** As the document names it: `photos/hero.png`. */
  src: string;
  /** Its name inside `images/`. */
  file: string;
}

export interface ExportPlan {
  /** The template, every packed picture pointing at its copy. */
  html: string;
  /** The pictures to pack, in the order the template shows them. */
  pictures: PackagedPicture[];
  /** Local pictures left as they were, because `pack` said no: not in the folder, so nothing to copy. */
  left: string[];
}

/**
 * The template's HTML with every local picture that `pack` allows pointed at its packaged copy, and the list of
 * those copies. A picture `pack` refuses stays a local name in the file, which is what the `local-image` check
 * then reports: the export cannot pack what the folder does not have.
 */
export function planPackage(html: string, pack: (src: string) => boolean = () => true): ExportPlan {
  const pictures: PackagedPicture[] = [];
  const left: string[] = [];
  const byNames = new Map<string, string>();
  for (const src of localSources(html)) {
    if (!pack(src)) {
      left.push(src);
      continue;
    }
    const file = packagedName(src, byNames.values());
    byNames.set(src, file);
    pictures.push({ src, file });
  }
  const rewritten = html
    .replace(IMG_SRC, (whole, before: string, src: string, after: string) => {
      const file = byNames.get(src);
      return file ? `${before}${assetUrl(file)}${after}` : whole;
    })
    // Inside a module tag the value is an expression, so the call stands unquoted where the string was.
    .replace(MODULE_TAG, (tag) =>
      tag.replace(MODULE_SRC, (whole, before: string, src: string) => {
        const file = byNames.get(src);
        return file ? `${before}${assetCall(file)}` : whole;
      }),
    );
  return { html: rewritten, pictures, left };
}

/** The README that travels in the folder: what is in it, and the two ways it goes into HubSpot. */
export function packageReadme({ name, slug, templateFile, pictures, exportedAt }: { name: string; slug: string; templateFile: string; pictures: PackagedPicture[]; exportedAt: Date }): string {
  const rows = pictures.map((p) => `| \`${p.src}\` | \`${IMAGES_DIR}/${p.file}\` |`).join('\n');
  const count = `${pictures.length} picture${pictures.length === 1 ? '' : 's'}`;
  return `# ${name}

Exported from Template Studio on ${exportedAt.toISOString().slice(0, 10)}.

- \`${templateFile}\`: the HubSpot coded email template.
- \`${IMAGES_DIR}/\`: the ${count} it shows. The template points at them with \`get_asset_url\`, so they have to be
  uploaded beside it, in this folder, as they are. Move the template on its own and the pictures break.

## Into HubSpot

**Design Manager.** Content › Design Manager. Upload this whole folder, keeping \`${IMAGES_DIR}/\` inside it. Open the
template once so it validates, then publish.

**The HubSpot CLI.** From the \`exports/\` folder:

    hs upload ${slug} @hubspot/emails/${slug}

Then open it in Design Manager once and publish.

## The pictures

| In the email | In this folder |
|---|---|
${rows}
`;
}
